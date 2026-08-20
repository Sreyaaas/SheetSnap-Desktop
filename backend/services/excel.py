"""
SheetSnap Excel Generator — Creates clean .xlsx workbooks.

Produces unformatted spreadsheets compatible with Microsoft Excel,
Google Sheets, and LibreOffice Calc.  Headers are bolded for readability.
"""

import openpyxl
from openpyxl.styles import Font
from pathlib import Path
from typing import List


class ExcelGenerator:
    """Generates clean Excel workbooks from structured table data."""

    @staticmethod
    def generate(headers: List[str], rows: List[List[str]], output_path: Path) -> Path:
        """
        Create an .xlsx file with bolded headers and data rows.

        Parameters
        ----------
        headers : column header strings
        rows : 2D list of cell values
        output_path : where to save the .xlsx file

        Returns the output_path for chaining.
        """
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Extracted Data"

        # Append header row with bold font
        if headers:
            ws.append(headers)
            for cell in ws[1]:
                cell.font = Font(bold=True)

        # Append data rows, normalising column count to match headers
        num_cols = len(headers) if headers else 0
        for row in rows:
            # Pad short rows with empty strings, truncate long rows
            if num_cols > 0:
                normalised = list(row[:num_cols]) + [""] * max(0, num_cols - len(row))
                ws.append(normalised)
            else:
                ws.append(row)

        wb.save(str(output_path))
        return output_path