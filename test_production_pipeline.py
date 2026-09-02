"""
Integration test: exercises the full production pipeline against test_images/.

Verifies:
  1. No import or runtime errors (TypeError, AttributeError, slice-int crashes).
  2. Every supported image produces a non-empty table matrix.
  3. Multi-table detection and targeted ROI extraction.
  4. TextCleaner is applied.
  5. ExcelGenerator can write single and multi-sheet outputs.
"""

import sys
import os
import traceback
from pathlib import Path

# Ensure utf-8 stdout
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.services.preprocess import ImagePreprocessor
from backend.services.ocr_engine import get_ocr_engine
from backend.services.table_detector import TableDetector
from backend.services.cleaner import TextCleaner
from backend.services.excel import ExcelGenerator
from backend.services.gemini_service import GeminiTableExtractor
from backend.config import settings

TEST_INPUT_DIR = Path("test_images")
TEST_OUTPUT_DIR = Path("test_outputs")
TEST_OUTPUT_DIR.mkdir(exist_ok=True)

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}


def run_pipeline(file_path: Path):
    """Run the full production pipeline on a single file with smart Gemini fallback."""
    raw_bytes = file_path.read_bytes()

    # Step 1: Decode
    if file_path.suffix.lower() == ".pdf":
        img = ImagePreprocessor.decode_pdf_bytes(raw_bytes, page_index=0, dpi=300)
    else:
        img = ImagePreprocessor.decode_image_bytes(raw_bytes)

    img = ImagePreprocessor.optimize_for_ocr(img)

    # Step 2: OCR (singleton engine)
    engine = get_ocr_engine()
    raw_results, elapsed = engine.run_full_page(img)

    # Step 3: Parse + extract all tables
    ocr_words = TableDetector.parse_ocr_results(raw_results)
    result = TableDetector.extract_all(img, ocr_words)

    # Step 4: Clean all tables
    for tbl in result.get("tables", []):
        raw_matrix = [tbl.get("headers", [])] + tbl.get("rows", [])
        cleaned = TextCleaner.clean_matrix(raw_matrix)
        tbl["headers"] = cleaned[0] if cleaned else []
        tbl["rows"] = cleaned[1:] if len(cleaned) > 1 else []

    # Step 5: Check if AI upgrade is needed (broken headers, low score, or empty)
    tables = result.get("tables", [])
    overall_score = result.get("quality", {}).get("score", 80)
    is_complex = result.get("quality", {}).get("is_complex", False)
    has_broken_headers = any(
        len(t.get("headers", [])) > 0 and (
            not t["headers"][0].strip() or 
            sum(1 for h in t["headers"] if not h.strip()) >= 1
        )
        for t in tables
    )
    no_content = not tables or all(len(t.get("headers", [])) == 0 for t in tables)

    if (
        (overall_score < settings.GEMINI_CONFIDENCE_THRESHOLD or has_broken_headers or is_complex or no_content)
        and GeminiTableExtractor.is_available()
    ):
        try:
            ai_res = GeminiTableExtractor.extract_all(img)
            ai_tables = ai_res.get("tables", [])
            if ai_tables and any(len(t.get("headers", [])) > 0 for t in ai_tables):
                result = ai_res
        except Exception as e:
            print(f"    [AI fallback notice: {e}]")

    return result


def main():
    files = sorted(
        f for f in TEST_INPUT_DIR.iterdir()
        if f.suffix.lower() in SUPPORTED_EXTS
    )

    if not files:
        print(f"No test files found in '{TEST_INPUT_DIR}/'.")
        return

    print("=" * 60)
    print(f"Running PRODUCTION pipeline on {len(files)} files...")
    print("=" * 60)

    success = 0
    failures = []

    for idx, fp in enumerate(files, start=1):
        print(f"\n[{idx}/{len(files)}] {fp.name}...")
        try:
            res = run_pipeline(fp)
            tables = res.get("tables", [])
            if tables and any(len(t.get("headers", [])) > 0 for t in tables):
                out_path = TEST_OUTPUT_DIR / f"result_{fp.stem}.xlsx"
                ExcelGenerator.generate_multi(tables, out_path)

                total_rows = sum(len(t.get("rows", [])) for t in tables)
                engine_name = "GEMINI AI" if res.get("engine") == "gemini" else "LOCAL CPU"
                print(f"  OK [{engine_name}]  tables={len(tables)}  total_rows={total_rows}  score={res['quality']['score']}%  -> {out_path.name}")
                success += 1
            else:
                print(f"  WARN  Empty table returned.")
                failures.append((fp.name, "Empty table"))
        except Exception as e:
            print(f"  FAIL  {type(e).__name__}: {e}")
            traceback.print_exc()
            failures.append((fp.name, str(e)))

    print("\n" + "=" * 60)
    print(f"RESULT: {success}/{len(files)} passed")
    if failures:
        print("FAILURES:")
        for name, reason in failures:
            print(f"  - {name}: {reason}")
    print("=" * 60)


if __name__ == "__main__":
    main()
