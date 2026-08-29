"""
SheetSnap High-Accuracy Table Detection & Structural Reconstruction Engine.

Features:
  - Multi-Table Region Segmentation & Contour Discovery.
  - Targeted ROI Bounding Box Extraction (User drag-to-box or Auto-proposals).
  - Table Quality & Complexity Scoring (Easy vs Hard image classification).
  - Tier 1: Morphological Line Projection Grid (Bordered Tables).
  - Tier 2: Adaptive Column Interval & Whitespace Valley Projection (Borderless Tables).
  - Dynamic continuation record consolidation & empty column pruning.
"""

import logging
import cv2
import numpy as np
import re
from typing import List, Dict, Any, Optional, Tuple, Union

logger = logging.getLogger(__name__)


class TableDetector:
    """High-accuracy table extractor combining morphological grid, adaptive virtual grid, and ROI support."""

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

                # Decompose fused number-unit tokens (e.g. '2.EA', '5.EA', '10EA') to preserve separate Qty/UOM columns
                qty_uom_match = re.match(r'^([0-9]+\.?)\s*([A-Za-z]{2,})$', text)
                if qty_uom_match and len(text) <= 8:
                    qty_str, uom_str = qty_uom_match.group(1), qty_uom_match.group(2)
                    w_qty = w * (len(qty_str) / len(text))
                    w_uom = w - w_qty
                    words.append({
                        "text": qty_str,
                        "x_min": x_min,
                        "x_max": x_min + w_qty,
                        "y_min": y_min,
                        "y_max": y_max,
                        "w": w_qty,
                        "h": h,
                        "area": w_qty * h,
                        "x_center": x_min + (w_qty / 2.0),
                        "y_center": (y_min + y_max) / 2.0,
                        "conf": conf,
                    })
                    words.append({
                        "text": uom_str,
                        "x_min": x_min + w_qty,
                        "x_max": x_max,
                        "y_min": y_min,
                        "y_max": y_max,
                        "w": w_uom,
                        "h": h,
                        "area": w_uom * h,
                        "x_center": x_min + w_qty + (w_uom / 2.0),
                        "y_center": (y_min + y_max) / 2.0,
                        "conf": conf,
                    })
                else:
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
    def parse_box_coords(box: Any, img_w: int, img_h: int) -> Tuple[int, int, int, int]:
        """
        Convert diverse box representations into absolute pixel coordinates [x1, y1, x2, y2].
        Supports:
          - Dict: {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.4} (normalized or px)
          - List/Tuple: [x1, y1, x2, y2] or [x, y, w, h]
        """
        if isinstance(box, dict):
            bx = float(box.get("x", box.get("x_min", box.get("left", 0))))
            by = float(box.get("y", box.get("y_min", box.get("top", 0))))
            if "w" in box or "width" in box:
                bw = float(box.get("w", box.get("width", img_w)))
                bh = float(box.get("h", box.get("height", img_h)))
                x1, y1 = bx, by
                x2, y2 = bx + bw, by + bh
            else:
                x1, y1 = bx, by
                x2 = float(box.get("x2", box.get("x_max", box.get("right", img_w))))
                y2 = float(box.get("y2", box.get("y_max", box.get("bottom", img_h))))
        elif isinstance(box, (list, tuple)) and len(box) >= 4:
            b0, b1, b2, b3 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
            # If coordinates are in [0, 1] range (normalized percentages)
            if max(b0, b1, b2, b3) <= 1.0:
                # Check if format is [x, y, w, h] or [x1, y1, x2, y2]
                if b2 > b0 and b3 > b1:
                    x1, y1, x2, y2 = b0 * img_w, b1 * img_h, b2 * img_w, b3 * img_h
                else:
                    x1, y1, x2, y2 = b0 * img_w, b1 * img_h, (b0 + b2) * img_w, (b1 + b3) * img_h
            else:
                if b2 > b0 and b3 > b1:
                    x1, y1, x2, y2 = b0, b1, b2, b3
                else:
                    x1, y1, x2, y2 = b0, b1, b0 + b2, b1 + b3
        else:
            x1, y1, x2, y2 = 0, 0, img_w, img_h

        # Normalize and clamp within image boundaries
        x1_px = max(0, min(int(round(min(x1, x2))), img_w - 1))
        y1_px = max(0, min(int(round(min(y1, y2))), img_h - 1))
        x2_px = max(x1_px + 1, min(int(round(max(x1, x2))), img_w))
        y2_px = max(y1_px + 1, min(int(round(max(y1, y2))), img_h))

        return x1_px, y1_px, x2_px, y2_px

    @staticmethod
    def filter_words_by_roi(
        words: List[Dict[str, Any]],
        box_coords: Tuple[int, int, int, int],
        relativize: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Filter OCR words contained within or intersecting the ROI bounding box.
        If relativize is True, shifts coordinate origin to (x1, y1).
        """
        x1, y1, x2, y2 = box_coords
        filtered: List[Dict[str, Any]] = []

        for w in words:
            # Word center or intersection test
            xc, yc = w["x_center"], w["y_center"]
            if (x1 <= xc <= x2) and (y1 <= yc <= y2):
                if relativize:
                    filtered.append({
                        **w,
                        "x_min": max(0.0, w["x_min"] - x1),
                        "x_max": max(1.0, w["x_max"] - x1),
                        "y_min": max(0.0, w["y_min"] - y1),
                        "y_max": max(1.0, w["y_max"] - y1),
                        "x_center": w["x_center"] - x1,
                        "y_center": w["y_center"] - y1,
                    })
                else:
                    filtered.append(dict(w))

        return filtered

    @staticmethod
    def detect_table_regions(
        image_bgr: np.ndarray,
        ocr_words: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Discover 1, 2, or more separate table candidates in the document using
        morphological line contours and dense text row clusters.
        """
        h, w = image_bgr.shape[:2]
        if not ocr_words:
            return [{
                "id": 1,
                "title": "Table 1",
                "box": [0, 0, w, h],
                "box_norm": [0.0, 0.0, 1.0, 1.0],
            }]

        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        thresh = cv2.adaptiveThreshold(
            cv2.bitwise_not(gray), 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
            15, -2
        )

        # Header semantic keywords to identify distinct table header bands
        header_keywords = {
            "line", "item", "description", "quantity", "qty", "uom", "price",
            "amount", "status", "distribution", "charge account", "budget", "total",
            "category", "unit", "rate", "cost", "requester", "part no", "standards"
        }

        # 1. Morphological grid mask to find bordered boxes
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 30), 1))
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, h // 30)))
        h_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
        v_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, v_kernel)
        grid_mask = cv2.add(h_lines, v_lines)

        contours, _ = cv2.findContours(grid_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidate_boxes: List[Tuple[int, int, int, int]] = []

        for c in contours:
            bx, by, bw, bh = cv2.boundingRect(c)
            # Filter tiny contours or outer page border
            if bw > w * 0.25 and bh > h * 0.06 and (bw * bh) < (w * h * 0.98):
                # Count OCR words inside this box
                words_inside = sum(1 for w_item in ocr_words if bx <= w_item["x_center"] <= bx + bw and by <= w_item["y_center"] <= by + bh)
                if words_inside >= 4:
                    candidate_boxes.append((bx, by, bx + bw, by + bh))

        # 2. If no bordered contours, check for multiple semantic table header rows
        if not candidate_boxes:
            header_tokens = [
                w_item for w_item in ocr_words
                if any(k in w_item["text"].lower() for k in header_keywords)
            ]
            header_tokens.sort(key=lambda w_item: w_item["y_center"])

            # Cluster header tokens by Y
            header_clusters = []
            for t_item in header_tokens:
                if not header_clusters or t_item["y_center"] - header_clusters[-1][-1]["y_center"] > 40:
                    header_clusters.append([t_item])
                else:
                    header_clusters[-1].append(t_item)

            # Filter clusters that have >= 3 distinct header tokens (valid table headers)
            valid_headers = [c for c in header_clusters if len(c) >= 3]

            if len(valid_headers) >= 2:
                # Multiple distinct tables identified!
                for idx, h_cluster in enumerate(valid_headers):
                    y_start = max(0, int(min(item["y_min"] for item in h_cluster) - 12))
                    if idx + 1 < len(valid_headers):
                        y_end = int(min(item["y_min"] for item in valid_headers[idx + 1]) - 15)
                    else:
                        y_end = h

                    table_words = [w_item for w_item in ocr_words if y_start <= w_item["y_center"] <= y_end]
                    if len(table_words) >= 4:
                        x_start = max(0, int(min(item["x_min"] for item in table_words) - 10))
                        x_end = min(w, int(max(item["x_max"] for item in table_words) + 10))
                        candidate_boxes.append((x_start, y_start, x_end, y_end))

        # 3. Fallback: cluster OCR lines into distinct vertical table blocks by large vertical whitespace
        if not candidate_boxes:
            heights = [item["h"] for item in ocr_words if item["h"] > 2]
            median_h = float(np.median(heights)) if heights else 20.0
            sorted_words = sorted(ocr_words, key=lambda w_item: w_item["y_center"])

            # Group into lines
            lines: List[List[Dict[str, Any]]] = []
            for word in sorted_words:
                if not lines or abs(word["y_center"] - lines[-1][0]["y_center"]) > median_h * 0.7:
                    lines.append([word])
                else:
                    lines[-1].append(word)

            # Discover large vertical gaps between line groups (> 3 * median_h)
            blocks: List[List[List[Dict[str, Any]]]] = []
            current_block: List[List[Dict[str, Any]]] = []
            for i, line in enumerate(lines):
                if not current_block:
                    current_block.append(line)
                else:
                    prev_y = max(w_item["y_max"] for w_item in current_block[-1])
                    curr_y = min(w_item["y_min"] for w_item in line)
                    if (curr_y - prev_y) > max(45.0, median_h * 3.2):
                        if len(current_block) >= 2:
                            blocks.append(current_block)
                        current_block = [line]
                    else:
                        current_block.append(line)

            if current_block and len(current_block) >= 2:
                blocks.append(current_block)

            # Convert multi-line blocks to bounding boxes
            for blk in blocks:
                blk_words = [w_item for l in blk for w_item in l]
                if len(blk_words) >= 4:
                    bx1 = max(0, int(min(w_item["x_min"] for w_item in blk_words) - 10))
                    by1 = max(0, int(min(w_item["y_min"] for w_item in blk_words) - 8))
                    bx2 = min(w, int(max(w_item["x_max"] for w_item in blk_words) + 10))
                    by2 = min(h, int(max(w_item["y_max"] for w_item in blk_words) + 8))
                    candidate_boxes.append((bx1, by1, bx2, by2))

        # Sort candidate boxes top-to-bottom
        candidate_boxes.sort(key=lambda b: b[1])

        # Merge overlapping or nested boxes (only if significant vertical overlap > 35%)
        merged: List[Tuple[int, int, int, int]] = []
        for box in candidate_boxes:
            if not merged:
                merged.append(box)
            else:
                prev = merged[-1]
                overlap = max(0, min(prev[3], box[3]) - max(prev[1], box[1]))
                min_h = min(prev[3] - prev[1], box[3] - box[1])
                if min_h > 0 and (overlap / float(min_h)) > 0.35:
                    merged[-1] = (
                        min(prev[0], box[0]),
                        min(prev[1], box[1]),
                        max(prev[2], box[2]),
                        max(prev[3], box[3])
                    )
                else:
                    merged.append(box)

        # If we found 1 or more distinct valid regions
        if merged:
            regions = []
            for idx, (x1, y1, x2, y2) in enumerate(merged, start=1):
                bw = x2 - x1
                bh = y2 - y1
                regions.append({
                    "id": idx,
                    "title": f"Table {idx}",
                    "box": [x1, y1, x2, y2],
                    "box_norm": [
                        round(x1 / max(1, w), 4),
                        round(y1 / max(1, h), 4),
                        round(bw / max(1, w), 4),
                        round(bh / max(1, h), 4)
                    ]
                })
            return regions

        # Default fallback: entire page
        return [{
            "id": 1,
            "title": "Table 1",
            "box": [0, 0, w, h],
            "box_norm": [0.0, 0.0, 1.0, 1.0]
        }]

    @staticmethod
    def compute_table_quality(
        matrix: List[List[str]],
        ocr_words: List[Dict[str, Any]],
        region_words: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Compute table extraction confidence score (0 to 100) and complexity indicators.
        """
        if not matrix or len(matrix) == 0:
            return {
                "score": 0,
                "is_complex": True,
                "sparsity": 1.0,
                "avg_confidence": 0.0,
                "message": "No table rows extracted"
            }

        num_rows = len(matrix)
        num_cols = len(matrix[0]) if num_rows > 0 else 0
        total_cells = num_rows * num_cols

        if total_cells == 0:
            return {"score": 0, "is_complex": True, "sparsity": 1.0, "avg_confidence": 0.0, "message": "Empty grid"}

        empty_cells = sum(1 for row in matrix for cell in row if not str(cell).strip())
        sparsity = empty_cells / float(total_cells)

        confs = [w.get("conf", 0.9) for w in region_words if "conf" in w]
        avg_conf = float(np.mean(confs)) if confs else 0.85

        # Ratio of text inside this table vs total page text
        inside_ratio = len(region_words) / max(1.0, float(len(ocr_words)))

        # Penalties for column explosion / high sparsity
        col_penalty = max(0.0, (num_cols - 10) * 0.04) if num_cols > 10 else 0.0
        sparsity_penalty = max(0.0, (sparsity - 0.20) * 0.8) if sparsity > 0.20 else 0.0

        # Calculate composite score [0 .. 100]
        score_val = (avg_conf * 0.5 + (1.0 - sparsity_penalty) * 0.5 - col_penalty) * 100.0
        score = max(5, min(99, int(round(score_val))))

        # Complexity determination
        is_complex = sparsity > 0.38 or num_cols > 12 or avg_conf < 0.68 or score < 75

        if score >= 85 and not is_complex:
            message = "High-confidence clean table extraction"
        elif not is_complex:
            message = "Good extraction confidence"
        else:
            message = "Complex or sparse table — manual box adjustment recommended if needed"

        return {
            "score": score,
            "is_complex": is_complex,
            "sparsity": round(sparsity, 3),
            "avg_confidence": round(avg_conf, 3),
            "inside_ratio": round(inside_ratio, 3),
            "message": message,
        }

    @staticmethod
    def _cluster_into_rows(
        words: List[Dict[str, Any]],
        median_h: float,
    ) -> List[List[Dict[str, Any]]]:
        """Group word bounding boxes into horizontal visual lines using strict non-chaining vertical overlap."""
        if not words:
            return []

        sorted_words = sorted(words, key=lambda w: (w["y_center"], w["x_min"]))
        rows: List[List[Dict[str, Any]]] = []

        for word in sorted_words:
            matched_row = None
            best_overlap = 0.0

            for row in rows:
                row_yc = sum(w["y_center"] for w in row) / len(row)
                avg_h = sum(w["h"] for w in row) / len(row)

                # Strict center distance check: word must be within 38% of line font height
                if abs(word["y_center"] - row_yc) < avg_h * 0.38:
                    row_ymin = sum(w["y_min"] for w in row) / len(row)
                    row_ymax = sum(w["y_max"] for w in row) / len(row)
                    overlap = max(0.0, min(word["y_max"], row_ymax) - max(word["y_min"], row_ymin))
                    overlap_ratio = overlap / max(1.0, min(word["h"], avg_h))

                    if overlap_ratio >= 0.30 and overlap_ratio > best_overlap:
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

        h_len = max(20, w // 35)
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_len, 1))
        h_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)

        v_len = max(12, h // 35)
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_len))
        v_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, v_kernel)

        h_proj = np.sum(h_lines, axis=1)
        v_proj = np.sum(v_lines, axis=0)

        h_peaks = np.where(h_proj > (w * 255 * 0.12))[0]
        v_peaks = np.where(v_proj > (h * 255 * 0.08))[0]

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

        row_dividers = _group_peaks(h_peaks, max(8.0, median_h * 0.55))
        col_dividers = _group_peaks(v_peaks, max(12.0, median_w * 0.35))

        if len(row_dividers) >= 2 and len(col_dividers) >= 2:
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
                # Prune totally empty columns
                cols_to_keep = [
                    c_idx for c_idx in range(len(non_empty_rows[0]))
                    if any(row[c_idx].strip() for row in non_empty_rows)
                ]
                if cols_to_keep:
                    non_empty_rows = [[row[c] for c in cols_to_keep] for row in non_empty_rows]
                logger.info("Extracted %d rows via Tier 1 Morphological Grid.", len(non_empty_rows))
                return non_empty_rows

        return None

    @staticmethod
    def extract_single_region(
        image_bgr: np.ndarray,
        ocr_words: List[Dict[str, Any]],
        crop_box: Optional[Any] = None,
    ) -> List[List[str]]:
        """
        Extract table matrix from an image or specific crop box.
        """
        h_full, w_full = image_bgr.shape[:2]

        if crop_box is not None:
            x1, y1, x2, y2 = TableDetector.parse_box_coords(crop_box, w_full, h_full)
            roi_img = image_bgr[y1:y2, x1:x2]
            roi_words = TableDetector.filter_words_by_roi(ocr_words, (x1, y1, x2, y2), relativize=True)
            if roi_img.size == 0 or not roi_words:
                return [["Header"], ["No text found in selected region"]]
            working_img = roi_img
            working_words = roi_words
        else:
            working_img = image_bgr
            working_words = ocr_words

        if not working_words:
            return [["Header"], ["No text recognized"]]

        h, w = working_img.shape[:2]
        heights = [item["h"] for item in working_words if item["h"] > 2]
        median_h = float(np.median(heights)) if heights else 20.0
        widths = [item["w"] for item in working_words if item["w"] > 2]
        median_w = float(np.median(widths)) if widths else 50.0

        # Tier 1: Try Bordered Grid Line Extraction
        grid_result = TableDetector._extract_bordered_grid(working_img, working_words, median_h, median_w)
        if grid_result and len(grid_result) >= 2:
            return grid_result

        # Tier 2: Adaptive Virtual Grid for Borderless Tables
        lines = TableDetector._cluster_into_rows(working_words, median_h)
        if not lines:
            return [["Header"], ["No table structure detected"]]

        col_bounds = TableDetector._detect_column_bounds(lines, w, median_w)
        num_cols = len(col_bounds)

        if num_cols == 0:
            return [["Text"], *[[w_item["text"]] for w_item in working_words]]

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
                cell_words.sort(key=lambda w_item: w_item["x_min"])
                text = " ".join(w_item["text"] for w_item in cell_words).strip()
                formatted_row.append(text)

            raw_table.append(formatted_row)

        # Merge continuation rows (wrapped descriptions)
        merged_table: List[List[str]] = []
        for row in raw_table:
            non_empty_indices = [i for i, cell in enumerate(row) if cell.strip()]
            if not non_empty_indices:
                continue

            # Check if this row is a wrapped description continuation of previous row
            is_continuation = False
            if merged_table and len(merged_table) > 0:
                # If first column (Item/Line #) is empty and there are only 1-3 non-empty columns
                first_cell_empty = not row[0].strip()
                starts_with_keyword = any(
                    re.match(r'^(total|subtotal|tax|discount|grand total|requester|deliver|supplier|urgent)', row[idx], re.IGNORECASE)
                    for idx in non_empty_indices
                )
                if first_cell_empty and len(non_empty_indices) <= max(2, num_cols // 2) and not starts_with_keyword:
                    is_continuation = True

            if is_continuation:
                for col_i in non_empty_indices:
                    if merged_table[-1][col_i]:
                        merged_table[-1][col_i] = (merged_table[-1][col_i] + " " + row[col_i]).strip()
                    else:
                        merged_table[-1][col_i] = row[col_i].strip()
            else:
                merged_table.append(row)

        # If row 0 is just an outer section banner (e.g. ['Lines'] or ['Distributions'] with only 1 text item)
        # and row 1 contains full column headers (>= 3 text items), promote row 1 to header
        if len(merged_table) >= 2:
            row0_filled = [c for c in merged_table[0] if c.strip()]
            row1_filled = [c for c in merged_table[1] if c.strip()]
            if len(row0_filled) == 1 and len(row1_filled) >= 3:
                merged_table = merged_table[1:]

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

    @staticmethod
    def extract(
        image_bgr: np.ndarray,
        ocr_words: List[Dict[str, Any]],
        crop_box: Optional[Any] = None,
    ) -> List[List[str]]:
        """Legacy compatibility wrapper for single-region extraction."""
        return TableDetector.extract_single_region(image_bgr, ocr_words, crop_box=crop_box)

    @staticmethod
    def extract_all(
        image_bgr: np.ndarray,
        ocr_words: List[Dict[str, Any]],
        custom_boxes: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """
        Master extraction entry point supporting automated multi-table segmentation
        or user-defined ROI boxes, complete with quality scores for each table.
        """
        h, w = image_bgr.shape[:2]

        # Determine target regions
        if custom_boxes and len(custom_boxes) > 0:
            target_regions = []
            for idx, box in enumerate(custom_boxes, start=1):
                x1, y1, x2, y2 = TableDetector.parse_box_coords(box, w, h)
                bw, bh = x2 - x1, y2 - y1
                target_regions.append({
                    "id": idx,
                    "title": f"Selection {idx}" if len(custom_boxes) > 1 else "Custom Selection",
                    "box": [x1, y1, x2, y2],
                    "box_norm": [
                        round(x1 / max(1, w), 4),
                        round(y1 / max(1, h), 4),
                        round(bw / max(1, w), 4),
                        round(bh / max(1, h), 4)
                    ]
                })
        else:
            target_regions = TableDetector.detect_table_regions(image_bgr, ocr_words)

        extracted_tables = []
        scores = []

        for region in target_regions:
            box_coords = (region["box"][0], region["box"][1], region["box"][2], region["box"][3])
            region_words = TableDetector.filter_words_by_roi(ocr_words, box_coords, relativize=False)

            # Extract table matrix
            raw_matrix = TableDetector.extract_single_region(image_bgr, ocr_words, crop_box=region["box"])
            quality = TableDetector.compute_table_quality(raw_matrix, ocr_words, region_words)

            headers = raw_matrix[0] if raw_matrix else []
            rows = raw_matrix[1:] if len(raw_matrix) > 1 else []

            extracted_tables.append({
                "id": region["id"],
                "title": region.get("title", f"Table {region['id']}"),
                "box": region["box"],
                "box_norm": region.get("box_norm", [0.0, 0.0, 1.0, 1.0]),
                "headers": headers,
                "rows": rows,
                "quality": quality,
            })
            scores.append(quality["score"])

        overall_score = int(np.mean(scores)) if scores else 80
        is_complex = len(extracted_tables) > 1 or any(t["quality"]["is_complex"] for t in extracted_tables)

        if len(extracted_tables) > 1:
            overall_msg = f"{len(extracted_tables)} distinct tables detected. Switch tabs above to inspect each."
        elif is_complex:
            overall_msg = "Table extracted with warnings — use drag selection to crop if needed."
        else:
            overall_msg = "Single clean table extracted successfully."

        return {
            "tables": extracted_tables,
            "quality": {
                "score": overall_score,
                "is_complex": is_complex,
                "total_tables": len(extracted_tables),
                "message": overall_msg,
            },
            # Top-level backwards compatibility fields
            "headers": extracted_tables[0]["headers"] if extracted_tables else [],
            "rows": extracted_tables[0]["rows"] if extracted_tables else [],
        }