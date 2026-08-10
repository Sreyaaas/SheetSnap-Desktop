# SheetSnap Desktop 📊

**SheetSnap Desktop** is a high-performance, enterprise-grade offline desktop web application that automatically extracts structured tables from images (`JPG`, `JPEG`, `PNG`) and `PDF` documents, including purchase orders, requisitions, inventory sheets, and financial reports, and exports them directly into Microsoft Excel (`.xlsx`).

Designed with an Apple-inspired minimalist aesthetic, SheetSnap runs **100% locally and offline** without requiring cloud APIs, internet access, databases, or user logins.

---

## ✨ Features

* **100% Offline & Private** — Zero external cloud requests, telemetry, or third-party API dependencies. All OCR and layout processing stays strictly on your local machine.
* **Multi-Format Support** — Accept drag-and-drop uploads for `JPG`, `JPEG`, `PNG`, and native/scanned `PDF` documents.
* **High-Accuracy Table Layout Reconstruction** — Automatically parses multi-line cell descriptions, empty grid cells, negative numbers, currency formatting, and merged headers.
* **ONNX-Powered OCR Engine** — Driven by lightweight `rapidocr_onnxruntime` for fast, local text recognition on standard CPU office PCs.
* **Interactive Editable Grid** — Review and edit extracted data in a live spreadsheet view, add or delete rows, and correct text before exporting.
* **One-Click Excel Export** — Generates clean, unformatted `.xlsx` files compatible with Microsoft Excel, Google Sheets, and LibreOffice.
* **Automatic Temp Cleanup** — Uploaded files and generated previews are automatically purged from memory immediately after processing.

---

## 🛠️ Tech Stack

### Frontend

| Technology                               | Description            |
| ---------------------------------------- | ---------------------- |
| [Next.js 15](https://nextjs.org/)        | App Router, TypeScript |
| [Tailwind CSS](https://tailwindcss.com/) | Styling                |
| [Lucide React](https://lucide.dev/)      | Icons                  |

### Backend

| Technology                                                   | Description                          |
| ------------------------------------------------------------ | ------------------------------------ |
| [FastAPI](https://fastapi.tiangolo.com/)                     | Python web framework                 |
| [Uvicorn](https://www.uvicorn.org/)                          | ASGI server                          |
| [RapidOCR ONNX Runtime](https://github.com/RapidAI/RapidOCR) | OCR engine                           |
| [OpenCV Contrib](https://opencv.org/)                        | Computer vision and image processing |
| [PyMuPDF](https://pymupdf.readthedocs.io/)                   | PDF rendering                        |
| [OpenPyXL](https://openpyxl.readthedocs.io/)                 | Excel generation                     |

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your machine:

* **Python:** v3.8, v3.9, v3.10, or v3.11
* **Node.js:** v18+ and `npm`
* **Git**

---

## 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/sheetsnap-desktop.git
cd sheetsnap-desktop
```

---

## 2. Set Up & Run the Backend

### Create a Python Virtual Environment

```bash
python -m venv venv
```

### Activate the Virtual Environment

#### Windows — Command Prompt

```cmd
venv\Scripts\activate.bat
```

#### Windows — PowerShell

```powershell
.\venv\Scripts\Activate.ps1
```

#### macOS / Linux

```bash
source venv/bin/activate
```

### Install Python Dependencies

```bash
pip install fastapi uvicorn pydantic pydantic-settings opencv-contrib-python-headless numpy openpyxl python-multipart rapidocr_onnxruntime PyMuPDF beautifulsoup4
```

### Start the FastAPI Backend

```bash
python -m backend.app
```

The backend will run locally at:

```text
http://127.0.0.1:8000
```

---

## 3. Set Up & Run the Frontend

Open a new terminal tab or window and navigate to the frontend directory:

```bash
cd frontend
```

### Install Node.js Dependencies

```bash
npm install
```

### Start the Next.js Development Server

```bash
npm run dev
```

If prompted or if you need to run the application on a specific host:

```bash
npx next dev -H localhost
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
│   ├── app.py                  # Main FastAPI application entry point
│   ├── routes.py               # REST API endpoints (/extract, /export)
│   ├── config.py               # Path configurations & settings
│   └── services/
│       ├── preprocess.py       # Image decoding & color-space handling
│       ├── ocr_engine.py       # RapidOCR ONNX engine wrapper
│       ├── table_detector.py   # Dynamic font-height layout reconstruction
│       ├── cleaner.py          # Regex text formatting & word-spacing cleanup
│       └── excel.py            # OpenPyXL spreadsheet exporter
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Single-page UI layout & state management
│   │   ├── layout.tsx          # Shell layout & global font configuration
│   │   └── globals.css         # Tailwind styles & theme variables
│   │
│   ├── components/
│   │   ├── Header.tsx          # Minimal top title bar
│   │   ├── UploadZone.tsx      # Drag-and-drop upload container
│   │   ├── ImagePreview.tsx    # Uploaded image/document preview
│   │   └── EditableGrid.tsx    # Interactive spreadsheet table grid
│   │
│   ├── lib/
│   │   └── types.ts            # TypeScript interfaces
│   │
│   └── package.json
│
├── uploads/                    # Temporary uploaded image staging (auto-cleaned)
├── outputs/                    # Temporary generated Excel staging (auto-cleaned)
├── .gitignore                  # Git exclusions for builds & virtual environments
└── README.md                   # Project documentation
```

---

## 🔄 Pipeline Overview

The SheetSnap processing pipeline consists of the following steps:

### 1. Upload & Rendering

The user drags and drops a `JPG`, `JPEG`, `PNG`, or `PDF` document.

PDF documents are rendered on-the-fly to a high-DPI image buffer using **PyMuPDF**.

### 2. Text & Bounding Box Detection

`rapidocr_onnxruntime` extracts recognized text along with bounding-box coordinates across the page.

### 3. Dynamic Font-Height Reconstruction

The application calculates the median text height to dynamically cluster words into rows and align them into header column slots without relying on fragile fixed pixel thresholds.

### 4. Text Cleanup

Regular expressions are used to:

* Add missing spaces after commas.
* Add spacing between letters and numbers where appropriate.
* Clean up punctuation.
* Normalize extracted text.

### 5. Interactive Grid

Extracted data is returned as JSON to the Next.js frontend.

Users can then:

* Edit extracted values.
* Add rows.
* Delete rows.
* Correct OCR errors.
* Review the table before export.

### 6. Excel Generation

**OpenPyXL** constructs a clean `.xlsx` workbook that can be downloaded and opened in:

* Microsoft Excel
* Google Sheets
* LibreOffice Calc

---

## 🔒 Security & Privacy

SheetSnap was engineered specifically for internal enterprise use where strict confidentiality is required.

### Privacy Guarantees

* **No internet connection required**
* **No analytics or telemetry tracking**
* **No cloud API dependencies**
* **No permanent cloud storage**
* **No database required**
* **No user login required**
* **OCR and document processing remain local**
* **Temporary uploaded files are automatically cleaned up**

All document processing occurs on the local machine, helping keep sensitive business documents within the organization's environment.

---

## 📄 License

**Internal Enterprise Application — All Rights Reserved.**

---

## 📌 Git

After saving this file as `README.md`, add and commit it to your repository:

```bash
git add README.md
git commit -m "Add README"
git push
```
