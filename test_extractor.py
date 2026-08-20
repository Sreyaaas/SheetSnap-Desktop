import os
import re
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

print("🚀 Initializing RapidOCR Engine...")
try:
    ocr_engine = RapidOCR()
    print("✅ RapidOCR ready!\n")
except Exception as e:
    print(f"❌ Failed to initialize OCR: {e}")
    exit(1)


class TextCleaner:
    @staticmethod
    def clean_cell(text: str) -> str:
        if not text:
            return ""
        text = re.sub(r',([^\s0-9])', r', \1', text)
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        text = re.sub(r'([0-9]{3,})([a-zA-Z])', r'\1 \2', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()


def detect_grid_lines(gray: np.ndarray):
    """Detect exact X (vertical) and Y (horizontal) grid line positions using morphological profiles."""
    h, w = gray.shape

    # Adaptive binarization to extract grid lines
    thresh = cv2.adaptiveThreshold(
        ~gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, -2
    )

    # Extract horizontal lines
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 25), 1))
    horiz_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horiz_kernel)

    # Extract vertical lines
    vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, h // 25)))
    vert_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vert_kernel)

    # Find line peaks along Y axis (Horizontal lines)
    horiz_profile = np.sum(horiz_lines, axis=1)
    y_peaks = np.where(horiz_profile > (w * 0.15 * 255))[0]

    # Cluster adjacent Y pixels into distinct line positions
    y_lines = []
    if len(y_peaks) > 0:
        curr_cluster = [y_peaks[0]]
        for y in y_peaks[1:]:
            if y - curr_cluster[-1] < 10:
                curr_cluster.append(y)
            else:
                y_lines.append(int(np.mean(curr_cluster)))
                curr_cluster = [y]
        y_lines.append(int(np.mean(curr_cluster)))

    # Find line peaks along X axis (Vertical lines)
    vert_profile = np.sum(vert_lines, axis=0)
    x_peaks = np.where(vert_profile > (h * 0.15 * 255))[0]

    # Cluster adjacent X pixels into distinct line positions
    x_lines = []
    if len(x_peaks) > 0:
        curr_cluster = [x_peaks[0]]
        for x in x_peaks[1:]:
            if x - curr_cluster[-1] < 10:
                curr_cluster.append(x)
            else:
                x_lines.append(int(np.mean(curr_cluster)))
                curr_cluster = [x]
        x_lines.append(int(np.mean(curr_cluster)))

    return sorted(y_lines), sorted(x_lines)


def extract_table(file_path: Path):
    """
    Grid-Line Intersection Engine:
    1. Finds physical X and Y grid lines.
    2. Runs full-image OCR.
    3. Places each word into its exact (X_j, Y_i) cell.
    """
    # 1. Load Image / PDF
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

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # 2. RUN FULL-PAGE OCR
    ocr_res, _ = ocr_engine(img)
    if not ocr_res:
        return None

    ocr_words = []
    for item in ocr_res:
        if isinstance(item, (list, tuple)) and len(item) >= 3 and item[0]:
            bbox = item[0]
            text = str(item[1]).strip()
            if text:
                xs = [p[0] for p in bbox]
                ys = [p[1] for p in bbox]
                ocr_words.append({
                    "text": text,
                    "x_center": sum(xs) / 4.0,
                    "y_center": sum(ys) / 4.0,
                    "x_min": min(xs),
                    "y_min": min(ys)
                })

    if not ocr_words:
        return None

    # 3. Detect Grid Lines
    y_lines, x_lines = detect_grid_lines(gray)

    # If image has physical grid lines (at least 2 horizontal and 2 vertical)
    if len(y_lines) >= 2 and len(x_lines) >= 2:
        num_rows = len(y_lines) - 1
        num_cols = len(x_lines) - 1

        cell_matrix = [[[] for _ in range(num_cols)] for _ in range(num_rows)]

        for word in ocr_words:
            wx = word["x_center"]
            wy = word["y_center"]

            # Match row interval
            matched_row = -1
            for r_idx in range(num_rows):
                if y_lines[r_idx] <= wy <= y_lines[r_idx + 1]:
                    matched_row = r_idx
                    break

            # Match col interval
            matched_col = -1
            for c_idx in range(num_cols):
                if x_lines[c_idx] <= wx <= x_lines[c_idx + 1]:
                    matched_col = c_idx
                    break

            if matched_row != -1 and matched_col != -1:
                cell_matrix[matched_row][matched_col].append(word)

        # Assemble and clean cells
        final_matrix = []
        for row in cell_matrix:
            row_data = []
            for cell_words in row:
                if cell_words:
                    # Sort words top-to-bottom then left-to-right inside the cell
                    sorted_words = sorted(cell_words, key=lambda w: (w["y_min"] // 8, w["x_min"]))
                    cell_text = " ".join(w["text"] for w in sorted_words)
                    row_data.append(TextCleaner.clean_cell(cell_text))
                else:
                    row_data.append("")
            
            if any(cell.strip() for cell in row_data):
                final_matrix.append(row_data)

        if final_matrix:
            return final_matrix

    # Fallback to visual line clustering if no physical gridlines exist
    ocr_words = sorted(ocr_words, key=lambda w: w["y_center"])
    lines = []
    for word in ocr_words:
        assigned = False
        for line in lines:
            if abs(word["y_center"] - line[0]["y_center"]) < 16:
                line.append(word)
                assigned = True
                break
        if not assigned:
            lines.append([word])

    fallback_matrix = []
    for line in lines:
        sorted_line = sorted(line, key=lambda w: w["x_min"])
        fallback_matrix.append([TextCleaner.clean_cell(w["text"]) for w in sorted_line])

    return fallback_matrix if fallback_matrix else None


def save_test_excel(matrix, output_path: Path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Extracted Table"

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
        print(f"📁 Please drop your test images/PDFs inside '{TEST_INPUT_DIR}' folder.")
        return

    print(f"==================================================")
    print(f"🚀 Running Grid-Line Intersection on {len(files)} files...")
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
            print(f"  📄 Saved: {out_excel.name}")
        else:
            print(f"  ❌ FAILED: {file_path.name}")
        
        print("-" * 50)

    print(f"\n🎯 COMPLETE: {success_count}/{len(files)} Processed!")
    print(f"📁 Open '{TEST_OUTPUT_DIR}' to inspect the generated Excel spreadsheets.")


if __name__ == "__main__":
    run_test_suite()