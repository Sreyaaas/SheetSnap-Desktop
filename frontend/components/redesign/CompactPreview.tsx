'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Maximize2,
  FileText,
} from 'lucide-react';

export interface DetectedBox {
  id: number | string;
  title?: string;
  box_norm: [number, number, number, number];
  box?: [number, number, number, number];
}

interface CompactPreviewProps {
  file: File;
  detectedBoxes?: DetectedBox[];
}

export const CompactPreview: React.FC<CompactPreviewProps> = ({
  file,
  detectedBoxes = [],
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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
      <div className="flex flex-col h-full bg-white border border-zinc-200 rounded-md overflow-hidden text-xs">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-200 bg-zinc-50/80 select-none">
          <div className="flex items-center space-x-2">
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span className="font-semibold text-zinc-700">Document Preview</span>
            {detectedBoxes.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-medium">
                {detectedBoxes.length} {detectedBoxes.length === 1 ? 'Table' : 'Tables'} Found
              </span>
            )}
          </div>

          {!isPdf && previewUrl && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                className="p-1 rounded text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
                title="Zoom out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>

              <span className="font-mono text-[10px] text-zinc-500 w-8 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                className="p-1 rounded text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
                title="Zoom in"
              >
                <ZoomIn className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 rounded text-zinc-600 hover:bg-zinc-200 transition-colors cursor-pointer"
                title="Reset zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="p-1 rounded text-zinc-600 hover:bg-zinc-200 transition-colors cursor-pointer"
                title="Maximize preview"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Preview Viewport Canvas */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-zinc-100/60 p-3 flex items-center justify-center min-h-[280px] sm:min-h-[380px] max-h-[calc(100vh-220px)] relative"
        >
          {isPdf ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
              <div className="p-3 rounded-lg bg-rose-50 text-rose-600 border border-rose-200">
                <FileText className="w-8 h-8" />
              </div>
              <p className="font-semibold text-zinc-800 text-xs">PDF Document Loaded</p>
              <p className="text-[11px] text-zinc-400 max-w-xs">
                SheetSnap will process active table pages automatically during extraction.
              </p>
            </div>
          ) : previewUrl ? (
            <div
              className="relative inline-block select-none shadow-xs border border-zinc-300 bg-white"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Document Preview"
                className="max-h-[500px] w-auto object-contain block pointer-events-none"
                draggable={false}
              />
            </div>
          ) : (
            <div className="text-zinc-400 text-xs italic">Loading preview...</div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isModalOpen && previewUrl && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-xs flex flex-col p-4">
          <div className="flex items-center justify-between text-white pb-3">
            <span className="text-xs font-semibold">{file.name} — Fullscreen Preview</span>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Document" className="max-h-[90vh] w-auto object-contain rounded shadow-2xl" />
          </div>
        </div>
      )}
    </>
  );
};
