# SheetSnap Desktop 📊

**SheetSnap Desktop** is a high-performance, enterprise-grade offline desktop application that automatically extracts structured tables from images (`JPG`, `JPEG`, `PNG`, `WebP`) and `PDF` documents (such as purchase orders, invoices, requisitions, inventory logs, and financial statements) and exports them directly into Microsoft Excel (`.xlsx`).

Designed with a sleek, minimalist motion.dev-inspired aesthetic, SheetSnap runs **100% locally and offline** without requiring cloud APIs, internet access, external database servers, or user logins.

---

## ✨ Key Features

* **100% Offline & Completely Private** — Zero external network requests, telemetry, or cloud dependencies. All OCR, image processing, and layout reconstruction occurs strictly on your local machine.
* **Lean, CPU-Optimized Footprint (~380 MB)** — Powered by an ultra-lightweight ONNX OCR runtime without requiring heavy multi-gigabyte machine learning frameworks (no PyTorch, no PaddlePaddle).
* **Multi-Table Automated Discovery** — Automatically detects and segments multiple distinct tables from complex documents (e.g. Oracle ERP Purchase Orders with *Lines*, *Distributions*, and secondary tables) into separate editable tabs.
* **Interactive Multi-Box ROI Selection (Drag-to-Box)** — Click and drag multiple bounding boxes (`Box 1`, `Box 2`, `Box 3`...) over messy documents to target exact tables and eliminate outside notes, signatures, or background noise.
* **Multi-Sheet Excel (.xlsx) Export** — Exports single or multi-table documents into clean, multi-sheet workbooks with styled header fills and auto-fitted columns.
* **1-Click Copy to Clipboard (`Ctrl+V` Ready)** — Instant copy button that formats extracted tables into TSV clipboard data for immediate paste into open Excel or Google Sheets windows.
* **Table Quality & Confidence Scoring** — Real-time mathematical scoring ($0–100\%$) indicating table clarity, sparsity, and OCR confidence.
* **Dual-Tier Topological Table Reconstruction**:
  * **Tier 1 (Bordered Tables):** Morphological grid line extraction and line intersection mapping for exact cell boundary resolution.
  * **Tier 2 (Borderless Tables):** Strict non-chaining baseline clustering, horizontal whitespace valley projection, and wrapped description consolidation.
* **Unigram Language Model Word Segmentation** — Uses dynamic programming word frequency unigram tokenization (`wordninja`) to split dense, unspaced all-caps strings (`HOTWATERHEATERTANK` → `HOT WATER HEATER TANK`, `PIONEERCENTRIFUGALSPRAY` → `PIONEER CENTRIFUGAL SPRAY`) while strictly shielding alphanumeric part numbers (`IMPA734022`, `OSRAM64788`, `ECT120200`).
* **Intelligent Text Normalization & Qty/UOM Decomposition** — Automated cleaning for stuck character codes, number-unit separation (e.g. `2.EA` → `2.` and `EA`), comma/colon/semicolon spacing, and OCR artifact suppression.
* **Modern Minimal Motion UI** — Built with `framer-motion` spring physics, moving pill segmented tab switchers, glassmorphism panels, and tactile feedback.

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **Next.js** | 16 (App Router) | Modern React framework & UI routing |
| **React** | 19 | Reactive state management & component hierarchy |
| **Framer Motion** | Latest | Spring physics animations & layout transitions |
| **Tailwind CSS** | 4 | Minimalist design tokens & glassmorphism utilities |
| **Lucide React** | Latest | Minimalist SVG iconography |

### Backend & Core Engine
| Technology | Purpose |
| :--- | :--- |
| **FastAPI & Uvicorn** | High-performance asynchronous REST API backend |
| **RapidOCR (ONNX Runtime)** | Sub-second CPU-optimized OCR text detection & recognition |
| **WordNinja** | Pure-Python unigram frequency word boundary segmentation |
| **OpenCV Contrib (Headless)** | Computer vision, morphological filtering & deskewing |
| **PyMuPDF (`fitz`)** | Vector & raster PDF rendering at 300 DPI |
| **OpenPyXL** | Native multi-sheet Excel (`.xlsx`) binary serialization |
| **Pydantic v2** | Strict schema validation and settings management |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your workstation:
* **Python:** 3.8 to 3.12 (`python --version`)
* **Node.js:** 18.x or 20.x+ (`node --version`) and `npm`
* **Git**

---

### 1. Clone the Repository

```bash
git clone https://github.com/Sreyaaas/SheetSnap-Desktop.git
cd sheetsnap-desktop
```

---

### 2. Backend Setup (FastAPI & OCR Engine)

#### A. Create a Virtual Environment

```bash
# Windows
python -m venv venv

# macOS / Linux
python3 -m venv venv
```

#### B. Activate the Virtual Environment

```powershell
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (Command Prompt)
venv\Scripts\activate.bat

# macOS / Linux
source venv/bin/activate
```

#### C. Install Python Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### D. Start the Backend Server

```bash
python -m backend.app
```
> The backend API will start locally at `http://127.0.0.1:8000`.

---

### 3. Frontend Setup (Next.js & UI)

Open a separate terminal window and navigate to the `frontend` folder:

```bash
cd frontend
```

#### A. Install Node Dependencies

```bash
npm install
```

#### B. Start the Frontend Development Server

```bash
npm run dev
```

Open your browser and navigate to:
```text
http://localhost:3000
```

---

## 📂 Project Structure

```text
sheetsnap-desktop/
├── backend/
│   ├── app.py                      # FastAPI server entry point and CORS configuration
│   ├── routes.py                   # REST endpoints: /extract and /export (multi-table & ROI support)
│   ├── config.py                   # Global environment and directory settings
│   └── services/
│       ├── preprocess.py           # Bounded aspect-ratio scaling & 300 DPI rasterization
│       ├── ocr_engine.py           # Singleton RapidOCR ONNX wrapper
│       ├── table_detector.py       # Multi-table segmentation, non-chaining clustering & ROI extraction
│       ├── cleaner.py              # Regex text cleaning & cell formatting
│       └── excel.py                # Multi-sheet OpenPyXL spreadsheet generator
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx              # Application shell layout and font imports
│   │   ├── page.tsx                # Motion-animated workflow & multi-table state orchestration
│   │   └── globals.css             # Tailwind design tokens, mesh grid & glassmorphism
│   ├── components/
│   │   ├── Header.tsx              # Top navigation bar with offline status badge
│   │   ├── UploadZone.tsx          # Motion drag-and-drop document upload area
│   │   ├── ImagePreview.tsx        # Interactive multi-box ROI drawing & document viewer
│   │   └── EditableGrid.tsx        # Minimalist spreadsheet editor with 1-click Excel copy
│   ├── lib/
│   │   └── types.ts                # TypeScript interface definitions
│   └── package.json
│
├── test_images/                    # Benchmark sample documents and invoices (18 test files)
├── test_production_pipeline.py     # Production integration test suite across all documents
├── requirements.txt                # Lean, CPU-optimized Python dependency manifest
├── .gitignore                      # Git exclusion rules for builds, caches, and venvs
└── README.md                       # Comprehensive project documentation
```

---

## 🔄 Processing Pipeline

```mermaid
graph TD
    A[Document Upload JPG/PNG/WebP/PDF] --> B[ImagePreprocessor]
    B -->|300 DPI Rendering / Bounded Scaling| C[High-DPI Optimized Frame]
    C --> D[RapidOCR ONNX Engine]
    D -->|Text Tokens & Bounding Boxes| E[TableDetector]
    E -->|Automated Discovery or Custom ROI Boxes| F[Multi-Region Segmentation]
    F -->|Tier 1: Morphological Lines| G1[Bordered Grid Reconstruction]
    F -->|Tier 2: Adaptive Valley Projection| G2[Borderless Row/Col Reconstruction]
    G1 --> H[TextCleaner & Quality Scoring]
    G2 --> H
    H --> I[Motion-Animated Multi-Table Grid UI]
    I -->|1-Click Copy TSV| J[Direct Paste into Excel Ctrl+V]
    I -->|Multi-Sheet Export| K[ExcelGenerator.generate_multi]
    K --> L[Formatted .xlsx Download]
```

---

## 🔒 Security & Privacy

SheetSnap Desktop is built specifically for strict privacy and data protection requirements:
* **Zero Telemetry or External Network Calls**
* **Zero Third-Party Cloud APIs**
* **No Database Storage or Persisted User Data**
* **No Login or Credential Tracking**
* **Automated Ephemeral Memory Purging**

All documents remain 100% private on your workstation.

---

## 📄 License

**Internal Enterprise Application — All Rights Reserved.**
