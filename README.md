# SheetSnap — AI Document & Table Extraction Platform

SheetSnap is a production-grade, ultra-lightweight full-stack web application that transforms document images (PNG, JPG, WebP) and PDFs into structured Excel workbooks using **Google Gemini Vision-Language Models (VLM)** and in-memory Excel generation.

---

## Key Features

- **Gemini Flash VLM Table Extraction:** Direct multimodal table understanding supporting merged cells, multi-tier headers, rotated text, and complex layouts with structured JSON schemas.
- **100% In-Memory & Stateless Architecture:** Zero temporary files written to disk. Excel workbooks are generated and streamed directly from memory.
- **Enterprise DDoS & Rate Limiting Guardrails:** Built-in sliding-window IP rate limiter, burst protection, and payload guards (max 10MB).
- **Multi-Sheet Export:** Automatically formats multiple extracted tables into distinct, beautifully styled Excel sheets with auto-fitted column widths and zebra striping.
- **Full-Stack Next.js (Zero Python Dependencies):** Single runtime deployable to Vercel, Netlify, Cloudflare Pages, or Docker/Node.js with $0 idle compute cost.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, React 19)
- **AI Engine:** Official Google GenAI SDK (`@google/genai`) — Gemini 2.5 Flash / Gemini 3.7 Flash
- **Workbook Engine:** `exceljs`
- **Styling & UI:** Tailwind CSS v4, Lucide React, Framer Motion

---

## Getting Started

### 1. Prerequisites
- **Node.js:** v20.x or higher
- **Gemini API Key:** Free key from [Google AI Studio](https://aistudio.google.com/)

### 2. Configuration
Create a `.env.local` file inside `frontend/` (or set environment variables in your hosting dashboard):

```bash
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
```

### 3. Run Locally

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Production Deployment (Vercel / Netlify / Docker)

### Deploy to Vercel (1-Click)
1. Push this repository to GitHub / GitLab.
2. Import project into Vercel and set the Root Directory to `frontend`.
3. Add `GEMINI_API_KEY` to Environment Variables.
4. Deploy!

### Production Build Check
```bash
cd frontend
npm run build
npm run start
```

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/extract` | Uploads PDF/image (`multipart/form-data`) & returns structured table JSON (Max 10MB). |
| `POST` | `/api/export` | Accepts table JSON & streams back formatted `.xlsx` binary workbook. |
| `GET`  | `/api/status` | Health check & model availability. |
| `GET`  | `/api/analytics` | Live extraction metrics and telemetry counters. |
| `POST` | `/api/analytics/reset` | Resets telemetry counters. |
