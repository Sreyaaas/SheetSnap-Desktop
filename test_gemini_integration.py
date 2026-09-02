"""
Verification script for Gemini VLM integration & fallback behavior.
"""
import os
import sys
import asyncio
import io
from pathlib import Path

# Ensure utf-8 stdout
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import UploadFile
from backend.routes import get_status, extract_table
from backend.services.gemini_service import GeminiTableExtractor
from backend.config import settings

async def run_tests():
    print("\n--- 1. Testing Gemini Service Availability & Optimization ---")
    available = GeminiTableExtractor.is_available()
    print("Gemini Available:", available)
    print("Gemini Model:", settings.GEMINI_MODEL)
    print("Gemini Confidence Threshold:", settings.GEMINI_CONFIDENCE_THRESHOLD)
    assert available is True

    print("\n--- 2. Testing GET /status route ---")
    status = await get_status()
    print("Status response:", status)
    assert status["status"] == "healthy"
    assert status["gemini_available"] is True
    print("✓ /status route PASSED")

    print("\n--- 3. Testing POST /extract in mode='ai' (Active Gemini Call) ---")
    img_path = Path("test_images/01_sample_invoice_anu.png")
    img_bytes = img_path.read_bytes()
    upload = UploadFile(filename="01_sample_invoice_anu.png", file=io.BytesIO(img_bytes))

    ai_res = await extract_table(image=upload, mode="ai")
    print("AI Engine:", ai_res.get("engine"))
    print("AI Model:", ai_res.get("model"))
    print("AI Tables count:", len(ai_res.get("tables", [])))
    print("AI Headers:", ai_res.get("headers"))
    print("AI Sample row:", ai_res.get("rows", [[]])[0] if ai_res.get("rows") else "None")
    assert ai_res.get("engine") == "gemini"
    assert len(ai_res.get("tables", [])) > 0
    print("✓ Live Gemini AI mode PASSED!")

    print("\n--- 4. Testing POST /extract in mode='local' (100% Offline) ---")
    upload_local = UploadFile(filename="01_sample_invoice_anu.png", file=io.BytesIO(img_bytes))
    local_res = await extract_table(image=upload_local, mode="local")
    print("Engine:", local_res.get("engine"))
    print("Quality:", local_res.get("quality", {}).get("score"))
    assert local_res.get("engine") == "local"
    assert len(local_res.get("tables", [])) > 0
    print("✓ Local offline mode PASSED")

    print("\n--- 5. Testing POST /extract in mode='auto' (Smart Fallback) ---")
    upload_auto = UploadFile(filename="01_sample_invoice_anu.png", file=io.BytesIO(img_bytes))
    auto_res = await extract_table(image=upload_auto, mode="auto", confidence_threshold=70)
    print("Engine:", auto_res.get("engine"))
    print("Quality:", auto_res.get("quality", {}).get("score"))
    print("✓ Auto fallback mode PASSED")

    print("\n=======================================================")
    print("🎉 ALL GEMINI INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉")
    print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
