'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { UploadZone } from '@/components/UploadZone';
import { ImagePreview, DetectedBox } from '@/components/ImagePreview';
import { EditableGrid } from '@/components/EditableGrid';
import {
  Loader2,
  Download,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Shield,
  Layers,
  Table as TableIcon,
  Crop,
  Copy,
  Check,
  FileSpreadsheet,
} from 'lucide-react';

interface TableItem {
  id: number | string;
  title: string;
  box?: [number, number, number, number];
  box_norm?: [number, number, number, number];
  headers: string[];
  rows: string[][];
  quality?: {
    score: number;
    is_complex: boolean;
    sparsity?: number;
    avg_confidence?: number;
    message?: string;
  };
}

interface QualityInfo {
  score: number;
  is_complex: boolean;
  total_tables: number;
  message?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [customBoxes, setCustomBoxes] = useState<Array<[number, number, number, number]>>([]);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [activeTableIndex, setActiveTableIndex] = useState(0);
  const [qualityInfo, setQualityInfo] = useState<QualityInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const currentTable = tables[activeTableIndex] || null;
  const currentHeaders = currentTable ? currentTable.headers : [];
  const currentRows = currentTable ? currentTable.rows : [];

  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('image', file);

    if (customBoxes.length > 0) {
      formData.append('crop_boxes', JSON.stringify(customBoxes));
    }

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
      const extractedTables: TableItem[] = data.tables || [];

      if (extractedTables.length === 0) {
        if (data.headers || data.rows) {
          extractedTables.push({
            id: 1,
            title: 'Table 1',
            headers: data.headers || [],
            rows: data.rows || [],
            quality: data.quality || { score: 85, is_complex: false },
          });
        }
      }

      setTables(extractedTables);
      setActiveTableIndex(0);
      setQualityInfo(data.quality || null);

      if (extractedTables.length === 0 || (extractedTables[0].headers.length === 0 && extractedTables[0].rows.length === 0)) {
        setError('No table structures detected in this area. Try adjusting your crop or uploading a clearer document.');
      } else if (customBoxes.length > 0) {
        setSuccessMessage(
          `Targeted extraction complete: Extracted ${extractedTables.length} ${
            extractedTables.length === 1 ? 'table' : 'tables'
          } from selected regions.`
        );
      } else if (extractedTables.length > 1) {
        setSuccessMessage(
          `Discovered ${extractedTables.length} distinct tables in document.`
        );
      } else {
        setSuccessMessage(
          `Extracted ${extractedTables[0].headers.length} columns and ${extractedTables[0].rows.length} rows.`
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
    if (tables.length === 0) return;
    setExporting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables }),
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
    setCustomBoxes([]);
    setTables([]);
    setActiveTableIndex(0);
    setQualityInfo(null);
    setError(null);
    setSuccessMessage(null);
  };

  const handleGridChange = (newHeaders: string[], newRows: string[][]) => {
    setTables((prev) => {
      const updated = [...prev];
      if (updated[activeTableIndex]) {
        updated[activeTableIndex] = {
          ...updated[activeTableIndex],
          headers: newHeaders,
          rows: newRows,
        };
      }
      return updated;
    });
  };

  const detectedBoxes: DetectedBox[] = tables
    .filter((t) => t.box_norm)
    .map((t, idx) => ({
      id: t.id || idx,
      title: t.title || `Table ${idx + 1}`,
      box_norm: t.box_norm!,
      box: t.box,
    }));

  return (
    <div className="min-h-screen bg-[#fafafc] text-zinc-950 flex flex-col antialiased selection:bg-zinc-900 selection:text-white">
      <Header />

      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 flex-1 space-y-8">
        {/* Minimal Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-xl mx-auto space-y-2.5"
        >
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-zinc-100/90 border border-zinc-200/70 text-zinc-600 text-xs font-medium shadow-2xs">
            <Sparkles className="w-3 h-3 text-zinc-800" />
            <span>High-Accuracy Table Intelligence</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 font-sans">
            Extract Tables to Excel
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
            Convert document images and PDFs to clean spreadsheets completely offline.
          </p>
        </motion.div>

        {/* Upload & Document Preview Workspace */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-5 bg-white/80 p-5 sm:p-6 rounded-3xl border border-zinc-200/80 shadow-xs backdrop-blur-md"
        >
          <UploadZone onFileSelect={setFile} selectedFile={file} />

          {file && (
            <ImagePreview
              file={file}
              detectedBoxes={detectedBoxes}
              activeBoxIndex={activeTableIndex}
              onSelectBox={(idx) => setActiveTableIndex(idx)}
              customBoxes={customBoxes}
              onCustomBoxesChange={setCustomBoxes}
            />
          )}

          {/* Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start space-x-3 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl overflow-hidden"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <p className="font-semibold text-rose-900">Processing Note</p>
                  <p className="text-rose-700">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-rose-400 hover:text-rose-700 text-xs font-medium cursor-pointer p-1"
                >
                  Dismiss
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success / Quality Badge */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-emerald-50/80 border border-emerald-200/80 text-emerald-800 text-xs rounded-2xl"
              >
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-medium text-emerald-950">{successMessage}</span>
                </div>
                {qualityInfo && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0 ${
                      qualityInfo.score >= 80
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    Quality: {qualityInfo.score}%
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Control Dock */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <motion.button
              whileHover={{ scale: !file || loading ? 1 : 1.01 }}
              whileTap={{ scale: !file || loading ? 1 : 0.98 }}
              type="button"
              onClick={handleExtract}
              disabled={!file || loading}
              className={`flex-1 min-w-[180px] flex items-center justify-center space-x-2 text-xs sm:text-sm font-semibold py-2.5 sm:py-3 px-5 rounded-xl transition-all shadow-xs cursor-pointer ${
                !file || loading
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed shadow-none border border-zinc-200/60'
                  : 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-sm'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  <span>Extracting...</span>
                </>
              ) : customBoxes.length > 0 ? (
                <>
                  <Crop className="w-4 h-4 text-emerald-400" />
                  <span>
                    {customBoxes.length === 1
                      ? 'Extract Selected Box'
                      : `Extract ${customBoxes.length} Selected Boxes`}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Extract Tables</span>
                </>
              )}
            </motion.button>

            {tables.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold py-2.5 sm:py-3 px-4 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>
                      {tables.length > 1
                        ? `Export ${tables.length} Sheets (.xlsx)`
                        : 'Export Excel (.xlsx)'}
                    </span>
                  </>
                )}
              </motion.button>
            )}

            {(file || tables.length > 0 || customBoxes.length > 0) && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center space-x-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium py-2.5 sm:py-3 px-3.5 rounded-xl transition-all cursor-pointer"
                title="Reset file and results"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </motion.section>

        {/* Multi-Table Tabs & Results Section */}
        <AnimatePresence>
          {tables.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4 pt-1"
            >
              {/* Animated Segmented Tabs */}
              {tables.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-zinc-100/90 rounded-2xl border border-zinc-200/80">
                  <div className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                    <Layers className="w-3.5 h-3.5 text-zinc-700" />
                    <span>Tables:</span>
                  </div>
                  {tables.map((tbl, idx) => {
                    const isActive = activeTableIndex === idx;
                    return (
                      <button
                        key={tbl.id || idx}
                        type="button"
                        onClick={() => setActiveTableIndex(idx)}
                        className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'text-zinc-950 font-semibold'
                            : 'text-zinc-500 hover:text-zinc-900'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTabPill"
                            className="absolute inset-0 bg-white rounded-xl shadow-2xs border border-zinc-200/80"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center space-x-1.5">
                          <TableIcon className="w-3 h-3" />
                          <span>{tbl.title || `Table ${idx + 1}`}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            ({tbl.headers.length}c × {tbl.rows.length}r)
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active Table Title */}
              {currentTable && (
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-zinc-900">
                      {currentTable.title || `Table ${activeTableIndex + 1}`}
                    </h3>
                    {currentTable.quality && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium ${
                          currentTable.quality.score >= 80
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {currentTable.quality.score}% confidence
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Editable Spreadsheet Table */}
              <EditableGrid
                headers={currentHeaders}
                rows={currentRows}
                onChange={handleGridChange}
              />
            </motion.section>
          )}
        </AnimatePresence>

        {/* Minimal Feature Highlights */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-6 border-t border-zinc-200/80 text-left">
          <div className="p-4 rounded-2xl bg-white border border-zinc-200/70 shadow-2xs space-y-1">
            <div className="flex items-center space-x-2 text-zinc-900 font-semibold text-xs">
              <Crop className="w-3.5 h-3.5 text-zinc-700" />
              <span>Multi-Box ROI Selection</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Drag custom boxes over tables to isolate clean data and eliminate outside noise.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-zinc-200/70 shadow-2xs space-y-1">
            <div className="flex items-center space-x-2 text-zinc-900 font-semibold text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Multi-Sheet Excel Export</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Discovers multiple tables automatically and exports each to its own formatted Excel worksheet.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-zinc-200/70 shadow-2xs space-y-1">
            <div className="flex items-center space-x-2 text-zinc-900 font-semibold text-xs">
              <Shield className="w-3.5 h-3.5 text-zinc-700" />
              <span>100% Offline & Private</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              All OCR and processing runs locally on your CPU. No files or data ever leave your computer.
            </p>
          </div>
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full py-5 border-t border-zinc-200/60 text-center text-[11px] text-zinc-400 bg-white/40">
        <p>SheetSnap Desktop • Modern Offline Table Intelligence</p>
      </footer>
    </div>
  );
}