'use client';

import React, { useRef, useEffect, useState } from 'react';
import { RedesignHeader } from '@/components/redesign/RedesignHeader';
import { DocumentTabBar } from '@/components/redesign/DocumentTabBar';
import { CompactToolbar } from '@/components/redesign/CompactToolbar';
import { CompactPreview, DetectedBox } from '@/components/redesign/CompactPreview';
import { CompactGrid } from '@/components/redesign/CompactGrid';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Layers,
} from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';

export default function Home() {
  const {
    tabs,
    activeTabId,
    file,
    loading,
    exporting,
    customBoxes,
    tables,
    activeTableIndex,
    isMerged,
    qualityInfo,
    error,
    successMessage,
    geminiAvailable,
    geminiModel,
    selectDocumentTab,
    closeDocumentTab,
    setActiveTableIndex,
    setError,
    setSuccessMessage,
    handleFileSelect,
    handleExtract,
    handleExport,
    handleCombinedExport,
    handleGridChange,
    handleMergeTables,
    handleUnmergeTables,
    handlePastedBlob,
    handlePasteFromClipboard,
  } = useWorkspace();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived responsive mobile tab: auto-switches to tables when tables exist, or honors manual user selection
  const [userSelectedTab, setUserSelectedTab] = useState<'preview' | 'tables' | null>(null);
  const mobileTab = userSelectedTab ?? (tables.length > 0 ? 'tables' : 'preview');

  const currentTable = tables[activeTableIndex] || null;
  const currentHeaders = currentTable ? currentTable.headers : [];
  const currentRows = currentTable ? currentTable.rows : [];

  // Global Ctrl+V / paste event listener
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isTypingText =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable);

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            handlePastedBlob(pastedFile, 'Clipboard_Snip');
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

  const detectedBoxes: DetectedBox[] = tables
    .filter((t) => t.box_norm)
    .map((t) => ({
      id: t.id,
      title: t.title,
      box_norm: t.box_norm!,
      box: t.box,
    }));

  const tabsWithTablesCount = tabs.filter((t) => t.tables && t.tables.length > 0).length;

  return (
    <div
      className="min-h-screen bg-zinc-100/50 text-zinc-900 flex flex-col font-sans antialiased select-none"
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
    >
      {/* 1. Desktop Pro Header */}
      <RedesignHeader
        geminiAvailable={geminiAvailable}
        modelName={geminiModel.replace('gemini-', 'Gemini ')}
        activeTab="workspace"
      />

      {/* 2. Document Tab Bar (Multiple open images / PDFs) */}
      <DocumentTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={selectDocumentTab}
        onCloseTab={closeDocumentTab}
        onNewTab={() => fileInputRef.current?.click()}
        onPasteClipboard={handlePasteFromClipboard}
      />

      {/* 3. Compact Workspace Working Toolbar (Active Document Mode) */}
      {file && (
        <CompactToolbar
          file={file}
          onClearFile={() => activeTabId && closeDocumentTab(activeTabId)}
          onReplaceFile={() => fileInputRef.current?.click()}
          onPasteClipboard={handlePasteFromClipboard}
          isMerged={isMerged}
          onMergeTables={handleMergeTables}
          onUnmergeTables={handleUnmergeTables}
          modelName={geminiModel}
          geminiAvailable={geminiAvailable}
          onExtract={handleExtract}
          onExport={handleExport}
          onCombinedExport={handleCombinedExport}
          totalTabsCount={tabs.length}
          tabsWithTablesCount={tabsWithTablesCount}
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

      {/* 4. Feedback Banners (Error / Auto-Divert / Clipboard Notice) */}
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

      {/* 5. Main Workspace Area */}
      <main className="flex-1 p-4 flex flex-col">
        {!file || tabs.length === 0 ? (
          /* Empty State: Clean Desktop Dropzone with Paste Option */
          <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full py-12">
            <div
              onClick={() => fileInputRef.current?.click()}
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

              {/* Paste from Clipboard Option */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePasteFromClipboard();
                }}
                className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-md text-xs font-medium flex items-center gap-2 border border-zinc-200 transition-colors cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5 text-zinc-600" />
                <span>Paste from Clipboard</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium bg-white text-zinc-600 rounded border border-zinc-200">
                  Ctrl+V
                </kbd>
              </button>
            </div>
          </div>
        ) : (
          /* Active Document Workbench: Responsive Two-Column / Mobile Segmented View */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Mobile View Switcher (< lg screens) */}
            <div className="lg:hidden flex items-center justify-center mb-2.5">
              <div className="bg-zinc-200/80 p-0.5 rounded-md border border-zinc-200/80 flex items-center space-x-1 text-xs">
                <button
                  type="button"
                  onClick={() => setUserSelectedTab('preview')}
                  className={`px-3 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                    mobileTab === 'preview'
                      ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Document Preview
                </button>
                <button
                  type="button"
                  onClick={() => setUserSelectedTab('tables')}
                  className={`px-3 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                    mobileTab === 'tables'
                      ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Extracted Tables {tables.length > 0 ? `(${tables.length})` : ''}
                </button>
              </div>
            </div>

            {/* Main Workbench Grid Container */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
              {/* Left Column: Document Preview */}
              <div className={`lg:col-span-5 h-[480px] lg:h-full min-h-[380px] ${mobileTab === 'preview' ? 'block' : 'hidden lg:block'}`}>
                <CompactPreview
                  file={file}
                  detectedBoxes={detectedBoxes}
                />
              </div>

              {/* Right Column: High-Density Spreadsheet Grid */}
              <div className={`lg:col-span-7 h-[480px] lg:h-full min-h-[380px] flex flex-col ${mobileTab === 'tables' ? 'flex' : 'hidden lg:flex'}`}>
                {tables.length === 0 && !loading ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-white border border-zinc-200 rounded-md p-8 text-center">
                    <FileSpreadsheet className="w-10 h-10 text-zinc-300 mb-2.5" />
                    <h3 className="text-xs font-semibold text-zinc-800 mb-1">
                      Document Ready for Table Extraction
                    </h3>
                    <p className="text-[11px] text-zinc-500 max-w-xs mb-4">
                      Click &quot;Extract Tables&quot; to detect rows and columns automatically.
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
                    isMerged={isMerged}
                    onMergeTables={handleMergeTables}
                    onUnmergeTables={handleUnmergeTables}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}