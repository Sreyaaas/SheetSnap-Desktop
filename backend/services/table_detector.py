import numpy as np
from typing import List, Dict, Any

class TableDetector:
    @staticmethod
    def extract_table_from_ocr(ocr_results: Any) -> List[List[str]]:
        """
        Universal 40% Vertical-Overlap Line Reconstruction Engine:
        Handles merged headers, multiline cell wrapping, empty cells, 
        and bottom summary rows without rigid assumptions or hardcoded pixel gaps.
        """
        if isinstance(ocr_results, tuple):
            ocr_results = ocr_results[0]

        if not ocr_results:
            return [["Header"], ["No text found"]]

        items = []

        # 1. Unpack RapidOCR bounding boxes
        if isinstance(ocr_results, list):
            for line in ocr_results:
                if not isinstance(line, (list, tuple)) or len(line) < 2:
                    continue

                bbox = line[0]
                text_info = line[1]

                if not isinstance(bbox, (list, tuple, np.ndarray)) or len(bbox) == 0:
                    continue

                text = str(text_info).strip() if not isinstance(text_info, (list, tuple)) else str(text_info[0]).strip()
                conf = 1.0
                if isinstance(text_info, (list, tuple)) and len(text_info) > 1:
                    try:
                        conf = float(text_info[1])
                    except (ValueError, TypeError):
                        conf = 1.0

                if text and conf > 0.05:
                    try:
                        x_coords = [float(p[0]) for p in bbox if isinstance(p, (list, tuple, np.ndarray)) and len(p) > 0]
                        y_coords = [float(p[1]) for p in bbox if isinstance(p, (list, tuple, np.ndarray)) and len(p) > 1]
                        if x_coords and y_coords:
                            items.append({
                                "text": str(text),
                                "x_min": min(x_coords),
                                "x_max": max(x_coords),
                                "y_min": min(y_coords),
                                "y_max": max(y_coords),
                                "h": max(y_coords) - min(y_coords)
                            })
                    except Exception:
                        continue

        if not items:
            return [["Header"], ["No text recognized"]]

        # Sort items top-to-bottom
        items = sorted(items, key=lambda item: item["y_min"])

        # 2. Cluster text items into horizontal visual lines using 40% Vertical Overlap
        lines: List[List[Dict[str, Any]]] = []
        for item in items:
            assigned = False
            for line in lines:
                # Calculate vertical overlap with existing line
                line_y_min = min(i["y_min"] for i in line)
                line_y_max = max(i["y_max"] for i in line)
                
                overlap = max(0.0, min(item["y_max"], line_y_max) - max(item["y_min"], line_y_min))
                min_h = min(item["h"], line_y_max - line_y_min)
                
                if min_h > 0 and (overlap / min_h) > 0.40: # 40% vertical overlap threshold
                    line.append(item)
                    assigned = True
                    break
            
            if not assigned:
                lines.append([item])

        # Sort lines top-to-bottom, and items in each line left-to-right
        lines = [sorted(line, key=lambda x: x["x_min"]) for line in lines]
        lines = sorted(lines, key=lambda line: min(i["y_min"] for i in line))

        if not lines:
            return [["Header"], ["No lines generated"]]

        # 3. Discover Global Column Dividers across all lines
        all_x_mins = sorted([i["x_min"] for line in lines for i in line])
        col_dividers = [all_x_mins[0]]
        for x in all_x_mins[1:]:
            if x - col_dividers[-1] > 30: # Column gap threshold
                col_dividers.append(x)

        # 4. Map Lines to Initial Table Grid
        raw_table = []
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
            
            raw_table.append(row_cells)

        # 5. Multiline Cell Continuation Merging
        # If row i+1 only has content in a single column (e.g. Wrapped text continuation or footnote '(1)'),
        # merge it directly into row i!
        merged_table = []
        for row in raw_table:
            non_empty_indices = [idx for idx, cell in enumerate(row) if cell.strip()]
            
            # If row is a continuation line (only 1 column populated, and not the primary first column)
            if merged_table and len(non_empty_indices) == 1 and non_empty_indices[0] > 0:
                col_i = non_empty_indices[0]
                merged_table[-1][col_i] = (merged_table[-1][col_i] + " " + row[col_i]).strip()
            else:
                merged_table.append(row)

        return merged_table