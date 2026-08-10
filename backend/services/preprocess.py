import cv2
import numpy as np

class ImagePreprocessor:
    @staticmethod
    def preprocess(image_bytes: bytes) -> np.ndarray:
        """Decode image bytes cleanly into a pristine color numpy matrix."""
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Corrupted or invalid image format.")
        return img