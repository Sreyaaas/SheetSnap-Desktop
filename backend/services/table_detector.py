"""
SheetSnap High-Accuracy Table Detection & Structural Reconstruction Engine.

Two-Tier Topology Pipeline:
  Tier 1: Morphological Line Projection Grid (Bordered Tables)
          - Detects continuous and segmented horizontal & vertical grid lines.
          - Extracts line intersections to form exact 2D cell slots.
          - Eliminates contour bounding box corruption and cell collisions.

  Tier 2: Adaptive Column Interval & Valley Projection (Borderless Tables)
          - Dynamic vertical overlap line clustering for row detection.
          - Horizontal interval projection & whitespace valley discovery for column bounds.
          - Multi-line continuation record consolidation (wrapped item descriptions).
          - Empty cell preservation and uniform column normalization.
"""

import logging
import cv2
import numpy as np
import re
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class TableDetector:
    """High-accuracy table extractor combining morphological grid and adaptive virtual grid."""

    @staticmethod
    def parse_ocr_results(ocr_results: Any) -> List[Dict[str, Any]]:
        """
        Unpack RapidOCR results into a uniform list of word bounding boxes:
            { text, x_min, x_max, y_min, y_max, w, h, area, x_center, y_center, conf }
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
                x_coords = [float(p[0]) for p in bbox if isinstance(p, (list, tuple, np.ndarray)) and len(p) > 0]
                y_coords = [float(p[1]) for p in bbox if isinstance(p, (list, tuple, np.ndarray)) and len(p) > 1]
                if not x_coords or not y_coords:
                    continue

                x_min, x_max = min(x_coords), max(x_coords)
                y_min, y_max = min(y_coords), max(y_coords)
                w = max(1.0, x_max - x_min)
                h = max(1.0, y_max - y_min)

                words.append({
                    "text": text,
                    "x_min": x_min,
                    "x_max": x_max,
                    "y_min": y_min,
                    "y_max": y_max,
                    "w": w,
                    "h": h,
                    "area": w * h,
                    "x_center": (x_min + x_max) / 2.0,
                    "y_center": (y_min + y_max) / 2.0,
                    "conf": conf,
                })
            except Exception:
                continue

        return words

    @staticmethod
    def _cluster_into_rows(
        words: List[Dict[str, Any]],
        median_h: float,
    ) -> List[List[Dict[str, Any]]]:
        """Group word bounding boxes into horizontal visual lines using vertical overlap."""
        if not words:
            return []

        sorted_words = sorted(words, key=lambda w: (w["y_min"], w["x_min"]))
        rows: List[List[Dict[str, Any]]] = []

        for word in sorted_words:
            matched_row = None
            best_overlap = 0.0

            for row in rows:
                row_y_min = min(w["y_min"] for w in row)
                row_y_max = max(w["y_max"] for w in row)
                row_y_center = sum(w["y_center"] for w in row) / len(row)
                row_h = max(1.0, row_y_max - row_y_min)

                overlap = max(0.0, min(word["y_max"], row_y_max) - max(word["y_min"], row_y_min))
                min_h = min(word["h"], row_h, median_h)
                overlap_ratio = overlap / max(1.0, min_h)
                center_dist = abs(word["y_center"] - row_y_center)

                if (overlap_ratio >= 0.35 or center_dist < median_h * 0.45) and overlap_ratio > best_overlap:
                    best_overlap = overlap_ratio
                    matched_row = row

            if matched_row is not None:
                matched_row.append(word)
            else:
                rows.append([word])

        for row in rows:
            row.sort(key=lambda w: w["x_min"])

        rows.sort(key=lambda row: sum(w["y_center"] for w in row) / len(row))
        return rows

    @staticmethod
    def _detect_column_bounds(
        lines: List[List[Dict[str, Any]]],
        img_width: int,
        median_w: float,
    ) -> List[Tuple[float, float]]:
        """
        Discover column slots [x_start, x_end] by analyzing continuous horizontal spans
        and vertical column gaps across lines.
        """
        if not lines:
            return [(0.0, float(img_width))]

        all_words = [w for line in lines for w in line]
        if not all_words:
            return [(0.0, float(img_width))]

        min_col_gap = max(18.0, median_w * 0.25)

        # Collect candidate column left edges
        col_starts: List[float] = []
        for line in lines:
            for w in line:
                x = w["x_min"]
                matched = False
                for idx, cs in enumerate(col_starts):
                    if abs(x - cs) < min_col_gap:
                        col_starts[idx] = (cs + x) / 2.0
                        matched = True
                        break
                if not matched:
                    col_starts.append(x)

        col_starts.sort()

        # Merge column anchors that are too close
        merged_starts: List[float] = []
        for cs in col_starts:
            if not merged_starts:
                merged_starts.append(cs)
            elif cs - merged_starts[-1] >= min_col_gap:
                merged_starts.append(cs)

        if not merged_starts:
            merged_starts = [0.0]

        # Construct column intervals
        columns: List[Tuple[float, float]] = []
        for i in range(len(merged_starts)):
            c_start = merged_starts[i]
            c_end = merged_starts[i + 1] if i + 1 < len(merged_starts) else float(img_width)
            columns.append((c_start, c_end))

        return columns

    @staticmethod
    def _extract_bordered_grid(
        img: np.ndarray,
        words: List[Dict[str, Any]],
        median_h: float,
        median_w: float,
    ) -> Optional[List[List[str]]]:
        """
        Tier 1: Morphological Line Projection Grid.
        Detects table grid lines using horizontal/vertical projection peaks.
        """
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        thresh = cv2.adaptiveThreshold(
            cv2.bitwise_not(gray), 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
            15, -2
        )

        h_len = max(25, w // 30)
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_len, 1))
        h_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)

        v_len = max(15, h // 30)
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_len))
        v_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, v_kernel)

        h_proj = np.sum(h_lines, axis=1)
        v_proj = np.sum(v_lines, axis=0)

        h_peaks = np.where(h_proj > (w * 255 * 0.15))[0]
        v_peaks = np.where(v_proj > (h * 255 * 0.10))[0]

        def _group_peaks(peaks: np.ndarray, min_dist: float) -> List[int]:
            if len(peaks) == 0:
                return []
            grouped: List[int] = []
            cur_group = [int(peaks[0])]
            for p in peaks[1:]:
                if p - cur_group[-1] <= min_dist:
                    cur_group.append(int(p))
                else:
                    grouped.append(int(np.mean(cur_group)))
                    cur_group = [int(p)]
            grouped.append(int(np.mean(cur_group)))
            return grouped

        row_dividers = _group_peaks(h_peaks, max(8.0, median_h * 0.6))
        col_dividers = _group_peaks(v_peaks, max(15.0, median_w * 0.4))

        if len(row_dividers) >= 3 and len(col_dividers) >= 3:
            num_grid_rows = len(row_dividers) - 1
            num_grid_cols = len(col_dividers) - 1

            matrix = [["" for _ in range(num_grid_cols)] for _ in range(num_grid_rows)]

            for word in words:
                xc, yc = word["x_center"], word["y_center"]
                r_idx = -1
                for r in range(num_grid_rows):
                    if row_dividers[r] <= yc <= row_dividers[r + 1]:
                        r_idx = r
                        break

                c_idx = -1
                for c in range(num_grid_cols):
                    if col_dividers[c] <= xc <= col_dividers[c + 1]:
                        c_idx = c
                        break

                if r_idx != -1 and c_idx != -1:
                    if matrix[r_idx][c_idx]:
                        matrix[r_idx][c_idx] += " " + word["text"]
                    else:
                        matrix[r_idx][c_idx] = word["text"]

            non_empty_rows = [row for row in matrix if any(cell.strip() for cell in row)]
            if len(non_empty_rows) >= 2:
                logger.info("Extracted %d rows via Tier 1 Morphological Grid.", len(non_empty_rows))
                return non_empty_rows

        return None

    @staticmethod
    def extract(
        image_bgr: np.ndarray,
        ocr_words: List[Dict[str, Any]],
    ) -> List[List[str]]:
        """
        Main entry point for high-accuracy table extraction.
        Runs Tier 1 (morphological grid) or Tier 2 (adaptive column projection).
        """
        if not ocr_words:
            return [["Header"], ["No text recognized"]]

        h, w = image_bgr.shape[:2]
        heights = [item["h"] for item in ocr_words if item["h"] > 2]
        median_h = float(np.median(heights)) if heights else 20.0
        widths = [item["w"] for item in ocr_words if item["w"] > 2]
        median_w = float(np.median(widths)) if widths else 50.0

        # Tier 1: Try Bordered Grid Line Extraction
        grid_result = TableDetector._extract_bordered_grid(image_bgr, ocr_words, median_h, median_w)
        if grid_result and len(grid_result) >= 2:
            return grid_result

        # Tier 2: Adaptive Virtual Grid for Borderless Tables
        lines = TableDetector._cluster_into_rows(ocr_words, median_h)
        if not lines:
            return [["Header"], ["No table structure detected"]]

        col_bounds = TableDetector._detect_column_bounds(lines, w, median_w)
        num_cols = len(col_bounds)

        if num_cols == 0:
            return [["Text"], *[[w["text"]] for w in ocr_words]]

        # Map words to column slots
        raw_table: List[List[str]] = []
        for line in lines:
            row_cells: List[List[Dict[str, Any]]] = [[] for _ in range(num_cols)]
            for word in line:
                xc = word["x_center"]
                best_col = 0
                min_dist = float("inf")

                for c_idx, (c_start, c_end) in enumerate(col_bounds):
                    if c_start <= xc <= c_end:
                        best_col = c_idx
                        min_dist = 0
                        break
                    else:
                        dist = min(abs(xc - c_start), abs(xc - c_end))
                        if dist < min_dist:
                            min_dist = dist
                            best_col = c_idx

                row_cells[best_col].append(word)

            formatted_row: List[str] = []
            for cell_words in row_cells:
                cell_words.sort(key=lambda w: w["x_min"])
                text = " ".join(w["text"] for w in cell_words).strip()
                formatted_row.append(text)

            raw_table.append(formatted_row)

        # Merge continuation rows (wrapped descriptions)
        merged_table: List[List[str]] = []
        for row in raw_table:
            non_empty_indices = [i for i, cell in enumerate(row) if cell.strip()]
            if not non_empty_indices:
                continue

            if (
                merged_table
                and len(non_empty_indices) == 1
                and non_empty_indices[0] > 0
                and not re.match(r'^(total|subtotal|tax|discount|grand total)', row[non_empty_indices[0]], re.IGNORECASE)
            ):
                col_i = non_empty_indices[0]
                merged_table[-1][col_i] = (merged_table[-1][col_i] + " " + row[col_i]).strip()
            else:
                merged_table.append(row)

        # Prune fully empty columns
        if merged_table:
            cols_to_keep = [
                c_idx for c_idx in range(len(merged_table[0]))
                if any(row[c_idx].strip() for row in merged_table)
            ]
            if cols_to_keep:
                merged_table = [
                    [row[c_idx] for c_idx in cols_to_keep]
                    for row in merged_table
                ]

        logger.info("Extracted %d rows via Tier 2 Adaptive Projection.", len(merged_table))
        return merged_table if merged_table else [["Header"], ["No data extracted"]]