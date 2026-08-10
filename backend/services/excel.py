import openpyxl
from openpyxl.styles import Font
from pathlib import Path
from typing import List

class ExcelGenerator:
    @staticmethod
    def generate(headers: List[str], rows: List[List[str]], output_path: Path) -> Path:
        """Generates a clean unformatted Excel file preserving row/column order."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Extracted Data"

        # Append table headers
        if headers:
            ws.append(headers)
            for cell in ws[1]:
                cell.font = Font(bold=True)

        # Append data rows
        for row in rows:
            ws.append(row)

        wb.save(output_path)
        return output_path