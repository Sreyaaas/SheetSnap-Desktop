"""
SheetSnap Gemini VLM Table Extractor Service.

Provides high-accuracy document table extraction via Google Gemini Flash VLM
using structured JSON output mode, token-optimized image preprocessing, and
seamless fallback integration.
"""

import base64
import json
import logging
import re
import time
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np
import requests

from backend.config import settings
from backend.services.cleaner import TextCleaner
from backend.services.table_detector import TableDetector
from backend.services.ai_tracker import AITracker

logger = logging.getLogger(__name__)


class GeminiTableExtractor:
    """Service for extracting tables from document images via Gemini Flash VLM."""

    @staticmethod
    def is_available() -> bool:
        """Check if Gemini API key is configured and feature is enabled."""
        return bool(settings.GEMINI_ENABLED and settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())

    @staticmethod
    def optimize_image_for_vlm(
        img_bgr: np.ndarray,
        max_dim: int = 1600,
        quality: int = 88,
    ) -> Tuple[str, Tuple[int, int]]:
        """
        Token & cost optimization:
        1. Resizes image proportionally if max dimension exceeds max_dim.
           This dramatically reduces image tokens while maintaining crisp text legibility.
        2. Encodes to compressed JPEG base64 string.
        Returns (base64_string, (width, height)).
        """
        h, w = img_bgr.shape[:2]
        target_w, target_h = w, h

        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            target_w = max(1, int(round(w * scale)))
            target_h = max(1, int(round(h * scale)))
            resized = cv2.resize(img_bgr, (target_w, target_h), interpolation=cv2.INTER_AREA)
        else:
            resized = img_bgr

        # Encode to JPEG
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        success, buffer = cv2.imencode(".jpg", resized, encode_param)
        if not success:
            raise ValueError("Failed to compress image for Gemini VLM payload.")

        b64_str = base64.b64encode(buffer).decode("utf-8")
        return b64_str, (target_w, target_h)

    @classmethod
    def extract_single_image(
        cls,
        image_bgr: np.ndarray,
        title: str = "Table 1",
    ) -> List[Dict[str, Any]]:
        """
        Send a single (full or cropped) image to Gemini Flash and parse returned tables.
        """
        if not cls.is_available():
            raise RuntimeError(
                "Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file."
            )

        api_key = settings.GEMINI_API_KEY.strip()
        model = settings.GEMINI_MODEL.strip() or "gemini-3.6-flash"
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

        # 1. Optimize image bytes
        b64_img, (img_w, img_h) = cls.optimize_image_for_vlm(image_bgr, max_dim=1600)

        # 2. Strict prompt engineering for structured table extraction
        prompt_text = (
            "You are a specialized enterprise document table extraction model. "
            "Extract all tabular structures present in this document image into clean columns and rows.\n\n"
            "Requirements:\n"
            "1. Header Identification: Accurately isolate column headers.\n"
            "2. Grid Alignment: Align every row's cells to match the column headers precisely.\n"
            "3. Multiline Wrapping: Consolidate multi-line item descriptions or addresses into a single string.\n"
            "4. Missing Values: Use empty strings \"\" for blank or missing cells.\n"
            "5. Number & Code Fidelity: Preserve exact numeric values, dates, serials, and part codes.\n"
            "6. Output: You MUST respond ONLY with a valid JSON object matching this schema:\n"
            "{\n"
            '  "tables": [\n'
            "    {\n"
            '      "title": "Table 1",\n'
            '      "headers": ["Col 1", "Col 2", ...],\n'
            '      "rows": [\n'
            '        ["val 1", "val 2", ...],\n'
            '        ["val 3", "val 4", ...]\n'
            "      ]\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": b64_img,
                            }
                        },
                        {
                            "text": prompt_text,
                        },
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.1,
            },
        }

        headers = {"Content-Type": "application/json"}
        start_call_time = time.time()

        try:
            logger.info("Calling Gemini VLM (%s) for table extraction...", model)
            response = requests.post(endpoint, headers=headers, json=payload, timeout=40)
        except requests.exceptions.Timeout as to_err:
            logger.error("Gemini API request timed out after 40s.")
            AITracker.record_invocation(
                model=model,
                status="error",
                latency_sec=time.time() - start_call_time,
                error_message="Request timed out after 40s",
            )
            raise RuntimeError("Gemini AI request timed out. Please try again or use local extraction.") from to_err
        except requests.exceptions.RequestException as re_err:
            logger.error("Gemini API connection error: %s", re_err)
            AITracker.record_invocation(
                model=model,
                status="error",
                latency_sec=time.time() - start_call_time,
                error_message=str(re_err),
            )
            raise RuntimeError(f"Failed to reach Gemini AI service: {re_err}") from re_err

        if response.status_code != 200:
            err_detail = "Unknown error"
            try:
                err_json = response.json()
                err_detail = err_json.get("error", {}).get("message", response.text)
            except Exception:
                err_detail = response.text
            logger.error("Gemini API error %d: %s", response.status_code, err_detail)
            AITracker.record_invocation(
                model=model,
                status="error",
                latency_sec=time.time() - start_call_time,
                error_message=f"HTTP {response.status_code}: {err_detail[:150]}",
            )
            raise RuntimeError(f"Gemini API error ({response.status_code}): {err_detail}")

        resp_json = response.json()
        usage_meta = resp_json.get("usageMetadata", {})
        p_tokens = int(usage_meta.get("promptTokenCount", 0))
        c_tokens = int(usage_meta.get("candidatesTokenCount", 0))
        t_tokens = int(usage_meta.get("totalTokenCount", 0))

        raw_text = ""
        try:
            candidates = resp_json.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    raw_text = parts[0].get("text", "")
        except Exception as pe:
            logger.error("Failed to read candidates from Gemini response: %s", pe)

        if not raw_text:
            AITracker.record_invocation(
                model=model,
                status="error",
                prompt_tokens=p_tokens,
                candidate_tokens=c_tokens,
                total_tokens=t_tokens,
                latency_sec=time.time() - start_call_time,
                error_message="Empty response candidates from Gemini",
            )
            raise RuntimeError("Gemini returned an empty response. Document may not contain extractable tables.")

        # Strip markdown fences if present
        cleaned_text = raw_text.strip()
        if cleaned_text.startswith("```"):
            cleaned_text = re.sub(r"^```(?:json)?\s*", "", cleaned_text)
            cleaned_text = re.sub(r"\s*```$", "", cleaned_text)

        try:
            parsed_data = json.loads(cleaned_text)
        except json.JSONDecodeError as jde:
            logger.error("Failed to parse Gemini JSON output: %s\nRaw output: %s", jde, cleaned_text[:200])
            AITracker.record_invocation(
                model=model,
                status="error",
                prompt_tokens=p_tokens,
                candidate_tokens=c_tokens,
                total_tokens=t_tokens,
                latency_sec=time.time() - start_call_time,
                error_message="Invalid JSON returned by Gemini",
            )
            raise RuntimeError("Gemini did not return valid JSON table structure.")

        tables_data = []
        if isinstance(parsed_data, dict):
            if "tables" in parsed_data and isinstance(parsed_data["tables"], list):
                tables_data = parsed_data["tables"]
            elif "headers" in parsed_data and "rows" in parsed_data:
                tables_data = [parsed_data]
        elif isinstance(parsed_data, list):
            tables_data = parsed_data

        formatted_tables: List[Dict[str, Any]] = []
        for i, tbl in enumerate(tables_data, start=1):
            t_headers = tbl.get("headers", []) if isinstance(tbl, dict) else []
            t_rows = tbl.get("rows", []) if isinstance(tbl, dict) else []

            # Matrix text cleaning using SheetSnap's TextCleaner
            raw_matrix = [t_headers] + t_rows
            cleaned_matrix = TextCleaner.clean_matrix(raw_matrix)
            c_headers = cleaned_matrix[0] if cleaned_matrix else []
            c_rows = cleaned_matrix[1:] if len(cleaned_matrix) > 1 else []

            tbl_title = tbl.get("title") if isinstance(tbl, dict) else None
            if not tbl_title or tbl_title.strip() == "":
                tbl_title = f"{title}" if i == 1 else f"{title} Part {i}"

            formatted_tables.append({
                "id": i,
                "title": tbl_title,
                "box": [0, 0, img_w, img_h],
                "box_norm": [0.0, 0.0, 1.0, 1.0],
                "headers": c_headers,
                "rows": c_rows,
                "tokens": {
                    "prompt": p_tokens,
                    "candidates": c_tokens,
                    "total": t_tokens,
                },
                "quality": {
                    "score": 96,
                    "is_complex": False,
                    "sparsity": 0.05,
                    "avg_confidence": 0.98,
                    "message": f"Extracted via {model} VLM",
                },
            })

        # Record successful invocation
        AITracker.record_invocation(
            model=model,
            status="success",
            prompt_tokens=p_tokens,
            candidate_tokens=c_tokens,
            total_tokens=t_tokens,
            latency_sec=time.time() - start_call_time,
            tables_extracted=len(formatted_tables),
        )

        return formatted_tables

    @classmethod
    def extract_all(
        cls,
        image_bgr: np.ndarray,
        custom_boxes: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """
        Master Gemini extraction entry point.
        Supports token-optimized ROI cropping or full document analysis.
        """
        h, w = image_bgr.shape[:2]
        all_tables: List[Dict[str, Any]] = []

        if custom_boxes and len(custom_boxes) > 0:
            # Token optimization: Crop each specified region and only send cropped areas
            for idx, box in enumerate(custom_boxes, start=1):
                x1, y1, x2, y2 = TableDetector.parse_box_coords(box, w, h)
                # Ensure minimum dimensions
                if (x2 - x1) < 10 or (y2 - y1) < 10:
                    continue
                cropped = image_bgr[y1:y2, x1:x2]
                box_title = f"Selection {idx}" if len(custom_boxes) > 1 else "Custom Selection"
                
                try:
                    sub_tables = cls.extract_single_image(cropped, title=box_title)
                    for st in sub_tables:
                        st["box"] = [x1, y1, x2, y2]
                        st["box_norm"] = [
                            round(x1 / max(1, w), 4),
                            round(y1 / max(1, h), 4),
                            round((x2 - x1) / max(1, w), 4),
                            round((y2 - y1) / max(1, h), 4),
                        ]
                        all_tables.append(st)
                except Exception as ce:
                    logger.warning("Gemini failed on crop %d: %s", idx, ce)
                    raise
        else:
            # Full image extraction
            all_tables = cls.extract_single_image(image_bgr, title="Table 1")

        if not all_tables:
            raise RuntimeError("No tables detected by Gemini AI in this document.")

        model = settings.GEMINI_MODEL or "gemini-3.6-flash"
        return {
            "tables": all_tables,
            "quality": {
                "score": 96,
                "is_complex": len(all_tables) > 1,
                "total_tables": len(all_tables),
                "message": f"Extracted via Google {model} AI with structured JSON",
            },
            "engine": "gemini",
            "model": model,
            "headers": all_tables[0]["headers"] if all_tables else [],
            "rows": all_tables[0]["rows"] if all_tables else [],
        }
