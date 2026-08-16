import os
import re
import cv2
import fitz  # PyMuPDF
import numpy as np
from pathlib import Path
from rapidocr_onnxruntime import RapidOCR
import openpyxl
from openpyxl.styles import Font

# Test Directories
TEST_INPUT_DIR = Path("test_images")
TEST_OUTPUT_DIR = Path("test_outputs2")

TEST_INPUT_DIR.mkdir(exist_ok=True)
TEST_OUTPUT_DIR.mkdir(exist_ok=True)

print("🚀 Initializing Dual-Pass Topological Engine on CPU...")
try:
    ocr_engine = RapidOCR()
    print("✅ RapidOCR Engine initialized successfully!\n")
except Exception as e:
    print(f"❌ Failed to initialize OCR: {e}")
    exit(1)


class TextCleaner:
    @staticmethod
    def clean_cell(text: str) -> str:
        if not text:
            return ""
        # Fix missing spaces after commas (e.g. 'CABLE,GREEN' -> 'CABLE, GREEN')
        text = re.sub(r',([^\s0-9])', r', \1', text)
        # Fix attached units and numbers (e.g. '250.MTR' -> '250. MTR')
        text = re.sub(r'([0-9])([A-Za-z]{2,})', r'\1 \2', text)
        # Fix stuck codes (e.g. '794339Contractor' -> '794339 Contractor')
        text = re.sub(r'([0-9]{3,})([a-zA-Z])', r'\1 \2', text)
        # Clean double spaces
        text = re.sub(r'\s+', ' ', text)
        return text.strip()


class TopologicalTableEngine:
    @staticmethod
    def extract_physical_cells(gray_img: np.ndarray, w: int, h: int):
        """Mode A: Physical Border Ray-Tracing for Bordered Spreadsheets."""
        thresh = cv2.adaptiveThreshold(
            ~gray_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, -2
        )

        # Scale kernels based on image dimensions
        horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 25), 1))
        vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, h // 25)))

        horiz_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horiz_kernel)
        vert_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vert_kernel)

        grid_mask = cv2.add(horiz_lines, vert_lines)
        contours, _ = cv2.findContours(grid_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        raw_cells = []
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            # Filter noise and outer page frame
            if bw > 20 and bh > 10 and bw < w * 0.98 and bh < h * 0.98:
                raw_cells.append({
                    "x1": x, "y1": y, "x2": x + bw, "y2": y + bh,
                    "w": bw, "h": bh, "area": bw * bh
                })

        if len(raw_cells) < 4:
            return None  # Fallback to Virtual Mode if no bordered grid detected

        # Group cell boxes into structured Rows based on Y-overlap
        raw_cells = sorted(raw_cells, key=lambda c: (c["y1"] + c["y2"]) / 2.0)
        grid_rows = []
        current_row = [raw_cells[0]]
        current_row_y = (raw_cells[0]["y1"] + raw_cells[0]["y2"]) / 2.0

        for cell in raw_cells[1:]:
            cy = (cell["y1"] + cell["y2"]) / 2.0
            if abs(cy - current_row_y) < (cell["h"] * 0.5):
                current_row.append(cell)
            else:
                grid_rows.append(sorted(current_row, key=lambda c: c["x1"]))
                current_row = [cell]
                current_row_y = cy
        grid_rows.append(sorted(current_row, key=lambda c: c["x1"]))

        return grid_rows

    @staticmethod
    def extract_virtual_cells(words: list, w: int, h: int):
        """Mode B: Virtual Topological Lane Clustering for Borderless POs."""
        if not words:
            return []

        # Sort words top-to-bottom
        sorted_words = sorted(words, key=lambda w: w["y_min"])

        # 1. Cluster words into visual horizontal lines (35% vertical overlap)
        lines = []
        for word in sorted_words:
            assigned = False
            for line in lines:
                line_y_min = min(i["y_min"] for i in line)
                line_y_max = max(i["y_max"] for i in line)
                
                overlap = max(0.0, min(word["y_max"], line_y_max) - max(word["y_min"], line_y_min))
                min_h = min(word["h"], line_y_max - line_y_min)
                
                if min_h > 0 and (overlap / min_h) > 0.35:
                    line.append(word)
                    assigned = True
                    break
            if not assigned:
                lines.append([word])

        lines = [sorted(line, key=lambda x: x["x_min"]) for line in lines]
        lines = sorted(lines, key=lambda line: min(i["y_min"] for i in line))

        # 2. Discover global column dividers
        all_x_mins = sorted([i["x_min"] for line in lines for i in line])
        col_dividers = [all_x_mins[0]]
        for x in all_x_mins[1:]:
            if x - col_dividers[-1] > 30:
                col_dividers.append(x)

        # 3. Project lines into uniform grid
        virtual_matrix = []
        for line in lines:
            row_cells = [""] * len(col_dividers)
            for item in line:
                assigned_col = 0
                min_dist = float('inf')
                for col_idx, anchor_x in enumerate(col_dividers):
                    dist = abs(item["x_min"] - anchor_x)
                    if dist < min_dist:
                        min_dist = dist
                        assigned_col = col_idx

                item_str = str(item["text"])
                if row_cells[assigned_col]:
                    row_cells[assigned_col] += " " + item_str
                else:
                    row_cells[assigned_col] = item_str
            virtual_matrix.append(row_cells)

        # 4. Continuation line merging (multiline descriptions)
        merged_matrix = []
        for row in virtual_matrix:
            non_empty_indices = [idx for idx, cell in enumerate(row) if cell.strip()]
            if merged_matrix and len(non_empty_indices) == 1 and non_empty_indices[0] > 0:
                col_i = non_empty_indices[0]
                merged_matrix[-1][col_i] = (merged_matrix[-1][col_i] + " " + row[col_i]).strip()
            else:
                merged_matrix.append(row)

        return merged_matrix


def extract_table(file_path: Path):
    """Dual-Pass Execution Controller."""
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

    # 2. PASS 1: Run Full-Page ONNX OCR Exactly Once
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
                x_min, x_max = min(xs), max(xs)
                y_min, y_max = min(ys), max(ys)
                word_w = max(1.0, x_max - x_min)
                word_h = max(1.0, y_max - y_min)
                ocr_words.append({
                    "text": text,
                    "x_min": x_min, "x_max": x_max,
                    "y_min": y_min, "y_max": y_max,
                    "w": word_w, "h": word_h,
                    "area": word_w * word_h,
                    "x_center": (x_min + x_max) / 2.0,
                    "y_center": (y_min + y_max) / 2.0
                })

    if not ocr_words:
        return None

    # 3. PASS 2: Determine Table Topology (Mode A: Bordered Grid vs Mode B: Virtual Grid)
    physical_grid = TopologicalTableEngine.extract_physical_cells(gray, w, h)

    if physical_grid:
        # MODE A: Spatial IoA (Intersection over Area) Containment Projection
        max_cols = max(len(r) for r in physical_grid)
        matrix = [["" for _ in range(max_cols)] for _ in range(len(physical_grid))]

        for r_idx, row in enumerate(physical_grid):
            for c_idx, cell in enumerate(row):
                cell_words = []
                for word in ocr_words:
                    # Calculate geometric overlap intersection
                    ix1 = max(cell["x1"], word["x_min"])
                    iy1 = max(cell["y1"], word["y_min"])
                    ix2 = min(cell["x2"], word["x_max"])
                    iy2 = min(cell["y2"], word["y_max"])

                    if ix2 > ix1 and iy2 > iy1:
                        intersection_area = (ix2 - ix1) * (iy2 - iy1)
                        # Containment Ratio (IoA): if at least 40% of word is inside this cell
                        if (intersection_area / word["area"]) >= 0.40:
                            cell_words.append(word)

                if cell_words:
                    # Sort words top-to-bottom then left-to-right inside the cell
                    cell_words = sorted(cell_words, key=lambda w: (w["y_min"] // 8, w["x_min"]))
                    cell_text = " ".join(w["text"] for w in cell_words)
                    matrix[r_idx][c_idx] = TextCleaner.clean_cell(cell_text)

        clean_matrix = [row for row in matrix if any(cell.strip() for cell in row)]
        return clean_matrix if clean_matrix else None

    else:
        # MODE B: Virtual Topological Lane Clustering (for Borderless documents)
        virtual_matrix = TopologicalTableEngine.extract_virtual_cells(ocr_words, w, h)
        if virtual_matrix:
            cleaned = [[TextCleaner.clean_cell(cell) for cell in row] for row in virtual_matrix]
            return [row for row in cleaned if any(cell.strip() for cell in row)]

    return None


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
    print(f"🚀 Running Dual-Pass Topological Engine on {len(files)} files...")
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

    print(f"\n🎯 COMPLETE: {success_count}/{len(files)} Processed Successfully!")
    print(f"📁 Open '{TEST_OUTPUT_DIR}' to inspect all your Excel spreadsheets.")


if __name__ == "__main__":
    run_test_suite()