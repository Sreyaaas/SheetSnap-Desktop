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
# POST /extract
# ---------------------------------------------------------------------------

@router.post("/extract")
async def extract_table(
    image: UploadFile = File(...),
    crop_boxes: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """
    Accept an image or PDF upload and optional ROI crop boxes.
    Runs offline OCR + multi-table discovery / targeted ROI extraction,
    and returns structured multi-table JSON with quality scoring.
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
        if crop_boxes:
            try:
                raw_parsed = json.loads(crop_boxes)
                if isinstance(raw_parsed, list):
                    parsed_custom_boxes = raw_parsed
                elif isinstance(raw_parsed, dict):
                    parsed_custom_boxes = [raw_parsed]
            except Exception as pe:
                logger.warning("Failed to parse crop_boxes JSON: %s", pe)

        # ----- Step 1: Run OCR (single pass) -----
        ocr_engine = get_ocr_engine()
        raw_results, elapsed = ocr_engine.run_full_page(img)

        logger.info("OCR completed — %d raw items.", len(raw_results) if raw_results else 0)

        # ----- Step 2: Parse OCR output into word tokens -----
        ocr_words = TableDetector.parse_ocr_results(raw_results)

        if not ocr_words:
            raise HTTPException(status_code=422, detail="No text detected in the uploaded document.")

        # ----- Step 3: Multi-table / Targeted ROI extraction -----
        extraction_result = TableDetector.extract_all(img, ocr_words, custom_boxes=parsed_custom_boxes)

        # ----- Step 4: Text cleanup across all extracted tables -----
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
        if not tables or all(len(t.get("headers", [])) == 0 and len(t.get("rows", [])) == 0 for t in tables):
            raise HTTPException(status_code=422, detail="No table structure could be extracted.")

        # Update top-level legacy fallback fields
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