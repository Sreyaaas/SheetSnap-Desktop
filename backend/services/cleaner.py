"""
SheetSnap Text Cleaner — Regex and unigram language model post-processor for OCR output.

Fixes common OCR artifacts:
1. Missing spaces after colons, semicolons, and commas (without breaking ratios or numbers).
2. Parentheses boundary spacing (e.g. `(0.5 LT/CN)(SL12 AC)` → `(0.5 LT/CN) (SL12 AC)`).
3. Hyphenated word repair (e.g. `SHELF- LIFE` → `SHELF-LIFE`).
4. camelCase boundaries (`CableGreen` → `Cable Green`).
5. Stuck number-unit pairs (`250MTR` → `250 MTR`, `10EA` → `10 EA`, `2.EA` → `2. EA`).
6. Long digit codes attached to words (`794339Contractor` → `794339 Contractor`).
7. Dense all-caps word segmentation using WordNinja unigram language model
   (`PIONEERCENTRIFUGALSPRAY` → `PIONEER CENTRIFUGAL SPRAY`,
    `HOTWATERHEATERTANK` → `HOT WATER HEATER TANK`,
    `UNIONFLARELESSBRASS` → `UNION FLARELESS BRASS`)
   with strict protection for alphanumeric part numbers (`IMPA734022`, `OSRAM64788`, `ECT120200`).
"""

import re
from typing import List

try:
    import wordninja
except ImportError:
    wordninja = None


class TextCleaner:
    """Stateless normalizer and unigram language model segmenter for OCR text."""

    @classmethod
    def _split_token(cls, word: str) -> str:
        """
        Split pure-alpha all-caps compound words using WordNinja unigram frequency.
        Strictly preserves alphanumeric part codes, abbreviations <= 4 chars, and mixed-case words.
        """
        if len(word) < 6 or not word.isupper() or not word.isalpha():
            return word

        if wordninja is not None:
            try:
                splits = wordninja.split(word)
                if len(splits) > 1:
                    # Clean compound output in uppercase
                    return " ".join(s.upper() for s in splits)
            except Exception:
                pass

        return word

    @classmethod
    def _split_caps_word(cls, text: str) -> str:
        """Helper to process word tokens while respecting punctuation like hyphens or slashes."""
        def sub_repl(m):
            return cls._split_token(m.group(0))

        return re.sub(r'[A-Z]{6,}', sub_repl, text)

    @classmethod
    def clean_cell(cls, text: str) -> str:
        """
        Clean and format a single table cell string.
        """
        if not text:
            return ""

        # 1. Missing space after commas (not before digits — e.g. "1,000")
        text = re.sub(r',([^\s0-9])', r', \1', text)

        # 2. Colon spacing (e.g. "COMPOUND:PATCHING" -> "COMPOUND: PATCHING", avoiding "http://", "12:30")
        text = re.sub(r'([A-Za-z0-9]):([^\s/0-9])', r'\1: \2', text)

        # 3. Semicolon spacing (e.g. "ITEM;MSDS" -> "ITEM; MSDS")
        text = re.sub(r';([^\s])', r'; \1', text)

        # 4. Parentheses boundaries (e.g. "(CN)(SL)" -> "(CN) (SL)", "409(12" -> "409 (12")
        text = re.sub(r'\)([\w(])', r') \1', text)
        text = re.sub(r'([A-Za-z0-9])\(', r'\1 (', text)

        # 5. Fix broken hyphen spacing (e.g. "SHELF- LIFE" -> "SHELF-LIFE")
        text = re.sub(r'([A-Za-z])- ([A-Za-z])', r'\1-\2', text)

        # 6. camelCase boundaries
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)

        # 7. Number + unit separation (e.g. "250MTR" -> "250 MTR", "2.EA" -> "2. EA")
        text = re.sub(r'([0-9]+\.?)([A-Za-z]{2,})', r'\1 \2', text)

        # 8. Long digit code + word separation
        text = re.sub(r'([0-9]{3,})([a-zA-Z])', r'\1 \2', text)

        # 9. Currency symbol boundary normalization ($ 100 -> $100, etc.)
        text = re.sub(r'([$€£₹¥])\s+([0-9])', r'\1\2', text)

        # 10. All-caps compound word segmentation via Unigram Language Model
        text = cls._split_caps_word(text)

        # 11. Collapse multiple whitespace to single space
        text = re.sub(r'\s+', ' ', text)

        return text.strip()

    @classmethod
    def clean_matrix(cls, matrix: List[List[str]]) -> List[List[str]]:
        """Apply clean_cell to every cell in the table matrix."""
        if not matrix:
            return matrix
        return [
            [cls.clean_cell(cell) for cell in row]
            for row in matrix
        ]