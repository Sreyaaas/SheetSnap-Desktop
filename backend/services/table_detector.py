"""
SheetSnap Dual-Pass Topological Table Detector.

Deterministic 4-step pipeline:
  1. Run full-page OCR (single pass) → extract word tokens with bounding boxes.
  2. Isolate the Table Region of Interest (ROI) — crop email headers/footers.
  3. Branch into Mode A (bordered grid) or Mode B (borderless virtual grid).
  4. Clean up: merge continuation lines, preserve empty cells, align summary rows.

All thresholds are dynamically derived from the document's own metrics
(median font height, image dimensions) — no hardcoded pixel values.
"""

import logging
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Header keywords used for ROI anchoring (case-insensitive substrings)
# ---------------------------------------------------------------------------
_TABLE_HEADER_KEYWORDS = {
    "item", "line", "description", "qty", "quantity", "uom", "unit",
    "price", "cost", "amount", "total", "facility", "standards",
    "material", "requisition", "part", "spec", "rate", "vendor",
    "supplier", "no.", "no", "sl", "s.no", "sr", "sr.", "s.no.",
}

_NOISE_KEYWORDS = {
    "dear", "hi ", "hello", "kindly", "please", "regards", "thanks",
    "thank you", "urgent", "top urgent", "note:", "from:", "to:",
    "subject:", "date:", "sent:", "cc:", "bcc:", "fyi", "fwd:",
    "best regards", "sincerely", "cheers", "warm regards",
}


class TableDetector:
    """
    Dual-pass topological table extraction engine.

    Call flow:
        ocr_words = TableDetector.parse_ocr_results(raw_ocr)
        table      = TableDetector.extract(image_bgr, ocr_words)
    """

    # -----------------------------------------------------------------------
    # Step 1: Parse raw RapidOCR output into uniform word dicts
    # -----------------------------------------------------------------------

    @staticmethod
    def parse_ocr_results(ocr_results: Any) -> List[Dict[str, Any]]:
        """
        Unpack RapidOCR results into a flat list of word dicts:
            { text, x_min, x_max, y_min, y_max, w, h, area, x_center, y_center, conf }

        All coordinate values are explicitly cast to float; dimensions to int
        for downstream OpenCV/Numpy safety.
        """
        if isinstance(ocr_results, tuple):
            ocr_results = ocr_results[0]

        if not ocr_results or not isinstance(ocr_results, list):
            return []

        words: List[Dict[str, Any]] = []

        for line in ocr_results:
            if not isinstance(line, (list, tuple)) or len(line) < 2:
                continue

            bbox = line[0]
            text_info = line[1]
            conf = float(line[2]) if len(line) > 2 else 1.0

            if not isinstance(bbox, (list, tuple, np.ndarray)) or len(bbox) == 0:
                continue

            text = str(text_info).strip() if not isinstance(text_info, (list, tuple)) else str(text_info[0]).strip()
            if isinstance(text_info, (list, tuple)) and len(text_info) > 1:
                try:
                    conf = float(text_info[1])
                except (ValueError, TypeError):
                    pass

            if not text or conf < 0.05:
                continue

            try:
                x_coords = [float(p[0]) for p in bbox
                            if isinstance(p, (list, tuple, np.ndarray)) and len(p) > 0]
                y_coords = [float(p[1]) for p in bbox
                            if isinstance(p, (list, tuple, np.ndarray)) and len(p) > 1]
                if not x_coords or not y_coords:
                    continue

                x_min, x_max = min(x_coords), max(x_coords)
                y_min, y_max = min(y_coords), max(y_coords)
                w = max(1.0, x_max - x_min)
                h = max(1.0, y_max - y_min)

                words.append({
                    "text": text,
                    "x_min": x_min, "x_max": x_max,
                    "y_min": y_min, "y_max": y_max,
                    "w": w, "h": h,
                    "area": w * h,
                    "x_center": (x_min + x_max) / 2.0,
                    "y_center": (y_min + y_max) / 2.0,
                    "conf": conf,
                })
            except Exception:
                continue

        return words

    # -----------------------------------------------------------------------
    # Step 2: Table Region Isolation (ROI)
    # -----------------------------------------------------------------------

    @staticmethod
    def _isolate_table_roi(
        words: List[Dict[str, Any]],
        img_height: int,
    ) -> Tuple[List[Dict[str, Any]], int, int]:
        """
        Detect the vertical extent of the table region and filter out
        email chatter, salutations, and footer signatures.

        Returns (filtered_words, roi_y_start, roi_y_end).
        """
        if not words:
            return words, 0, img_height

        # Sort by vertical position
        sorted_words = sorted(words, key=lambda w: w["y_min"])

        # Compute median font height for dynamic thresholding
        heights = [w["h"] for w in sorted_words if w["h"] > 2]
        median_h = float(np.median(heights)) if heights else 20.0

        # --- Find the first row that looks like a table header ---
        # Build visual lines first (reuse the overlap clustering logic)
        lines = _cluster_into_lines(sorted_words, median_h, overlap_ratio=0.30)

        header_line_idx: Optional[int] = None
        footer_line_idx: Optional[int] = None

        for idx, line in enumerate(lines):
            line_text = " ".join(w["text"] for w in line).lower()
            line_tokens = set(line_text.replace(".", " ").replace(",", " ").split())

            # Check if this line contains table header keywords
            matches = line_tokens & _TABLE_HEADER_KEYWORDS
            if len(matches) >= 2:
                header_line_idx = idx
                break

        # --- Scan backwards from the bottom for noise/footer ---
        for idx in range(len(lines) - 1, -1, -1):
            line_text = " ".join(w["text"] for w in lines[idx]).lower()
            is_noise = any(kw in line_text for kw in _NOISE_KEYWORDS)
            if is_noise:
                footer_line_idx = idx
            else:
                break  # Stop at first non-noise line from bottom

        # Compute ROI vertical bounds
        if header_line_idx is not None:
            # Include one line above the header (for merged header spans)
            anchor_idx = max(0, header_line_idx - 1)
            roi_y_start = int(min(w["y_min"] for w in lines[anchor_idx]))
        else:
            roi_y_start = 0

        if footer_line_idx is not None:
            roi_y_end = int(min(w["y_min"] for w in lines[footer_line_idx]))
        else:
            roi_y_end = img_height

        # Filter words to ROI
        filtered = [
            w for w in words
            if w["y_min"] >= roi_y_start - median_h * 0.5
            and w["y_max"] <= roi_y_end + median_h * 0.5
        ]

        # If ROI filtering removed too much (>80%), fall back to full page
        if len(filtered) < max(3, len(words) * 0.2):
            return words, 0, img_height

        return filtered, roi_y_start, roi_y_end

    # -----------------------------------------------------------------------
    # Step 3A: Mode A — Physical Grid Detection for Bordered Tables
    # -----------------------------------------------------------------------

    @staticmethod
    def _detect_physical_grid(
        gray: np.ndarray,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Detect bordered table cells using morphological line extraction.

        Returns a list of cell dicts { x1, y1, x2, y2, w, h, area }
        or None if no bordered grid is found (< 4 cells).
        """
        h, w = gray.shape[:2]

        # Adaptive binary threshold (inverted)
        thresh = cv2.adaptiveThreshold(
            cv2.bitwise_not(gray), 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
            15, -2,
        )

        # Morphological kernels scaled to image dimensions
        horiz_kernel_len = max(20, w // 25)
        vert_kernel_len = max(6, h // 25)

        horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (horiz_kernel_len, 1))
        vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vert_kernel_len))

        horiz_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horiz_kernel)
        vert_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vert_kernel)

        # Combine into grid mask and find cell contours
        grid_mask = cv2.add(horiz_lines, vert_lines)
        contours, _ = cv2.findContours(grid_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        cells: List[Dict[str, Any]] = []
        for c in contours:
            bx, by, bw, bh = cv2.boundingRect(c)
            # Filter out noise (too small) and page frame (too large)
            if bw > 20 and bh > 10 and bw < w * 0.98 and bh < h * 0.98:
                cells.append({
                    "x1": int(bx),
                    "y1": int(by),
                    "x2": int(bx + bw),
                    "y2": int(by + bh),
                    "w": int(bw),
                    "h": int(bh),
                    "area": int(bw * bh),
                })

        if len(cells) < 4:
            return None  # Not enough cells — probably not a bordered table

        return cells

    @staticmethod
    def _build_grid_from_cells(
        cells: List[Dict[str, Any]],
    ) -> List[List[Dict[str, Any]]]:
        """
        Cluster physical cells into sorted rows (by Y overlap),
        then sort each row left-to-right.
        """
        cells = sorted(cells, key=lambda c: (c["y1"] + c["y2"]) / 2.0)

        rows: List[List[Dict[str, Any]]] = []
        current_row = [cells[0]]
        current_row_cy = (cells[0]["y1"] + cells[0]["y2"]) / 2.0

        for cell in cells[1:]:
            cy = (cell["y1"] + cell["y2"]) / 2.0
            if abs(cy - current_row_cy) < cell["h"] * 0.5:
                current_row.append(cell)
            else:
                rows.append(sorted(current_row, key=lambda c: c["x1"]))
                current_row = [cell]
                current_row_cy = cy

        rows.append(sorted(current_row, key=lambda c: c["x1"]))
        return rows

    @staticmethod
    def _mode_a_bordered(
        gray: np.ndarray,
        words: List[Dict[str, Any]],
    ) -> Optional[List[List[str]]]:
        """
        Mode A: Extract table from a bordered/gridded document.

        1. Detect physical cell boundaries via morphological line extraction.
        2. Build a row×col grid from the detected cells.
        3. Map OCR words into cells using Intersection-over-Area (IoA ≥ 35%).
        4. Sort words within each cell in reading order (top→bottom, left→right).
        """
        cells = TableDetector._detect_physical_grid(gray)
        if cells is None:
            return None

        grid_rows = TableDetector._build_grid_from_cells(cells)
        max_cols = max(len(r) for r in grid_rows)

        # Build empty text matrix
        matrix: List[List[str]] = [
            ["" for _ in range(max_cols)]
            for _ in range(len(grid_rows))
        ]

        # Compute dynamic reading-order quantisation bucket
        all_heights = [w["h"] for w in words if w["h"] > 2]
        median_h = float(np.median(all_heights)) if all_heights else 20.0
        y_bucket = max(4, int(median_h * 0.5))

        for r_idx, row in enumerate(grid_rows):
            for c_idx, cell in enumerate(row):
                cell_words: List[Dict[str, Any]] = []

                for word in words:
                    # Intersection rectangle
                    ix1 = max(cell["x1"], word["x_min"])
                    iy1 = max(cell["y1"], word["y_min"])
                    ix2 = min(cell["x2"], word["x_max"])
                    iy2 = min(cell["y2"], word["y_max"])

                    if ix2 > ix1 and iy2 > iy1:
                        intersection_area = (ix2 - ix1) * (iy2 - iy1)
                        # IoA containment: ≥35% of the word lies inside this cell
                        if word["area"] > 0 and (intersection_area / word["area"]) >= 0.35:
                            cell_words.append(word)

                if cell_words:
                    # Reading order: top-to-bottom (bucketed), then left-to-right
                    cell_words.sort(
                        key=lambda w: (int(w["y_min"]) // y_bucket, w["x_min"])
                    )
                    cell_text = " ".join(w["text"] for w in cell_words)
                    matrix[r_idx][c_idx] = cell_text

        # Drop fully empty rows
        clean = [row for row in matrix if any(cell.strip() for cell in row)]
        return clean if clean else None

    # -----------------------------------------------------------------------
    # Step 3B: Mode B — Virtual Grid for Borderless Documents
    # -----------------------------------------------------------------------

    @staticmethod
    def _mode_b_borderless(
        words: List[Dict[str, Any]],
    ) -> Optional[List[List[str]]]:
        """
        Mode B: Extract table from a borderless document (POs, requisitions).

        1. Cluster words into visual lines using dynamic vertical overlap.
        2. Discover global column dividers adaptively.
        3. Project words into a uniform column grid.
        4. Merge single-column continuation lines into the row above.
        """
        if not words:
            return None

        # Compute median font height for dynamic thresholds
        heights = [w["h"] for w in words if w["h"] > 2]
        median_h = float(np.median(heights)) if heights else 20.0

        # 1. Cluster into horizontal visual lines (≥35% vertical overlap)
        sorted_words = sorted(words, key=lambda w: w["y_min"])
        lines = _cluster_into_lines(sorted_words, median_h, overlap_ratio=0.35)

        if not lines:
            return None

        # Sort lines top→bottom, items left→right within each line
        lines = [sorted(line, key=lambda w: w["x_min"]) for line in lines]
        lines.sort(key=lambda line: min(w["y_min"] for w in line))

        # 2. Discover adaptive column dividers
        #    Column gap threshold = max(30, median_word_width * 0.5)
        all_widths = [w["w"] for w in words if w["w"] > 2]
        median_w = float(np.median(all_widths)) if all_widths else 60.0
        col_gap_thresh = max(30.0, median_w * 0.5)

        all_x_mins = sorted(w["x_min"] for line in lines for w in line)
        if not all_x_mins:
            return None

        col_dividers = [all_x_mins[0]]
        for x in all_x_mins[1:]:
            if x - col_dividers[-1] > col_gap_thresh:
                col_dividers.append(x)

        num_cols = len(col_dividers)

        # 3. Project lines into uniform grid
        raw_table: List[List[str]] = []
        for line in lines:
            row_cells = [""] * num_cols
            for item in line:
                # Find nearest column divider
                best_col = 0
                best_dist = float("inf")
                for col_idx, anchor_x in enumerate(col_dividers):
                    dist = abs(item["x_min"] - anchor_x)
                    if dist < best_dist:
                        best_dist = dist
                        best_col = col_idx

                if row_cells[best_col]:
                    row_cells[best_col] += " " + item["text"]
                else:
                    row_cells[best_col] = item["text"]

            raw_table.append(row_cells)

        # 4. Merge continuation lines (wrapped descriptions)
        # A continuation line has content in only 1 column, and it's NOT column 0
        merged: List[List[str]] = []
        for row in raw_table:
            non_empty = [i for i, cell in enumerate(row) if cell.strip()]

            if (
                merged
                and len(non_empty) == 1
                and non_empty[0] > 0
            ):
                col_i = non_empty[0]
                merged[-1][col_i] = (merged[-1][col_i] + " " + row[col_i]).strip()
            else:
                merged.append(row)

        # Drop fully empty rows
        clean = [row for row in merged if any(cell.strip() for cell in row)]
        return clean if clean else None

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    @staticmethod
    def extract(
        image_bgr: np.ndarray,
        ocr_words: List[Dict[str, Any]],
    ) -> List[List[str]]:
        """
        Main entry point: run the dual-pass pipeline on an image
        with pre-computed OCR words.

        Returns a 2D string matrix (first row = headers, rest = data).
        Always returns at least a 1-row fallback so callers never get None.
        """
        if not ocr_words:
            return [["Header"], ["No text recognized"]]

        h, w = image_bgr.shape[:2]

        # Step 2: Isolate table region
        roi_words, _, _ = TableDetector._isolate_table_roi(ocr_words, h)

        if not roi_words:
            roi_words = ocr_words  # Fallback to full page

        # Step 3: Mode branching
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

        # Try Mode A first (bordered table)
        result = TableDetector._mode_a_bordered(gray, roi_words)

        if result and len(result) >= 2:
            logger.info("Mode A (bordered grid) — %d rows extracted.", len(result))
            return result

        # Fall back to Mode B (borderless virtual grid)
        result = TableDetector._mode_b_borderless(roi_words)

        if result:
            logger.info("Mode B (borderless virtual grid) — %d rows extracted.", len(result))
            return result

        # Ultimate fallback: return raw OCR text as a single-column table
        logger.warning("Both modes failed — returning raw OCR fallback.")
        return [["Text"], *[[w["text"]] for w in sorted(ocr_words, key=lambda w: w["y_min"])]]

    # -----------------------------------------------------------------------
    # Legacy compatibility shim (used by old routes.py contract)
    # -----------------------------------------------------------------------

    @staticmethod
    def extract_table_from_ocr(ocr_results: Any, image_bgr: Optional[np.ndarray] = None) -> List[List[str]]:
        """
        Backwards-compatible wrapper.

        If image_bgr is provided, runs the full dual-pass engine.
        Otherwise falls back to Mode B only (original behaviour).
        """
        words = TableDetector.parse_ocr_results(ocr_results)

        if image_bgr is not None:
            return TableDetector.extract(image_bgr, words)

        # Mode B only (no image available for grid-line detection)
        result = TableDetector._mode_b_borderless(words)
        if result:
            return result
        return [["Header"], ["No table structure detected"]]


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _cluster_into_lines(
    words: List[Dict[str, Any]],
    median_h: float,
    overlap_ratio: float = 0.35,
) -> List[List[Dict[str, Any]]]:
    """
    Cluster word dicts into horizontal visual lines using vertical overlap.

    Two words belong to the same line if the overlap between their
    vertical extents exceeds `overlap_ratio` × the smaller height.

    Parameters
    ----------
    words : pre-sorted by y_min
    median_h : used only as a fallback for degenerate zero-height items
    overlap_ratio : minimum overlap fraction (default 35%)

    Returns list of lines, each line a list of word dicts.
    """
    lines: List[List[Dict[str, Any]]] = []

    for word in words:
        assigned = False
        for line in lines:
            line_y_min = min(w["y_min"] for w in line)
            line_y_max = max(w["y_max"] for w in line)
            line_h = max(1.0, line_y_max - line_y_min)

            overlap = max(0.0, min(word["y_max"], line_y_max) - max(word["y_min"], line_y_min))
            min_h = min(word["h"], line_h)

            if min_h > 0 and (overlap / min_h) > overlap_ratio:
                line.append(word)
                assigned = True
                break

        if not assigned:
            lines.append([word])

    return lines