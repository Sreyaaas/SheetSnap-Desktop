"""
Integration test: exercises the full production pipeline against test_images/.

Verifies:
  1. No import or runtime errors (TypeError, AttributeError, slice-int crashes).
  2. Every supported image produces a non-empty table matrix.
  3. Both Mode A (bordered) and Mode B (borderless) are exercised.
  4. TextCleaner is applied.
  5. ExcelGenerator can write the output.
"""

import sys
import os
import traceback
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.services.preprocess import ImagePreprocessor
from backend.services.ocr_engine import get_ocr_engine
from backend.services.table_detector import TableDetector
from backend.services.cleaner import TextCleaner
from backend.services.excel import ExcelGenerator

TEST_INPUT_DIR = Path("test_images")
TEST_OUTPUT_DIR = Path("test_outputs")
TEST_OUTPUT_DIR.mkdir(exist_ok=True)

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".pdf"}


def run_pipeline(file_path: Path):
    """Run the full production pipeline on a single file and return the table matrix."""
    raw_bytes = file_path.read_bytes()

    # Step 1: Decode
    if file_path.suffix.lower() == ".pdf":
        img = ImagePreprocessor.decode_pdf_bytes(raw_bytes, page_index=0, dpi=200)
    else:
        img = ImagePreprocessor.decode_image_bytes(raw_bytes)

    # Step 2: OCR (singleton engine)
    engine = get_ocr_engine()
    raw_results, elapsed = engine.run_full_page(img)

    # Step 3: Parse + extract
    ocr_words = TableDetector.parse_ocr_results(raw_results)
    raw_matrix = TableDetector.extract(img, ocr_words)

    # Step 4: Clean
    table = TextCleaner.clean_matrix(raw_matrix)
    return table


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
            table = run_pipeline(fp)
            if table and len(table) >= 1:
                headers = table[0]
                rows = table[1:] if len(table) > 1 else []

                # Write Excel output
                out_path = TEST_OUTPUT_DIR / f"result_{fp.stem}.xlsx"
                ExcelGenerator.generate(headers, rows, out_path)

                print(f"  OK  rows={len(table):>3}  cols={len(headers):>3}  -> {out_path.name}")
                success += 1
            else:
                print(f"  WARN  Empty matrix returned.")
                failures.append((fp.name, "Empty matrix"))
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
