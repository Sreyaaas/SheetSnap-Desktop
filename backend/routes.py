"""
SheetSnap REST API Routes.

Endpoints:
  POST /extract  — Upload an image/PDF (optional ROI crop_boxes) → get structured multi-table JSON + quality score.
  POST /export   — Send table JSON (single or multi-table) → download multi-sheet Excel file.

Fully offline, private, and stateless.
"""

import logging
import uuid
import os
import json
from typing import List, Dict, Any, Optional, Union

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.config import settings
from backend.services.preprocess import ImagePreprocessor
from backend.services.ocr_engine import get_ocr_engine
from backend.services.table_detector import TableDetector
from backend.services.cleaner import TextCleaner
from backend.services.excel import ExcelGenerator
from backend.services.gemini_service import GeminiTableExtractor
from backend.services.ai_tracker import AITracker

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class TablePayload(BaseModel):
    id: Optional[Union[int, str]] = 1
    title: Optional[str] = "Table 1"
    headers: List[str] = []
    rows: List[List[str]] = []


class ExportRequest(BaseModel):
    headers: Optional[List[str]] = None
    rows: Optional[List[List[str]]] = None
    tables: Optional[List[Dict[str, Any]]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}


def _safe_remove(path) -> None:
    """Best-effort file deletion (used as BackgroundTask)."""
    try:
        if path and os.path.exists(str(path)):
            os.remove(str(path))
    except Exception:
        pass


# ---------------------------------------------------------------------------
# GET /status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status() -> Dict[str, Any]:
    """Return backend operational status and AI model readiness."""
    return {
        "status": "healthy",
        "gemini_available": GeminiTableExtractor.is_available(),
        "gemini_model": settings.GEMINI_MODEL,
        "gemini_threshold": settings.GEMINI_CONFIDENCE_THRESHOLD,
        "ocr_language": settings.OCR_LANGUAGE,
    }


# ---------------------------------------------------------------------------
# GET & POST /analytics
# ---------------------------------------------------------------------------

@router.get("/analytics")
async def get_ai_analytics() -> Dict[str, Any]:
    """Return comprehensive Gemini AI usage telemetry, quotas, and invocation logs."""
    stats = AITracker.get_stats()
    stats["gemini_available"] = GeminiTableExtractor.is_available()
    stats["gemini_model"] = settings.GEMINI_MODEL
    return stats


@router.post("/analytics/reset")
async def reset_ai_analytics() -> Dict[str, Any]:
    """Reset telemetry metrics."""
    return AITracker.reset_stats()


# ---------------------------------------------------------------------------
# POST /extract
# ---------------------------------------------------------------------------

@router.post("/extract")
async def extract_table(
    image: UploadFile = File(...),
    crop_boxes: Optional[str] = Form(None),
    mode: Optional[str] = Form("auto"),  # "auto" | "local" | "ai"
    confidence_threshold: Optional[int] = Form(None),
) -> Dict[str, Any]:
    """
    Accept an image or PDF upload and optional ROI crop boxes.
    Runs offline OCR + multi-table discovery / targeted ROI extraction,
    with smart automatic fallback to Gemini Flash VLM for low-confidence/complex
    tables, or forced Gemini AI extraction when mode == 'ai'.
    """
    filename = (image.filename or "file.png").lower()
    ext = os.path.splitext(filename)[1]

    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Upload JPG, PNG, WebP, or PDF.",
        )

    try:
        contents = await image.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # ----- Decode & Optimize image -----
        if ext == ".pdf" or image.content_type == "application/pdf":
            img = ImagePreprocessor.decode_pdf_bytes(contents, page_index=0, dpi=300)
        else:
            img = ImagePreprocessor.decode_image_bytes(contents)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid or corrupted image file.")

        # Optimize for OCR (intelligent bounded upscaling and deskewing)
        img = ImagePreprocessor.optimize_for_ocr(img)

        # Parse optional user-provided crop boxes
        parsed_custom_boxes = None
        if crop_boxes and isinstance(crop_boxes, str):
            try:
                raw_parsed = json.loads(crop_boxes)
                if isinstance(raw_parsed, list):
                    parsed_custom_boxes = raw_parsed
                elif isinstance(raw_parsed, dict):
                    parsed_custom_boxes = [raw_parsed]
            except Exception as pe:
                logger.warning("Failed to parse crop_boxes JSON: %s", pe)

        # Safely resolve mode and threshold parameters
        if mode is not None and not hasattr(mode, "default"):
            selected_mode = str(mode).lower().strip()
        else:
            selected_mode = "auto"

        if confidence_threshold is not None and not hasattr(confidence_threshold, "default"):
            try:
                threshold = int(confidence_threshold)
            except Exception:
                threshold = int(settings.GEMINI_CONFIDENCE_THRESHOLD)
        else:
            threshold = int(settings.GEMINI_CONFIDENCE_THRESHOLD)

        # =====================================================================
        # Branch 1: Forced AI Mode (Direct Gemini VLM invocation)
        # =====================================================================
        if selected_mode == "ai":
            if not GeminiTableExtractor.is_available():
                raise HTTPException(
                    status_code=400,
                    detail="Gemini API Key is not configured. Please add GEMINI_API_KEY to your .env file to use AI mode.",
                )
            logger.info("Executing forced AI extraction via Gemini VLM (%s)...", settings.GEMINI_MODEL)
            gemini_result = GeminiTableExtractor.extract_all(img, custom_boxes=parsed_custom_boxes)
            return gemini_result

        # =====================================================================
        # Branch 2: Local Extraction Pipeline (100% Offline)
        # =====================================================================
        ocr_engine = get_ocr_engine()
        raw_results, elapsed = ocr_engine.run_full_page(img)
        elapsed_sec = sum(elapsed) if isinstance(elapsed, (list, tuple)) else float(elapsed or 0.0)
        logger.info("OCR completed in %.2fs — %d raw items.", elapsed_sec, len(raw_results) if raw_results else 0)

        ocr_words = TableDetector.parse_ocr_results(raw_results)
        
        # If no text found locally and mode is auto with Gemini available, try Gemini
        if not ocr_words:
            if selected_mode == "auto" and GeminiTableExtractor.is_available():
                logger.info("No local OCR text found. Attempting Gemini AI fallback...")
                try:
                    return GeminiTableExtractor.extract_all(img, custom_boxes=parsed_custom_boxes)
                except Exception as g_err:
                    logger.warning("Gemini fallback after empty OCR failed: %s", g_err)
            raise HTTPException(status_code=422, detail="No text detected in the uploaded document.")

        # Multi-table / Targeted ROI extraction
        extraction_result = TableDetector.extract_all(img, ocr_words, custom_boxes=parsed_custom_boxes)

        # Text cleanup across all extracted tables
        for tbl in extraction_result.get("tables", []):
            raw_matrix = [tbl.get("headers", [])] + tbl.get("rows", [])
            cleaned = TextCleaner.clean_matrix(raw_matrix)
            if cleaned and len(cleaned) > 0:
                tbl["headers"] = cleaned[0]
                tbl["rows"] = cleaned[1:] if len(cleaned) > 1 else []
            else:
                tbl["headers"] = []
                tbl["rows"] = []

        tables = extraction_result.get("tables", [])
        overall_score = extraction_result.get("quality", {}).get("score", 80)
        is_complex = extraction_result.get("quality", {}).get("is_complex", False)
        no_content = not tables or all(
            len(t.get("headers", [])) == 0 and len(t.get("rows", [])) == 0 for t in tables
        )

        # Check for bad header fragmentation or empty header columns in local result
        has_broken_headers = any(
            len(t.get("headers", [])) > 0 and (
                not t["headers"][0].strip() or 
                sum(1 for h in t["headers"] if not h.strip()) >= 1
            )
            for t in tables
        )

        # =====================================================================
        # Branch 3: Automatic AI Divert if score is below threshold, complex, or headers broken
        # =====================================================================
        if (
            selected_mode == "auto"
            and (overall_score < threshold or is_complex or has_broken_headers or no_content)
            and GeminiTableExtractor.is_available()
        ):
            logger.info(
                "Local extraction quality warning (score: %d%%, broken_headers: %s, complex: %s). Diverting to Gemini VLM (%s)...",
                overall_score,
                has_broken_headers,
                is_complex,
                settings.GEMINI_MODEL,
            )
            try:
                ai_result = GeminiTableExtractor.extract_all(img, custom_boxes=parsed_custom_boxes)
                ai_tables = ai_result.get("tables", [])
                if ai_tables and any(len(t.get("headers", [])) > 0 or len(t.get("rows", [])) > 0 for t in ai_tables):
                    ai_result["quality"]["diverted_from_local"] = True
                    ai_result["quality"]["local_score"] = overall_score
                    ai_result["quality"]["message"] = (
                        f"Local engine detected header fragmentation. Automatically upgraded via {settings.GEMINI_MODEL} for precision."
                    )
                    return ai_result
            except Exception as divert_err:
                logger.warning("Auto-divert to Gemini failed: %s. Returning local extraction.", divert_err)

        if no_content:
            raise HTTPException(status_code=422, detail="No table structure could be extracted.")

        # Update top-level legacy fallback fields
        extraction_result["engine"] = "local"
        extraction_result["headers"] = tables[0]["headers"] if tables else []
        extraction_result["rows"] = tables[0]["rows"] if tables else []

        return extraction_result

    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.exception("Unexpected error in /extract")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


# ---------------------------------------------------------------------------
# POST /export
# ---------------------------------------------------------------------------

@router.post("/export")
async def export_excel(payload: ExportRequest, background_tasks: BackgroundTasks):
    """
    Accept structured single or multi-table JSON and return a downloadable Excel file.
    Creates multiple named worksheets if multiple tables exist.
    """
    try:
        filename = f"extracted_{uuid.uuid4().hex[:8]}.xlsx"
        file_path = settings.TEMP_OUTPUT_DIR / filename

        # Check if multi-table payload or single table
        if payload.tables and len(payload.tables) > 1:
            ExcelGenerator.generate_multi(payload.tables, file_path)
        elif payload.tables and len(payload.tables) == 1:
            tbl = payload.tables[0]
            ExcelGenerator.generate(tbl.get("headers", []), tbl.get("rows", []), file_path)
        else:
            headers = payload.headers or []
            rows = payload.rows or []
            ExcelGenerator.generate(headers, rows, file_path)

        # Schedule cleanup AFTER streaming
        background_tasks.add_task(_safe_remove, file_path)

        return FileResponse(
            path=str(file_path),
            filename="output.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        logger.exception("Unexpected error in /export")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")