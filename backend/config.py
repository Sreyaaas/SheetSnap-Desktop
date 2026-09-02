from typing import Optional
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "SheetSnap Desktop"
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    MODEL_DIR: Path = BASE_DIR / "models"
    TEMP_UPLOAD_DIR: Path = BASE_DIR / "uploads"
    TEMP_OUTPUT_DIR: Path = BASE_DIR / "outputs"
    
    # OCR Config
    OCR_LANGUAGE: str = "en"
    USE_GPU: bool = False  # Default to CPU for standard office PCs
    
    # Gemini VLM Fallback & Manual Mode Config
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.6-flash"
    GEMINI_CONFIDENCE_THRESHOLD: int = 70
    GEMINI_ENABLED: bool = True
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

# Ensure required runtime folders exist locally
settings.TEMP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.TEMP_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
settings.MODEL_DIR.mkdir(parents=True, exist_ok=True)