"""
SheetSnap Image Preprocessor — Decodes images and PDFs into BGR numpy arrays.

Centralises all image-loading logic so routes.py and table_detector.py
never do inline decoding.  Handles JPG, PNG, and PDF (first page, 200 DPI).
"""

import cv2
import numpy as np
import fitz  # PyMuPDF


class ImagePreprocessor:
    """Decode raw bytes into clean OpenCV BGR arrays."""

    @staticmethod
    def decode_image_bytes(image_bytes: bytes) -> np.ndarray:
        """
        Decode raw image bytes (JPG/PNG) into a BGR numpy matrix.
        Raises ValueError on corrupt or empty input.
        """
        if not image_bytes:
            raise ValueError("Empty image bytes received.")
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Corrupted or unsupported image format.")
        return img

    @staticmethod
    def decode_pdf_bytes(pdf_bytes: bytes, page_index: int = 0, dpi: int = 200) -> np.ndarray:
        """
        Render a single PDF page to a BGR numpy matrix at the given DPI.

        Parameters
        ----------
        pdf_bytes : raw PDF file content
        page_index : which page to render (0-based, default first page)
        dpi : rendering resolution (default 200 — good balance of accuracy vs speed)

        Raises ValueError on empty or corrupt PDF.
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