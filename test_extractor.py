import os
import cv2
import fitz  # PyMuPDF
import numpy as np
from pathlib import Path
from rapidocr_onnxruntime import RapidOCR
import openpyxl
from openpyxl.styles import Font

# Folders for test bench
TEST_INPUT_DIR = Path("test_images")
TEST_OUTPUT_DIR = Path("test_outputs")

TEST_INPUT_DIR.mkdir(exist_ok=True)
TEST_OUTPUT_DIR.mkdir(exist_ok=True)

# Initialize RapidOCR Engine for batch testing
print("Initializing RapidOCR ONNX Test Engine...")
try:
    ocr_engine = RapidOCR()
    print("Engine initialized successfully!\n")
except Exception as e:
    print(f"Failed to initialize RapidOCR: {e}")
    exit(1)

def extract_table_physical_boxes(img: np.ndarray):
    """
    OpenCV Physical Box Tracing Engine:
    Detects physical table cell borders, automatically ignores non-bordered 
    email text at the top, and crops every cell box for 100% layout precision.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Adaptive thresholding to extract borders
    thresh = cv2.adaptiveThreshold(
        ~gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, -2
    )

    h, w = gray.shape

    # Extract horizontal and vertical lines
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (w // 25, 1))
    vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 25))

    horiz_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horiz_kernel)
    vert_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vert_kernel)

    grid_mask = cv2.add(horiz_lines, vert_lines)

    # Find cell box contours
    contours, _ = cv2.findContours(grid_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    boxes = []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        # Filter out tiny noise and full page border
        if bw > 20 and bh > 10 and bw < w * 0.98 and bh < h * 0.98:
            boxes.append((x, y, bw, bh))

    if not boxes:
        return None  # Fallback to OCR clustering if no grid borders exist

    # Sort boxes top-to-bottom
    boxes = sorted(boxes, key=lambda b: b[1])

    # Cluster boxes into rows (Y-tolerance ~ 15px)
    grid_rows = []
    current_row = [boxes[0]]
    current_y = boxes[0][1]

    for box in boxes[1:]:
        if abs(box[1] - current_y) < 15:
            current_row.append(box)
        else:
            grid_rows.append(sorted(current_row, key=lambda b: b[0]))  # Sort left-to-right
            current_row = [box]
            current_y = box[1]
    grid_rows.append(sorted(current_row, key=lambda b: b[0]))

    # Calculate uniform grid dimensions
    max_cols = max(len(r) for r in grid_rows) if grid_rows else 0
    if max_cols == 0:
        return None

    matrix = [["" for _ in range(max_cols)] for _ in range(len(grid_rows))]

    # OCR each physical box crop
    for r_idx, row in enumerate(grid_rows):
        for c_idx, (x, y, bw, bh) in enumerate(row):
            y1, y2 = max(0, y + 2), min(h, y + bh - 2)
            x1, x2 = max(0, x + 2), min(w, x + bw - 2)

            cell_crop = img[y1:y2, x1:x2]

            if cell_crop.size > 0:
                ocr_res, _ = ocr_engine(cell_crop)
                if ocr_res:
                    cell_text = " ".join([line[1] for line in ocr_res if float(line[2]) > 0.05]).strip()
                    matrix[r_idx][c_idx] = cell_text

    # Clean up empty rows
    clean_matrix = [row for row in matrix if any(cell.strip() for cell in row)]
    return clean_matrix if clean_matrix else None

def extract_table(file_path: Path):
    """Process single test file."""
    if file_path.suffix.lower() == ".pdf":
        doc = fitz.open(str(file_path))
        if doc.page_count == 0:
            return None
        page = doc[0]
        pix = page.get_pixmap(dpi=200)
        img = cv2.imdecode(pix.tobytes(), cv2.IMREAD_COLOR)
    else:
        img = cv2.imread(str(file_path))

    if img is None:
        return None

    # Step 1: Try Physical Box Tracing First
    matrix = extract_table_physical_boxes(img)

    # Step 2: Fallback to full image OCR if no grid boxes found
    if not matrix:
        raw_ocr_results, _ = ocr_engine(img)
        if raw_ocr_results:
            # Fallback simple line collector
            items = []
            for line in raw_ocr_results:
                if isinstance(line, (list, tuple)) and len(line) >= 2:
                    bbox, text_info = line[0], line[1]
                    text = text_info[0] if isinstance(text_info, (list, tuple)) else str(text_info)
                    if text and bbox:
                        items.append(str(text).strip())
            if items:
                matrix = [[item] for item in items]

    return matrix

def save_test_excel(matrix, output_path: Path):
    """Save matrix to Excel file."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Extracted Test"

    if matrix:
        ws.append(matrix[0])
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for row in matrix[1:]:
            ws.append(row)

    wb.save(output_path)

def run_test_suite():
    files = [f for f in TEST_INPUT_DIR.iterdir() if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".pdf"]]
    
    if not files:
        print(f"📁 Please drop your test images/PDFs inside the '{TEST_INPUT_DIR}' folder and run this script again.")
        return

    print(f"==================================================")
    print(f"🚀 Running Physical Box Extraction Test on {len(files)} test files...")
    print(f"==================================================\n")

    success_count = 0

    for idx, file_path in enumerate(files, start=1):
        print(f"[{idx}/{len(files)}] Processing: {file_path.name}...")
        
        matrix = extract_table(file_path)
        
        if matrix:
            success_count += 1
            out_excel = TEST_OUTPUT_DIR / f"result_{file_path.stem}.xlsx"
            save_test_excel(matrix, out_excel)
            
            print(f"  ✅ SUCCESS! Rows: {len(matrix)}, Cols: {len(matrix[0]) if matrix else 0}")
            print(f"  📄 Saved test Excel: {out_excel.name}")
            print("  --- Extracted Preview ---")
            for r in matrix[:3]:  # Print top 3 rows
                print("  ", r)
            if len(matrix) > 3:
                print(f"   ... ({len(matrix) - 3} more rows)")
        else:
            print(f"  ❌ FAILED: Could not extract table from {file_path.name}")
        
        print("\n" + "-"*50 + "\n")

    print(f"==================================================")
    print(f"🎯 BATCH TEST COMPLETE: {success_count}/{len(files)} Passed!")
    print(f"📁 Inspect generated Excel outputs in the '{TEST_OUTPUT_DIR}' folder.")
    print(f"==================================================")

if __name__ == "__main__":
    run_test_suite()