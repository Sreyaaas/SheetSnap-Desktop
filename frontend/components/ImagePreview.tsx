'use client';

import React, { useState, useEffect } from 'react';
import {
  Eye,
  FileText,
  Maximize2,
  Minimize2,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
} from 'lucide-react';

interface ImagePreviewProps {
  file: File;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ file }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

  useEffect(() => {
    if (isPdf) return;

    let isMounted = true;
    const reader = new FileReader();

    reader.onload = () => {
      if (isMounted && typeof reader.result === 'string') {
        setPreviewUrl(reader.result);
      }
    };

    reader.readAsDataURL(file);

    return () => {
      isMounted = false;
    };
  }, [file, isPdf]);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  return (
    <>
      <div className="w-full bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs transition-all">
        {/* Header Bar */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Eye className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Source Document Preview
            </span>
          </div>

          {!isPdf && previewUrl && (
            <div className="flex items-center space-x-1.5">
              {/* Inline Fit/Expand */}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer px-2.5 py-1 rounded-lg"
                title={isExpanded ? 'Collapse preview' : 'Expand preview'}
              >
                {isExpanded ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Collapse</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand</span>
                  </>
                )}
              </button>

              {/* Fullscreen Lightbox */}
              <button
                type="button"
                onClick={() => {
                  setZoomLevel(1);
                  setIsModalOpen(true);
                }}
                className="flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer px-2.5 py-1 rounded-lg"
                title="Open fullscreen view with zoom controls"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>Fullscreen</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-4 flex flex-col items-center justify-center bg-slate-50/40">
          {isPdf ? (
            <div className="py-10 px-6 flex flex-col items-center justify-center text-center space-y-3 max-w-sm">
              <div className="h-16 w-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-xs">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">
                  PDF document loaded. SheetSnap will automatically render pages at 300 DPI for high-accuracy OCR table detection.
                </p>
              </div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                <span>Multi-page & vector engine ready</span>
              </div>
            </div>
          ) : previewUrl ? (
            <div
              onClick={() => {
                setZoomLevel(1);
                setIsModalOpen(true);
              }}
              className={`group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white flex items-center justify-center shadow-2xs transition-all duration-300 cursor-zoom-in ${
                isExpanded ? 'max-h-[850px]' : 'max-h-80'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Uploaded document preview"
                className={`object-contain transition-all duration-200 ${
                  isExpanded ? 'max-h-[850px] w-full' : 'max-h-80 w-auto'
                }`}
              />
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 text-white text-[11px] px-2.5 py-1 rounded-md backdrop-blur-xs flex items-center space-x-1">
                <ZoomIn className="w-3 h-3" />
                <span>Click to zoom</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-xs text-slate-400">Loading preview...</div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isModalOpen && previewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
        >
          {/* Modal Toolbar */}
          <div
            className="absolute top-4 inset-x-4 sm:inset-x-auto sm:right-6 flex items-center justify-between sm:justify-end space-x-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-700/80 text-white px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-md text-xs">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-slate-700 mx-1" />
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 hover:bg-slate-800 rounded cursor-pointer"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shadow-lg cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Image Display */}
          <div
            className="w-full h-full max-h-[88vh] flex items-center justify-center overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Full preview"
              style={{ transform: `scale(${zoomLevel})` }}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform duration-150"
            />
          </div>
        </div>
      )}
    </>
  );
};