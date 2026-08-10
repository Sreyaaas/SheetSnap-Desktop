from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import uuid
import os
import cv2
import numpy as np
import fitz  # PyMuPDF for PDF support

from backend.config import settings
from backend.services.table_detector import TableDetector
from backend.services.ocr_engine import get_ocr_engine
from backend.services.excel import ExcelGenerator

router = APIRouter()

class ExportRequest(BaseModel):
    headers: List[str]
    rows: List[List[str]]

@router.post("/extract")
async def extract_table(image: UploadFile = File(...)) -> Dict[str, Any]:
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "application/pdf"]
    filename = image.filename.lower() if image.filename else "file.png"
    
    if not (any(filename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".pdf"])):
        raise HTTPException(status_code=400, detail="Unsupported file format. Upload JPG, PNG, or PDF.")

    temp_file_path = settings.TEMP_UPLOAD_DIR / f"upload_{uuid.uuid4().hex[:8]}"

    try:
        contents = await image.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        img = None

        if filename.endswith(".pdf") or image.content_type == "application/pdf":
            doc = fitz.open(stream=contents, filetype="pdf")
            if doc.page_count == 0:
                raise HTTPException(status_code=400, detail="PDF is empty.")
            
            page = doc[0]
            pix = page.get_pixmap(dpi=200)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            
            if pix.n == 4:
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
            elif pix.n == 3:
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        else:
            np_arr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")

        # Run RapidOCR engine
        ocr_engine = get_ocr_engine()
        raw_ocr_results, _ = ocr_engine.engine(img)

        # Extract structured table matrix
        table_data = TableDetector.extract_table_from_ocr(raw_ocr_results)

        if not table_data or len(table_data) < 1:
            raise HTTPException(status_code=422, detail="No table cells extracted.")

        headers = table_data[0]
        rows = table_data[1:] if len(table_data) > 1 else []

        return {"headers": headers, "rows": rows}

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")

    finally:
        if temp_file_path.exists():
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

@router.post("/export")
async def export_excel(payload: ExportRequest):
    try:
        filename = f"extracted_{uuid.uuid4().hex[:8]}.xlsx"
        file_path = settings.TEMP_OUTPUT_DIR / filename

        ExcelGenerator.generate(payload.headers, payload.rows, file_path)

        return FileResponse(
            path=file_path,
            filename="output.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")