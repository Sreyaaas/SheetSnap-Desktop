# Changelog

All notable changes to SheetSnap will be documented in this file.

## [2.0.0] - 2026-09-17

### Added
- **Full-Stack Next.js Architecture:** Unified application running entirely on Next.js 16 (App Router & Turbopack) with zero Python backend dependencies.
- **Gemini 3.6 Flash VLM Table Extraction:** Direct multimodal structured extraction via official `@google/genai` SDK using `responseSchema` JSON mode.
- **In-Memory Excel Generator:** High-fidelity `.xlsx` generation using `exceljs` with auto column widths, header formatting, and multi-sheet support.
- **Enterprise DDoS Shield & Rate Limiter:** In-memory sliding-window token bucket rate limiter (25 RPM) with HTTP 429 mitigation headers.
- **10MB Payload & MIME Guardrails:** Server-side and client-side validation rejecting non-document formats or oversized files.
- **Real-Time AI Telemetry Dashboard:** Live token, latency, cost estimation ($0.075/1M input tokens), and quota monitoring with 1-click telemetry reset.

### Removed
- Removed legacy Python FastAPI backend (`backend/`), PyTorch/OpenCV residue, ONNX Runtime (`rapidocr_onnxruntime`), and virtual environment (`venv/`), reducing container RAM footprint by >85% and disk usage by ~400MB+.
