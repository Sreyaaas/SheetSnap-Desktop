"""
Standalone comparison test for yyy.png:
Compares Local OCR vs Google Gemini Flash AI extraction.
"""
import io
import sys
import asyncio
from pathlib import Path

# Ensure UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.path.insert(0, str(Path(__file__).resolve().parent))

import cv2
from backend.services.preprocess import ImagePreprocessor
from backend.services.ocr_engine import get_ocr_engine
from backend.services.table_detector import TableDetector
from backend.services.cleaner import TextCleaner
from backend.services.gemini_service import GeminiTableExtractor
from backend.services.excel import ExcelGenerator

def main():
    img_path = Path("test_images/17_doc_yyy.png")
    if not img_path.exists():
        print(f"Error: {img_path} not found.")
        return

    print("=================================================================")
    print(f"  Testing Table Extraction on: {img_path.name}")
    print("=================================================================")

    # 1. Local OCR Extraction
    print("\n--- [1] RUNNING LOCAL OFFLINE OCR PIPELINE ---")
    img_bgr = cv2.imread(str(img_path))
    engine = get_ocr_engine()
    raw_results, _ = engine.run_full_page(img_bgr)
    words = TableDetector.parse_ocr_results(raw_results)
    local_res = TableDetector.extract_all(img_bgr, words)

    for tbl in local_res.get("tables", []):
        raw_matrix = [tbl.get("headers", [])] + tbl.get("rows", [])
        cleaned = TextCleaner.clean_matrix(raw_matrix)
        tbl["headers"] = cleaned[0] if cleaned else []
        tbl["rows"] = cleaned[1:] if len(cleaned) > 1 else []

    local_tbl = local_res["tables"][0]
    print(f"Local Quality Score: {local_res.get('quality', {}).get('score')}%")
    print(f"Local Headers: {local_tbl['headers']}")
    print("Local First 3 Rows:")
    for r in local_tbl["rows"][:3]:
        print("  ", r)

    # 2. Gemini AI Extraction
    print("\n--- [2] RUNNING GOOGLE GEMINI FLASH AI PIPELINE ---")
    if not GeminiTableExtractor.is_available():
        print("❌ Gemini is NOT available. Check GEMINI_API_KEY in .env")
        return

    ai_res = GeminiTableExtractor.extract_all(img_bgr)
    ai_tbl = ai_res["tables"][0]
    print(f"AI Engine: {ai_res.get('engine')} ({ai_res.get('model')})")
    print(f"AI Headers: {ai_tbl['headers']}")
    print("AI Extracted Rows:")
    for r in ai_tbl["rows"]:
        print("  ", r)

    # 3. Save AI Output to Excel
    out_path = Path("test_outputs/result_17_doc_yyy.xlsx")
    ExcelGenerator.generate_multi(ai_res["tables"], out_path)
    print(f"\n✅ Clean Gemini AI table successfully written to: {out_path}")
    print("=================================================================")

if __name__ == "__main__":
    main()
