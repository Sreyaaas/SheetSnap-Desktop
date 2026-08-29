'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { UploadZone } from '@/components/UploadZone';
import { ImagePreview } from '@/components/ImagePreview';
import { EditableGrid } from '@/components/EditableGrid';
import {
  Loader2,
  Download,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Cpu,
  Shield,
} from 'lucide-react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`${API_URL}/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errorMsg = 'Failed to process document table.';
        try {
          const errData = await res.json();
          if (errData.detail) errorMsg = errData.detail;
        } catch {
          // Keep generic message
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      const extractedHeaders = data.headers || [];
      const extractedRows = data.rows || [];

      setHeaders(extractedHeaders);
      setRows(extractedRows);

      if (extractedHeaders.length === 0 && extractedRows.length === 0) {
        setError('No table structures or text rows detected in this document. Try a clearer image or PDF page.');
      } else {
        setSuccessMessage(
          `Successfully extracted ${extractedHeaders.length} columns and ${extractedRows.length} rows.`
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while communicating with the backend.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (headers.length === 0 && rows.length === 0) return;
    setExporting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, rows }),
      });

      if (!res.ok) {
        let errorMsg = 'Failed to generate Excel file.';
        try {
          const errData = await res.json();
          if (errData.detail) errorMsg = errData.detail;
        } catch {
          // Keep generic
        }
        throw new Error(errorMsg);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = file ? file.name.replace(/\.[^/.]+$/, '') : 'sheet';
      a.download = `${baseName}_extracted.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to export Excel file.');
      }
    } finally {
      setExporting(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 flex flex-col antialiased">
      <Header />

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 space-y-8">
        {/* Intro Hero Section */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-100/80 border border-slate-200/60 text-slate-600 text-xs font-medium mb-1 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-slate-700" />
            <span>Local OCR & Layout Reconstruction</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Convert Documents & Tables to Excel
          </h2>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            Drop purchase orders, receipts, financial tables, or invoices. Extract structured cells locally with zero cloud dependencies.
          </p>
        </div>

        {/* Upload & Document Preview Area */}
        <section className="space-y-6 bg-white/60 p-6 rounded-3xl border border-slate-200/70 shadow-xs backdrop-blur-xs">
          <UploadZone onFileSelect={setFile} selectedFile={file} />

          {file && <ImagePreview file={file} />}

          {/* Error Message Banner */}
          {error && (
            <div className="flex items-start space-x-3 p-4 bg-rose-50/90 border border-rose-200 text-rose-800 text-xs sm:text-sm rounded-2xl animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-rose-900">Processing Issue</p>
                <p className="text-rose-700 leading-relaxed">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-rose-400 hover:text-rose-700 text-xs font-medium cursor-pointer p-1"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Success Message Banner */}
          {successMessage && (
            <div className="flex items-center justify-between p-3.5 bg-emerald-50/90 border border-emerald-200 text-emerald-800 text-xs sm:text-sm rounded-2xl animate-in fade-in duration-200">
              <div className="flex items-center space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium text-emerald-900">{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-emerald-500 hover:text-emerald-800 text-xs cursor-pointer p-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Action Control Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleExtract}
              disabled={!file || loading}
              className={`flex-1 min-w-[200px] flex items-center justify-center space-x-2 text-sm font-semibold py-3 px-6 rounded-xl transition-all shadow-sm cursor-pointer ${
                !file || loading
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white ring-1 ring-slate-950/20'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  <span>Extracting Table Structure...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Extract Table</span>
                </>
              )}
            </button>

            {headers.length > 0 && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-sm font-semibold py-3 px-5 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Export Excel (.xlsx)</span>
                  </>
                )}
              </button>
            )}

            {(file || headers.length > 0) && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-700 text-sm font-medium py-3 px-4 rounded-xl transition-all cursor-pointer"
                title="Reset file and results"
              >
                <RotateCcw className="w-4 h-4 text-slate-500" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </section>

        {/* Results Grid Section */}
        {headers.length > 0 && (
          <section className="space-y-4 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <EditableGrid
              headers={headers}
              rows={rows}
              onChange={(h, r) => {
                setHeaders(h);
                setRows(r);
              }}
            />
          </section>
        )}

        {/* Feature Highlights / Privacy Trust Badges */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 border-t border-slate-200/80 text-left">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/70 shadow-2xs space-y-1.5">
            <div className="flex items-center space-x-2 text-slate-900 font-semibold text-xs">
              <Cpu className="w-4 h-4 text-slate-700" />
              <span>ONNX OCR Engine</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              RapidOCR ONNX runs locally on your standard CPU without GPUs or cloud API tokens.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/70 shadow-2xs space-y-1.5">
            <div className="flex items-center space-x-2 text-slate-900 font-semibold text-xs">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>100% Confidential</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              No files or extracted data leave your computer. Temp files are automatically purged.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/70 shadow-2xs space-y-1.5">
            <div className="flex items-center space-x-2 text-slate-900 font-semibold text-xs">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>OpenPyXL Exporter</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Produces native, unformatted .xlsx spreadsheets compatible with Excel and Google Sheets.
            </p>
          </div>
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full py-6 border-t border-slate-200/60 text-center text-xs text-slate-400 bg-white/40">
        <p>SheetSnap Desktop • Offline Table Intelligence</p>
      </footer>
    </div>
  );
}