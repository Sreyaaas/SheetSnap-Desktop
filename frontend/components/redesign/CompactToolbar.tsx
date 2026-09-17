'use client';

import React from 'react';
import {
  FileText,
  FileImage,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Play,
  FileSpreadsheet,
  Clipboard,
  ArrowDownToLine,
  Split,
  Sparkles,
} from 'lucide-react';

interface CompactToolbarProps {
  file: File | null;
  onClearFile: () => void;
  onReplaceFile: () => void;
  onPasteClipboard?: () => void;
  isMerged?: boolean;
  onMergeTables?: () => void;
  onUnmergeTables?: () => void;
  modelName?: string;
  geminiAvailable?: boolean;
  onExtract: () => void;
  onExport: () => void;
  loading: boolean;
  exporting: boolean;
  tableCount: number;
  qualityScore?: number | null;
}

export const CompactToolbar: React.FC<CompactToolbarProps> = ({
  file,
  onClearFile,
  onReplaceFile,
  onPasteClipboard,
  isMerged = false,
  onMergeTables,
  onUnmergeTables,
  modelName = 'Gemini 3.6 Flash',
  geminiAvailable = true,
  onExtract,
  onExport,
  loading,
  exporting,
  tableCount,
  qualityScore,
}) => {
  if (!file) return null;

  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full bg-white border-b border-zinc-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
      {/* Left: File Metadata & Action */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-2 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-md max-w-xs sm:max-w-sm truncate">
          {isPdf ? (
            <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          ) : (
            <FileImage className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
          )}
          <span className="font-medium text-zinc-900 truncate" title={file.name}>
            {file.name}
          </span>
          <span className="text-[11px] font-mono text-zinc-400 shrink-0">
            {formatFileSize(file.size)}
          </span>
          <button
            type="button"
            onClick={onReplaceFile}
            className="text-[11px] text-zinc-500 hover:text-zinc-900 underline ml-1 cursor-pointer"
            title="Browse and replace document"
          >
            Change
          </button>
          {onPasteClipboard && (
            <button
              type="button"
              onClick={onPasteClipboard}
              className="text-[11px] text-zinc-600 hover:text-zinc-950 flex items-center gap-1 bg-white hover:bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors shadow-2xs"
              title="Paste new snip from clipboard (Ctrl+V)"
            >
              <Clipboard className="w-3 h-3 text-zinc-500" />
              <span>Paste Snip</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClearFile}
            className="text-zinc-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
            title="Remove document"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Tables & Quality Meta */}
        {(tableCount > 0 || isMerged) && (
          <div className="hidden md:flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono text-[11px]">
              {isMerged ? '1 Merged Sheet' : `${tableCount} ${tableCount === 1 ? 'Table' : 'Tables'}`}
            </span>
            {tableCount > 1 && !isMerged && onMergeTables && (
              <button
                type="button"
                onClick={onMergeTables}
                className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Merge all tables down into 1 with clean spacing"
              >
                <ArrowDownToLine className="w-3 h-3 text-emerald-600" />
                <span>Merge All</span>
              </button>
            )}
            {isMerged && onUnmergeTables && (
              <button
                type="button"
                onClick={onUnmergeTables}
                className="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Separate back into individual tables"
              >
                <Split className="w-3 h-3 text-zinc-500" />
                <span>Separate Tables</span>
              </button>
            )}
            {qualityScore !== undefined && qualityScore !== null && (
              <span
                className={`px-2 py-0.5 rounded border text-[11px] font-mono ${qualityScore >= 80
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
              >
                Quality: {qualityScore}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: Controls & Primary Actions */}
      <div className="flex items-center flex-wrap space-x-2.5">
        {/* Active AI Model Badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <span>{modelName}</span>
        </div>

        {/* Run Extraction Button */}
        <button
          type="button"
          onClick={onExtract}
          disabled={loading || !geminiAvailable}
          className="h-8 px-3.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs flex items-center space-x-1.5 shadow-2xs transition-colors disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Extracting with AI...' : 'Extract Tables'}</span>
        </button>

        {/* Export to Excel (.xlsx) Button */}
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || tableCount === 0}
          className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1.5 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{exporting ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
        </button>
      </div>
    </div>
  );
};
