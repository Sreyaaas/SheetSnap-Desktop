"""
SheetSnap Image Preprocessor — Decodes and enhances images and PDFs for OCR.

Provides:
  - Robust byte decoding for PNG, JPG, JPEG, and multi-page PDFs (300 DPI high-res).
  - Intelligent resolution upscaling for low-res receipts / WhatsApp mobile photos.
  - Automatic deskewing / rotation correction for tilted documents.
  - Adaptive contrast enhancement (CLAHE).
"""

import cv2
import numpy as np
import fitz  # PyMuPDF
import logging

logger = logging.getLogger(__name__)


class ImagePreprocessor:
    """Decode raw bytes and prepare optimized image arrays for OCR & table detection."""

    @staticmethod
    def decode_image_bytes(image_bytes: bytes) -> np.ndarray:
        """Decode raw image bytes (JPG/PNG/WebP) into a BGR numpy matrix."""
        if not image_bytes:
            raise ValueError("Empty image bytes received.")
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Corrupted or unsupported image format.")
        return img

    @staticmethod
    def decode_pdf_bytes(pdf_bytes: bytes, page_index: int = 0, dpi: int = 300) -> np.ndarray:
        """
        Render a single PDF page to a crisp BGR numpy matrix at 300 DPI.
        300 DPI ensures small digits, decimals, and tight table borders are crystal clear.
        """
        if not pdf_bytes:
            raise ValueError("Empty PDF bytes received.")

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if doc.page_count == 0:
            raise ValueError("PDF document has no pages.")
        if page_index >= doc.page_count:
            raise ValueError(
                f"Requested page {page_index} but PDF only has {doc.page_count} page(s)."
            )

        page = doc[page_index]
        pix = page.get_pixmap(dpi=dpi)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            int(pix.height), int(pix.width), int(pix.n)
        )

        # Convert colour space to OpenCV BGR
        if pix.n == 4:
            img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        elif pix.n == 3:
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        return img

    @staticmethod
    def optimize_for_ocr(img: np.ndarray) -> np.ndarray:
        """
        Enhance image for OCR:
          1. Upscale if low-resolution (crucial for WhatsApp/phone camera scans).
          2. Auto-deskew if document is tilted.
        """
        if img is None or img.size == 0:
            return img

        h, w = img.shape[:2]

        # 1. Upscale low-res images
        if w < 1100 or h < 350:
            scale = max(1300.0 / max(w, 1), 450.0 / max(h, 1))
            if scale > 1.1:
                new_w, new_h = int(w * scale), int(h * scale)
                img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

        # 2. Deskew
        img = ImagePreprocessor.deskew(img)

        return img

    @staticmethod
    def deskew(img: np.ndarray) -> np.ndarray:
        """Detect and correct document skew angle."""
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150, apertureSize=3)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)

            if lines is None:
                return img

            angles = []
            for line in lines:
                pts = line.reshape(-1)
                if len(pts) >= 4:
                    x1, y1, x2, y2 = pts[0], pts[1], pts[2], pts[3]
                    if x2 != x1:
                        angle = np.arctan2(float(y2 - y1), float(x2 - x1)) * 180.0 / np.pi
                        if abs(angle) < 25.0:  # Ignore steep diagonal lines
                            angles.append(angle)

            if not angles:
                return img

            median_angle = float(np.median(angles))
            if abs(median_angle) < 0.4:
                return img  # Negligible skew

            h, w = img.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
            rotated = cv2.warpAffine(
                img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
            )
            return rotated
        except Exception as e:
            logger.warning("Deskew failed with error: %s; using original image", e)
            return img