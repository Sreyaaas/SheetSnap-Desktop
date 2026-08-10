from abc import ABC, abstractmethod
import numpy as np
from rapidocr_onnxruntime import RapidOCR

class BaseOCREngine(ABC):
    @abstractmethod
    def extract_text(self, image_crop: np.ndarray) -> str:
        pass

class RapidOCREngine(BaseOCREngine):
    def __init__(self):
        # Ultra-lightweight ONNX Runtime CPU OCR Engine
        self.engine = RapidOCR()

    def extract_text(self, image_crop: np.ndarray) -> str:
        if image_crop is None or image_crop.size == 0:
            return ""
        
        result, _ = self.engine(image_crop)
        if not result:
            return ""

        # Extract and join all text inside this specific cell
        texts = [line[1] for line in result if float(line[2]) > 0.3]
        return " ".join(texts).strip()

def get_ocr_engine() -> BaseOCREngine:
    return RapidOCREngine()