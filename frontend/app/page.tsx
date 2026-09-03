'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RedesignHeader } from '@/components/redesign/RedesignHeader';
import { CompactToolbar } from '@/components/redesign/CompactToolbar';
import { CompactPreview, DetectedBox } from '@/components/redesign/CompactPreview';
import { CompactGrid } from '@/components/redesign/CompactGrid';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
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
  diverted_from_local?: boolean;
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

  // Engine state
  const [extractionMode, setExtractionMode] = useState<'auto' | 'ai' | 'local'>('auto');
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-3.6-flash');
  const [geminiThreshold, setGeminiThreshold] = useState(70);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/status`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.gemini_available === 'boolean') {
            setGeminiAvailable(data.gemini_available);
          }
          if (data.gemini_model) {
            setGeminiModel(data.gemini_model);
          }
          if (data.gemini_threshold) {
            setGeminiThreshold(data.gemini_threshold);
          }
        }
      } catch {
        // Backend offline or unreachable
      }
    };
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 5000);
    return () => clearInterval(interval);
  }, [API_URL]);

  const currentTable = tables[activeTableIndex] || null;
  const currentHeaders = currentTable ? currentTable.headers : [];
  const currentRows = currentTable ? currentTable.rows : [];

  const handleFileSelect = useCallback((selectedFile: File | null) => {
    setFile(selectedFile);
    setTables([]);
    setCustomBoxes([]);
    setQualityInfo(null);
    setError(null);
    setSuccessMessage(null);
    setActiveTableIndex(0);
  }, []);

  // Helper to load image blob from clipboard
  const handlePastedBlob = useCallback((blob: Blob, prefix = 'Screen_Snip') => {
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    const ext = blob.type.split('/')[1] || 'png';
    const pastedFile = new File([blob], `${prefix}_${timeStr}.${ext}`, {
      type: blob.type || 'image/png',
    });
    handleFileSelect(pastedFile);
    setSuccessMessage(`Loaded screenshot from clipboard (${pastedFile.name})`);
  }, [handleFileSelect]);

  // Global Ctrl+V / paste event listener
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isTypingText = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable
      );

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            handlePastedBlob(file, 'Clipboard_Snip');
          }
          return;
        }
      }

      // If user pasted something while not in a text box and there was no image
      if (!isTypingText && e.clipboardData?.getData('text')) {
        // do not interfere with text
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [handlePastedBlob]);

  const handleExtract = async (overrideMode?: 'auto' | 'ai' | 'local') => {
    if (!file) return;
    const modeToUse = overrideMode || extractionMode;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('mode', modeToUse);
    formData.append('confidence_threshold', String(geminiThreshold));

    if (customBoxes.length > 0) {
      formData.append('crop_boxes', JSON.stringify(customBoxes));
    }

    try {
      const res = await fetch(`${API_URL}/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errMsg = `Extraction failed (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          errMsg = errJson.detail || errMsg;
        } catch {
          // Fallback text
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const extractedTables = data.tables || [];

      if (!extractedTables || extractedTables.length === 0) {
        throw new Error('No structured tables were discovered in the document.');
      }

      setTables(extractedTables);
      setActiveTableIndex(0);
      setQualityInfo(data.quality || null);

      if (data.quality?.diverted_from_local) {
        setSuccessMessage('Header fragmentation detected locally. Automatically enhanced via Gemini Flash VLM.');
      } else {
        setSuccessMessage(`Discovered ${extractedTables.length} table${extractedTables.length === 1 ? '' : 's'}.`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during table extraction.');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (tables.length === 0) return;
    setExporting(true);
    setError(null);

    try {
      const exportPayload = {
        tables: tables.map((t) => ({
          title: t.title || 'Table',
          headers: t.headers,
          rows: t.rows,
        })),
      };

      const res = await fetch(`${API_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportPayload),
      });

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = file ? file.name.replace(/\.[^/.]+$/, '') : 'SheetSnap_Export';
      a.download = `${baseName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate Excel download.');
    } finally {
      setExporting(false);
    }
  };

  const handleGridChange = (newHeaders: string[], newRows: string[][]) => {
    if (tables.length === 0) {
      setTables([
        {
          id: 1,
          title: 'Table 1',
          headers: newHeaders,
          rows: newRows,
        },
      ]);
      return;
    }

    const updated = tables.map((tbl, idx) => {
      if (idx === activeTableIndex) {
        return {
          ...tbl,
          headers: newHeaders,
          rows: newRows,
        };
      }
      return tbl;
    });
    setTables(updated);
  };

  const detectedBoxes: DetectedBox[] = tables
    .filter((t) => t.box_norm)
    .map((t) => ({
      id: t.id,
      title: t.title,
      box_norm: t.box_norm!,
      box: t.box,
    }));

  return (
    <div className="min-h-screen bg-zinc-100/50 text-zinc-900 flex flex-col font-sans antialiased select-none">
      {/* 1. Desktop Pro Header */}
      <RedesignHeader
        geminiAvailable={geminiAvailable}
        modelName={geminiModel.replace('gemini-', 'Gemini ')}
        activeTab="workspace"
      />

      {/* 2. Compact Workspace Working Toolbar (Active Document Mode) */}
      {file && (
        <CompactToolbar
          file={file}
          onClearFile={() => handleFileSelect(null)}
          onReplaceFile={() => fileInputRef.current?.click()}
          onPasteClipboard={handlePasteFromClipboard}
          mode={extractionMode}
          onModeChange={setExtractionMode}
          confidenceThreshold={geminiThreshold}
          onConfidenceChange={setGeminiThreshold}
          geminiAvailable={geminiAvailable}
          onExtract={() => handleExtract()}
          onExport={handleExport}
          loading={loading}
          exporting={exporting}
          tableCount={tables.length}
          qualityScore={qualityInfo?.score}
        />
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/png, image/jpeg, image/jpg, image/webp, application/pdf"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileSelect(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* 3. Feedback Banners (Error / Auto-Divert / Clipboard Notice) */}
      <div className="px-4 pt-2">
        {error && (
          <div className="mb-2 p-2.5 rounded border border-rose-200 bg-rose-50 text-rose-700 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-rose-500 hover:text-rose-800 underline ml-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {successMessage && !error && (
          <div className="mb-2 p-2.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-xs text-emerald-600 hover:text-emerald-900 underline ml-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* 4. Main Workspace Area */}
      <main className="flex-1 p-4 flex flex-col">
        {!file ? (
          /* Empty State: Clean Desktop Dropzone with Paste Option */
          <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full py-12">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              className="w-full p-8 border-2 border-dashed border-zinc-300 hover:border-zinc-400 bg-white rounded-lg flex flex-col items-center justify-center text-center cursor-pointer transition-colors shadow-2xs group"
            >
              <div className="h-11 w-11 rounded-lg bg-zinc-100 group-hover:bg-zinc-900 group-hover:text-white transition-colors flex items-center justify-center text-zinc-600 mb-3">
                <Upload className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">
                Select or drop document
              </h2>
              <p className="text-xs text-zinc-500 mb-5 max-w-xs">
                Drop PDF, PNG, JPG, or paste directly from your clipboard
              </p>

            </div>
          </div>
        ) : (
          /* Active Document Workbench: Two-Column Split View */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
            {/* Left Column: Document Preview (5 cols on large) */}
            <div className="lg:col-span-5 h-[500px] lg:h-full min-h-[420px]">
              <CompactPreview
                file={file}
                detectedBoxes={detectedBoxes}
                customBoxes={customBoxes}
                onCustomBoxesChange={setCustomBoxes}
              />
            </div>

            {/* Right Column: High-Density Spreadsheet Grid (7 cols on large) */}
            <div className="lg:col-span-7 h-[500px] lg:h-full min-h-[420px] flex flex-col">
              {tables.length === 0 && !loading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-white border border-zinc-200 rounded-md p-8 text-center">
                  <FileSpreadsheet className="w-10 h-10 text-zinc-300 mb-2.5" />
                  <h3 className="text-xs font-semibold text-zinc-800 mb-1">
                    Document Ready for Table Extraction
                  </h3>
                  <p className="text-[11px] text-zinc-500 max-w-xs mb-4">
                    Click &quot;Extract Tables&quot; to detect rows and columns automatically, or draw custom crop boxes on the document preview.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleExtract()}
                    className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                  >
                    Extract Tables
                  </button>
                </div>
              ) : (
                <CompactGrid
                  tables={tables}
                  activeTableIndex={activeTableIndex}
                  onSelectTable={setActiveTableIndex}
                  headers={currentHeaders}
                  rows={currentRows}
                  onChange={handleGridChange}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}