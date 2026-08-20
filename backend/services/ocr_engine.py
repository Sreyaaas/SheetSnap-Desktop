"""
SheetSnap OCR Engine — Singleton RapidOCR ONNX Runtime Wrapper.

Loads the ONNX text-detection + recognition models exactly once on first call.
All subsequent calls reuse the warm engine for sub-second inference.
"""

import logging
from typing import Optional

import numpy as np
from rapidocr_onnxruntime import RapidOCR

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Abstract base (future-proofs engine swaps without touching callers)
# ---------------------------------------------------------------------------

class BaseOCREngine:
    """Contract that any OCR backend must satisfy."""

    def run_full_page(self, image: np.ndarray):
        """
        Run OCR across the full image and return the raw result list.
        Each item: [bbox_4pt, text, confidence]
        """
        raise NotImplementedError

    def extract_text(self, image_crop: np.ndarray) -> str:
        """Run OCR on a small crop and return concatenated text."""
        raise NotImplementedError


# ---------------------------------------------------------------------------
# RapidOCR ONNX implementation
# ---------------------------------------------------------------------------

class RapidOCREngine(BaseOCREngine):
    """Lightweight CPU-only OCR powered by RapidOCR + ONNX Runtime."""

    def __init__(self):
        logger.info("Initializing RapidOCR ONNX engine...")
        self.engine = RapidOCR()
        logger.info("RapidOCR engine ready.")

    def run_full_page(self, image: np.ndarray):
        """Return (results_list, elapsed_info) from full-page OCR."""
        if image is None or image.size == 0:
            return [], None
        result, elapsed = self.engine(image)
        return result if result else [], elapsed

    def extract_text(self, image_crop: np.ndarray) -> str:
        """Run OCR on a small crop and return concatenated text."""
        if image_crop is None or image_crop.size == 0:
            return ""
        result, _ = self.engine(image_crop)
        if not result:
            return ""
        texts = [line[1] for line in result if float(line[2]) > 0.3]
        return " ".join(texts).strip()


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_ocr_singleton: Optional[BaseOCREngine] = None


def get_ocr_engine() -> BaseOCREngine:
    """Return the globally cached OCR engine (created on first call)."""
    global _ocr_singleton
    if _ocr_singleton is None:
        _ocr_singleton = RapidOCREngine()
    return _ocr_singleton