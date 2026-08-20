"""
SheetSnap Text Cleaner — Regex post-processor for OCR output.

Fixes common OCR artifacts: missing spaces after commas, stuck number-unit
pairs, attached item codes, and excess whitespace.  Operates cell-by-cell
or across an entire table matrix.
"""

import re
from typing import List


class TextCleaner:
    """Stateless regex normalizer for OCR-extracted text."""

    @staticmethod
    def clean_cell(text: str) -> str:
        """
        Clean a single OCR cell value.

        Fixes applied (in order):
        1. Insert space after comma when followed by a non-space, non-digit
           ('CABLE,GREEN' → 'CABLE, GREEN')
        2. Separate camelCase word boundaries
           ('CableGreen' → 'Cable Green')
        3. Separate digit sequences from trailing unit text (≥2 alpha chars)
           ('250MTR' → '250 MTR', '10EA' → '10 EA')
        4. Separate long digit codes from attached words
           ('794339Contractor' → '794339 Contractor')
        5. Collapse multiple whitespace to single space
        """
        if not text:
            return ""

        # 1. Fix missing space after commas (not before digits — e.g. "1,000")
        text = re.sub(r',([^\s0-9])', r', \1', text)

        # 2. camelCase boundaries
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)

        # 3. Number + unit separation (≥2 alpha chars to avoid e.g. "3A")
        text = re.sub(r'([0-9])([A-Za-z]{2,})', r'\1 \2', text)

        # 4. Long digit code + word separation
        text = re.sub(r'([0-9]{3,})([a-zA-Z])', r'\1 \2', text)

        # 5. Collapse whitespace
        text = re.sub(r'\s+', ' ', text)

        return text.strip()

    @staticmethod
    def clean_matrix(matrix: List[List[str]]) -> List[List[str]]:
        """Apply clean_cell to every cell in the table matrix."""
        if not matrix:
            return matrix
        return [
            [TextCleaner.clean_cell(cell) for cell in row]
            for row in matrix
        ]