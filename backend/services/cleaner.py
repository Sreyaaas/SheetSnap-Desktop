"""
SheetSnap Text Cleaner — Regex and vocabulary post-processor for OCR output.

Fixes common OCR artifacts:
1. Missing spaces after colons, semicolons, and commas (without breaking ratios or numbers).
2. Parentheses boundary spacing (e.g. `(0.5 LT/CN)(SL12 AC)` → `(0.5 LT/CN) (SL12 AC)`).
3. Hyphenated word repair (e.g. `SHELF- LIFE` → `SHELF-LIFE`).
4. camelCase boundaries (`CableGreen` → `Cable Green`).
5. Stuck number-unit pairs (`250MTR` → `250 MTR`, `10EA` → `10 EA`).
6. Long digit codes attached to words (`794339Contractor` → `794339 Contractor`).
7. Dense all-caps word segmentation (`FORPVCCOATED` → `FOR PVC COATED`, `LIFEITEM` → `LIFE ITEM`, `MSDSITEM` → `MSDS ITEM`).
"""

import re
from typing import List, Set


class TextCleaner:
    """Stateless normalizer and domain vocabulary segmenter for OCR text."""

    COMMON_WORDS: Set[str] = {
        "FOR", "WITH", "WITHOUT", "FROM", "AND", "THE", "PER", "NON", "PRE",
        "PVC", "MSDS", "IMPA", "ITEM", "CODE", "SPEC", "UOM", "QTY", "SIZE",
        "TYPE", "LIFE", "COATED", "STEEL", "PLATE", "SHEET", "VALVE", "PIPE",
        "TAPE", "CLEANER", "SPRAY", "LIGHT", "CABLE", "GAUGE", "METER", "SAMPLE",
        "PHOTO", "ATTACHED", "COMPOUND", "PATCHING", "CONDUIT", "SINGLE",
        "WIRELESS", "GAS", "MONITOR", "HOT", "ROLLED", "STAINLESS", "BATHROOM",
        "LIQUID", "DISINFECTANT", "FORMULA", "AMMETER", "VOLTMETER", "WATTMETER",
        "INSULATION", "RESISTANCE", "MEASURING", "LINEN", "METAL", "CASE",
        "HAND", "HELD", "STEAM", "SHOULDER", "SPRAYER", "RUBBER", "SAUSAGE",
        "ROUND", "FENDERS", "MODEL", "MAKER", "COMPLETE", "STOCK", "STATUS",
        "PENDING", "FUNDS", "APPROVAL", "RESERVED", "ORDER", "PRICE", "AMOUNT",
        "TOTAL", "UNIT", "NET", "GROSS", "WEIGHT", "DESCRIPTION", "CATEGORY"
    }

    @classmethod
    def _split_token(cls, word: str) -> str:
        """
        Split pure-alpha all-caps compound words (e.g. 'FORPVCCOATED' -> 'FOR PVC COATED',
        'LIFEITEM' -> 'LIFE ITEM', 'MSDSITEM' -> 'MSDS ITEM')
        using dynamic programming dictionary segmentation.
        """
        if len(word) < 5 or not word.isupper() or not word.isalpha():
            return word

        n = len(word)
        dp = {0: []}
        for i in range(1, n + 1):
            for j in range(max(0, i - 16), i):
                if j in dp:
                    sub = word[j:i]
                    if sub in cls.COMMON_WORDS:
                        candidate = dp[j] + [sub]
                        if i not in dp or len(candidate) < len(dp[i]):
                            dp[i] = candidate

        if n in dp and len(dp[n]) > 1:
            return " ".join(dp[n])

        # Fallback: Check known prefixes / suffixes
        for kw in ["MSDS", "PVC", "IMPA", "ITEM", "CODE", "SPEC", "FOR", "LIFE", "WITH"]:
            if word.startswith(kw) and len(word) > len(kw) + 2:
                rem = word[len(kw):]
                if rem in cls.COMMON_WORDS or len(rem) >= 4:
                    return f"{kw} {cls._split_token(rem)}"
            if word.endswith(kw) and len(word) > len(kw) + 2:
                pref = word[:-len(kw)]
                if pref in cls.COMMON_WORDS or len(pref) >= 4:
                    return f"{cls._split_token(pref)} {kw}"

        return word

    @classmethod
    def _split_caps_word(cls, text: str) -> str:
        """Helper to process word tokens while respecting punctuation like hyphens or slashes."""
        def sub_repl(m):
            return cls._split_token(m.group(0))

        return re.sub(r'[A-Z]{5,}', sub_repl, text)

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

        # 7. Number + unit separation (≥2 alpha chars to avoid e.g. "3A")
        text = re.sub(r'([0-9])([A-Za-z]{2,})', r'\1 \2', text)

        # 8. Long digit code + word separation
        text = re.sub(r'([0-9]{3,})([a-zA-Z])', r'\1 \2', text)

        # 9. All-caps compound word segmentation
        text = cls._split_caps_word(text)

        # 10. Collapse multiple whitespace to single space
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