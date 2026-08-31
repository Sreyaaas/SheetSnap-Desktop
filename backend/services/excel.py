"""
SheetSnap Excel Generator — Creates clean single and multi-sheet .xlsx workbooks.

Produces spreadsheets compatible with Microsoft Excel, Google Sheets, and LibreOffice.
Headers are styled and bolded for readability. Multi-table exports create dedicated
sheets for each detected/selected table.
"""

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from pathlib import Path
from typing import List, Dict, Any, Union


class ExcelGenerator:
    """Generates clean Excel workbooks from single or multi-table data."""

    @staticmethod
    def _populate_sheet(ws, headers: List[str], rows: List[List[str]]) -> None:
        """Helper to write headers and rows with clean formatting to a worksheet."""
        header_font = Font(name="Calibri", size=11, bold=True, color="1E293B")
        header_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        cell_font = Font(name="Calibri", size=11)

        # Enable visible gridlines in spreadsheet view
        if hasattr(ws, 'views') and ws.views and ws.views.sheetView:
            ws.views.sheetView[0].showGridLines = True

        # 1. Header row
        if headers:
            ws.append(headers)
            for col_num, cell in enumerate(ws[1], 1):
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="left", vertical="center")

        # 2. Data rows
        num_cols = len(headers) if headers else 0
        for row in rows:
            if num_cols > 0:
                normalised = list(row[:num_cols]) + [""] * max(0, num_cols - len(row))
                ws.append(normalised)
            else:
                ws.append(row)

        # Apply basic cell font
        for row_cells in ws.iter_rows(min_row=2):
            for cell in row_cells:
                cell.font = cell_font

        # 3. Auto-fit column widths (with safety bounds 10..60)
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or '')
                max_len = max(max_len, len(val))
            ws.column_dimensions[col_letter].width = max(10, min(max_len + 3, 50))

    @staticmethod
    def generate(headers: List[str], rows: List[List[str]], output_path: Path) -> Path:
        """Create a single-sheet .xlsx file with bolded headers and data rows."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Extracted Data"
        ExcelGenerator._populate_sheet(ws, headers, rows)
        wb.save(str(output_path))
        return output_path

    @staticmethod
    def generate_multi(tables: List[Dict[str, Any]], output_path: Path) -> Path:
        """
        Create a multi-sheet .xlsx file where each table gets its own worksheet tab.
        """
        if not tables:
            return ExcelGenerator.generate([], [], output_path)

        if len(tables) == 1:
            return ExcelGenerator.generate(tables[0].get("headers", []), tables[0].get("rows", []), output_path)

        wb = openpyxl.Workbook()
        # Remove default empty sheet later or reuse as first sheet
        first = True

        for idx, tbl in enumerate(tables, 1):
            title = tbl.get("title", f"Table {idx}")
            # Clean title for Excel sheet name limits (max 31 chars, no invalid symbols)
            clean_title = "".join(c for c in title if c not in r":\/?*[]")[:30].strip() or f"Table {idx}"

            if first:
                ws = wb.active
                ws.title = clean_title
                first = False
            else:
                ws = wb.create_sheet(title=clean_title)

            ExcelGenerator._populate_sheet(ws, tbl.get("headers", []), tbl.get("rows", []))

        wb.save(str(output_path))
        return output_path