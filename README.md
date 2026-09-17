# ⚡ SheetSnap — AI Document & Table Extraction Platform (v2.0)

SheetSnap is an enterprise-grade, ultra-lightweight full-stack web application that transforms complex document images (PNG, JPG, WebP) and multi-page PDFs into clean, formatted Excel workbooks using **Google Gemini 3.6 Flash Vision-Language Models (VLM)**.

Designed for $0 serverless deployment on **Vercel**, **Netlify**, or **Docker**, SheetSnap operates 100% in-memory without disk I/O leaks or heavy local OCR dependencies.

---

## 🚀 Evolution: What Changed in v2.0?

SheetSnap underwent a complete ground-up architectural refactoring from a heavy dual-runtime desktop engine into a lean, serverless full-stack cloud platform.

### 📊 Architecture Comparison (v1.0 Legacy vs v2.0 Cloud Edition)

| Feature / Metric | Legacy v1.0 (Python FastAPI + Local OCR) | **New v2.0 (Full-Stack Next.js + Gemini VLM)** |
| :--- | :--- | :--- |
| **Backend Runtime** | Dual Runtime (Python 3.10 + Node.js Next.js) | **Single Runtime (Next.js 16 App Router & TypeScript)** |
| **Extraction Engine** | RapidOCR ONNX, OpenCV, Heuristic Bounding Boxes | **Google Gemini 3.6 Flash Multimodal VLM** |
| **Server Memory (RAM)** | ~1.5 GB – 2.5 GB RAM (High OOM crash risk on cloud) | **< 150 MB RAM (Runs on free/cheapest cloud tiers)** |
| **Container Size** | ~1.8 GB (ONNX binaries, PyTorch/OpenCV dependencies) | **~120 MB (Ultra-lean serverless bundle)** |
| **Storage Architecture** | Stateful (`uploads/` & `outputs/` written to disk) | **100% Stateless & In-Memory (Zero disk I/O leaks)** |
| **Complex Table Accuracy** | Failed on borderless, skewed, or merged cells | **State-of-the-Art (Semantic visual table understanding)** |
| **Multi-Page PDF Support** | Local rasterization pipeline with PyMuPDF | **Direct native PDF streaming into Gemini VLM** |
| **DDoS Guardrails** | None | **Sliding-window IP rate limiter + 10MB payload cap** |
| **Monthly Hosting Cost** | $7 – $20/month (Needs dedicated 2GB VPS) | **$0.00 / month (Vercel Free Tier + Gemini Free Tier)** |

---

## ✨ Key Features

- **Gemini 3.6 Flash VLM Extraction:** Native multimodal table parsing using strict JSON schema output mode (`responseSchema`), eliminating markdown formatting errors.
- **100% In-Memory Excel Generation:** Multi-sheet `.xlsx` files generated via `exceljs` with auto-fitted column widths, navy headers (`#1E293B`), thin border grids, and zebra striping.
- **Enterprise Rate Limiting & DDoS Shield:** Built-in sliding-window token bucket IP rate limiter (25 RPM) with standard HTTP 429 response headers (`Retry-After`, `X-RateLimit-Limit`).
- **Strict Payload Guardrails:** Server-side and client-side max 10MB file size bounds and verified MIME-type whitelisting (`.pdf`, `.png`, `.jpg`, `.webp`).
- **Real-Time AI Telemetry Dashboard:** Built-in analytics tracking total requests, prompt/output tokens, average latency, live daily/minute quota velocity, and real-time cost estimations ($0.075/1M input tokens).

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, React 19)
- **AI SDK:** Official Google GenAI SDK (`@google/genai`) — Gemini 3.6 Flash
- **Workbook Engine:** `exceljs`
- **Styling & Motion:** Tailwind CSS v4, Lucide React, Framer Motion
- **Language:** TypeScript 5 (Strict Mode)

---

## 📦 Project Structure

```text
SheetSnap-Desktop/
├── frontend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/route.ts      # Multipart upload -> Gemini VLM parsing
│   │   │   ├── export/route.ts       # Table JSON -> In-memory .xlsx stream
│   │   │   ├── status/route.ts       # Health check & model status
│   │   │   ├── analytics/route.ts    # Telemetry metrics
│   │   │   └── analytics/reset/route.ts # Telemetry counter reset
│   │   ├── page.tsx                  # Workspace UI (Upload, Preview, Export)
│   │   └── stats/page.tsx             # AI Telemetry Dashboard
│   ├── lib/
│   │   ├── gemini.ts                 # Google GenAI SDK integration & telemetry
│   │   ├── excel-generator.ts        # In-memory ExcelJS workbook builder
│   │   └── rate-limiter.ts           # Sliding-window IP rate limiter
│   └── package.json
├── .env.example
├── README.md
└── CHANGELOG.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js:** v20.x or higher
- **Gemini API Key:** Free key from [Google AI Studio](https://aistudio.google.com/)

### 2. Setup Environment
Create `frontend/.env.local`:

```bash
GEMINI_API_KEY="your-gemini-api-key-here"
GEMINI_MODEL="gemini-3.6-flash"
```

### 3. Run Development Server

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Vercel ($0 Hosting)

1. Push this repository to **GitHub**.
2. Log into [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Select `SheetSnap-Desktop`.
4. **Important:** Set **Root Directory** to `frontend`.
5. Under **Environment Variables**, add:
   - `GEMINI_API_KEY` = `your_gemini_api_key`
   - `GEMINI_MODEL` = `gemini-3.6-flash`
6. Click **Deploy**! (Build completes in ~30s).

---

## 🔌 API Documentation

| Method | Endpoint | Description | Guardrails / Payload |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/extract` | Upload document image or PDF & return structured table JSON | Max 10MB limit, MIME check, Rate limited |
| `POST` | `/api/export` | Convert table JSON to formatted `.xlsx` binary stream | Streams binary Buffer directly |
| `GET`  | `/api/status` | Health check & active model status | Public |
| `GET`  | `/api/analytics` | Telemetry, tokens, cost estimation & quota stats | In-memory metric store |
| `POST` | `/api/analytics/reset` | Reset telemetry counters | Server-side reset |

---

## 📜 License

MIT License. Developed for high-efficiency AI document extraction.
