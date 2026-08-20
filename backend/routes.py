"""
SheetSnap REST API Routes.

Two endpoints:
  POST /extract  — Upload an image/PDF → get structured table JSON.
  POST /export   — Send table JSON → download Excel file.

Both endpoints are fully offline and stateless.
"""

import logging
import uuid
import os
from typing import List, Dict, Any

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
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

class ExportRequest(BaseModel):
    headers: List[str]
    rows: List[List[str]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}


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
async def extract_table(image: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Accept an image or PDF upload, run the offline OCR + table extraction
    pipeline, and return structured JSON: { headers: string[], rows: string[][] }.
    """
    filename = (image.filename or "file.png").lower()
    ext = os.path.splitext(filename)[1]

    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Upload JPG, PNG, or PDF.",
        )

    try:
        contents = await image.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # ----- Decode image -----
        if ext == ".pdf" or image.content_type == "application/pdf":
            img = ImagePreprocessor.decode_pdf_bytes(contents, page_index=0, dpi=200)
        else:
            img = ImagePreprocessor.decode_image_bytes(contents)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid or corrupted image file.")

        # ----- Step 1: Run OCR (single pass) -----
        ocr_engine = get_ocr_engine()
        raw_results, elapsed = ocr_engine.run_full_page(img)

        logger.info("OCR completed — %d raw items.", len(raw_results) if raw_results else 0)

        # ----- Step 2: Parse OCR output into word tokens -----
        ocr_words = TableDetector.parse_ocr_results(raw_results)

        if not ocr_words:
            raise HTTPException(status_code=422, detail="No text detected in the uploaded document.")

        # ----- Step 3: Dual-pass table extraction -----
        raw_matrix = TableDetector.extract(img, ocr_words)

        # ----- Step 4: Text cleanup -----
        table_data = TextCleaner.clean_matrix(raw_matrix)

        if not table_data or len(table_data) < 1:
            raise HTTPException(status_code=422, detail="No table structure could be extracted.")

        headers = table_data[0]
        rows = table_data[1:] if len(table_data) > 1 else []

        return {"headers": headers, "rows": rows}

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
    Accept structured table JSON and return a downloadable Excel file.
    Temporary file is automatically deleted after the response is sent.
    """
    try:
        filename = f"extracted_{uuid.uuid4().hex[:8]}.xlsx"
        file_path = settings.TEMP_OUTPUT_DIR / filename

        ExcelGenerator.generate(payload.headers, payload.rows, file_path)

        # Schedule cleanup AFTER FastAPI has finished streaming the response
        background_tasks.add_task(_safe_remove, file_path)

        return FileResponse(
            path=str(file_path),
            filename="output.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        logger.exception("Unexpected error in /export")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")