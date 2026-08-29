'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  FileText,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Crop,
  Plus,
  Layers,
  Sparkles,
} from 'lucide-react';

export interface DetectedBox {
  id: number | string;
  title?: string;
  box_norm: [number, number, number, number]; // [x, y, w, h] normalized 0..1
  box?: [number, number, number, number]; // [x1, y1, x2, y2]
}

interface ImagePreviewProps {
  file: File;
  detectedBoxes?: DetectedBox[];
  activeBoxIndex?: number;
  onSelectBox?: (index: number) => void;
  customBoxes?: Array<[number, number, number, number]>;
  onCustomBoxesChange?: (boxes: Array<[number, number, number, number]>) => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  file,
  detectedBoxes = [],
  activeBoxIndex = 0,
  onSelectBox,
  customBoxes = [],
  onCustomBoxesChange,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDrawingMode, setIsDrawingMode] = useState(true);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [drawingBox, setDrawingBox] = useState<[number, number, number, number] | null>(null);

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

  // Helper to get normalized [0..1] coordinates from mouse event
  const getNormalizedPoint = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingMode) return;
    e.preventDefault();
    e.stopPropagation();

    const pt = getNormalizedPoint(e);
    if (!pt) return;

    setIsDrawing(true);
    setStartPoint(pt);
    setDrawingBox([pt.x, pt.y, 0, 0]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint) return;
    e.preventDefault();

    const pt = getNormalizedPoint(e);
    if (!pt) return;

    const x = Math.min(startPoint.x, pt.x);
    const y = Math.min(startPoint.y, pt.y);
    const w = Math.abs(pt.x - startPoint.x);
    const h = Math.abs(pt.y - startPoint.y);

    setDrawingBox([x, y, w, h]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (drawingBox && drawingBox[2] > 0.03 && drawingBox[3] > 0.02) {
      const updated = [...customBoxes, drawingBox];
      onCustomBoxesChange?.(updated);
    }
    setDrawingBox(null);
  };

  const handleDeleteBox = (indexToDelete: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customBoxes.filter((_, idx) => idx !== indexToDelete);
    onCustomBoxesChange?.(updated);
  };

  const handleClearAllBoxes = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCustomBoxesChange?.([]);
  };

  const boxColors = [
    { border: 'border-emerald-500', bg: 'bg-emerald-500/12', tag: 'bg-emerald-600', ring: 'ring-emerald-400' },
    { border: 'border-blue-500', bg: 'bg-blue-500/12', tag: 'bg-blue-600', ring: 'ring-blue-400' },
    { border: 'border-purple-500', bg: 'bg-purple-500/12', tag: 'bg-purple-600', ring: 'ring-purple-400' },
    { border: 'border-amber-500', bg: 'bg-amber-500/12', tag: 'bg-amber-600', ring: 'ring-amber-400' },
    { border: 'border-rose-500', bg: 'bg-rose-500/12', tag: 'bg-rose-600', ring: 'ring-rose-400' },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full bg-white border border-zinc-200/90 rounded-2xl overflow-hidden shadow-xs transition-all"
      >
        {/* Header Bar */}
        <div className="px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-700">
              Document Preview
            </span>
            {customBoxes.length > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {customBoxes.length} {customBoxes.length === 1 ? 'Box' : 'Boxes'}
              </span>
            ) : detectedBoxes.length > 1 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <Layers className="w-3 h-3 mr-1" />
                {detectedBoxes.length} Tables
              </span>
            ) : null}
          </div>

          {!isPdf && previewUrl && (
            <div className="flex items-center space-x-1.5">
              {/* Toggle Draw Box Mode */}
              <button
                type="button"
                onClick={() => setIsDrawingMode(!isDrawingMode)}
                className={`flex items-center space-x-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  isDrawingMode
                    ? 'bg-zinc-950 text-white shadow-2xs'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                }`}
                title={isDrawingMode ? 'Drawing mode active' : 'Click to enable manual box drawing'}
              >
                <Crop className="w-3 h-3" />
                <span>{isDrawingMode ? 'Draw Mode: ON' : 'Draw Boxes'}</span>
              </button>

              {customBoxes.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllBoxes}
                  className="flex items-center space-x-1 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  title="Clear all drawn boxes"
                >
                  <X className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}

              {/* Inline Fit/Expand */}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center space-x-1 text-xs text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-colors cursor-pointer px-2 py-1 rounded-lg"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? (
                  <Minimize2 className="w-3 h-3" />
                ) : (
                  <Maximize2 className="w-3 h-3" />
                )}
              </button>

              {/* Fullscreen Lightbox */}
              <button
                type="button"
                onClick={() => {
                  setZoomLevel(1);
                  setIsModalOpen(true);
                }}
                className="flex items-center space-x-1 text-xs text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-colors cursor-pointer px-2 py-1 rounded-lg"
                title="Fullscreen"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Informational banner for multi-box drawing */}
        {isDrawingMode && !isPdf && (
          <div className="bg-zinc-100/70 border-b border-zinc-200/60 px-4 py-1.5 text-[11px] text-zinc-600 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Tip:</strong> Drag rectangles over tables to isolate them. You can draw multiple boxes.
            </span>
            {customBoxes.length > 0 && (
              <span className="font-mono text-zinc-800 font-semibold">
                {customBoxes.length} {customBoxes.length === 1 ? 'Box' : 'Boxes'} selected
              </span>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="p-4 flex flex-col items-center justify-center bg-zinc-50/30 select-none">
          {isPdf ? (
            <div className="py-8 px-4 flex flex-col items-center justify-center text-center space-y-2.5 max-w-sm">
              <div className="h-12 w-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-2xs">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm font-semibold text-zinc-900">{file.name}</p>
                <p className="text-[11px] text-zinc-400">
                  PDF loaded • Rendered at 300 DPI high-resolution
                </p>
              </div>
            </div>
          ) : previewUrl ? (
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className={`relative inline-block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs transition-all duration-300 ${
                isDrawingMode ? 'cursor-crosshair' : 'cursor-default'
              } ${isExpanded ? 'max-h-[850px]' : 'max-h-80'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Document preview"
                draggable={false}
                className={`block object-contain select-none pointer-events-none transition-all duration-200 ${
                  isExpanded ? 'max-h-[850px] w-full' : 'max-h-80 w-auto'
                }`}
              />

              {/* Render User-Drawn Custom Boxes */}
              {customBoxes.map((box, idx) => {
                const [bx, by, bw, bh] = box;
                const col = boxColors[idx % boxColors.length];
                const isSelected = activeBoxIndex === idx;

                return (
                  <div
                    key={`custom-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBox?.(idx);
                    }}
                    style={{
                      left: `${bx * 100}%`,
                      top: `${by * 100}%`,
                      width: `${bw * 100}%`,
                      height: `${bh * 100}%`,
                    }}
                    className={`group absolute border-2 rounded-md transition-all cursor-pointer ${col.border} ${col.bg} ${
                      isSelected ? `ring-2 ${col.ring} shadow-sm` : 'hover:ring-1 hover:ring-white/80'
                    }`}
                  >
                    <div
                      className={`absolute top-0 left-0 -translate-y-full px-1.5 py-0.5 text-[9px] font-mono font-bold text-white rounded-t-md shadow-xs flex items-center space-x-1 ${col.tag}`}
                    >
                      <span>Box {idx + 1}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteBox(idx, e)}
                      className="absolute top-1 right-1 h-4 w-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xs cursor-pointer z-10"
                      title="Delete box"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}

              {/* Temporary Drawing Box */}
              {drawingBox && (
                <div
                  style={{
                    left: `${drawingBox[0] * 100}%`,
                    top: `${drawingBox[1] * 100}%`,
                    width: `${drawingBox[2] * 100}%`,
                    height: `${drawingBox[3] * 100}%`,
                  }}
                  className="absolute border-2 border-dashed border-zinc-900 bg-zinc-900/15 rounded-md pointer-events-none"
                >
                  <div className="absolute top-0 left-0 -translate-y-full bg-zinc-950 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-t-md flex items-center space-x-1">
                    <Plus className="w-2 h-2" />
                    <span>Box {customBoxes.length + 1}</span>
                  </div>
                </div>
              )}

              {/* Render Auto-Detected Boxes */}
              {customBoxes.length === 0 &&
                !drawingBox &&
                detectedBoxes.map((boxItem, idx) => {
                  if (!boxItem.box_norm) return null;
                  const [bx, by, bw, bh] = boxItem.box_norm;
                  const isSelected = activeBoxIndex === idx;
                  const col = boxColors[idx % boxColors.length];

                  return (
                    <div
                      key={boxItem.id || idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectBox?.(idx);
                      }}
                      style={{
                        left: `${bx * 100}%`,
                        top: `${by * 100}%`,
                        width: `${bw * 100}%`,
                        height: `${bh * 100}%`,
                      }}
                      className={`absolute border-2 rounded-md transition-all cursor-pointer ${
                        isSelected
                          ? `${col.border} ${col.bg} ring-2 ${col.ring} shadow-sm`
                          : 'border-zinc-400/60 bg-zinc-900/5 hover:border-zinc-800'
                      }`}
                    >
                      <span
                        className={`absolute top-0 left-0 -translate-y-full px-1.5 py-0.5 text-[9px] font-mono font-bold text-white rounded-t-md shadow-xs ${
                          isSelected ? col.tag : 'bg-zinc-700'
                        }`}
                      >
                        {boxItem.title || `Table ${idx + 1}`}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="py-6 text-xs text-zinc-400">Loading document...</div>
          )}
        </div>
      </motion.div>

      {/* Lightbox Modal */}
      {isModalOpen && previewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="absolute top-4 right-6 flex items-center space-x-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-1 bg-zinc-900 border border-zinc-800 text-white px-2.5 py-1 rounded-xl text-xs font-mono">
              <button type="button" onClick={handleZoomOut} disabled={zoomLevel <= 0.5} className="p-1 hover:bg-zinc-800 rounded">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5">{Math.round(zoomLevel * 100)}%</span>
              <button type="button" onClick={handleZoomIn} disabled={zoomLevel >= 3} className="p-1 hover:bg-zinc-800 rounded">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={handleResetZoom} className="p-1 hover:bg-zinc-800 rounded ml-1">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="w-full h-full max-h-[88vh] flex items-center justify-center overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
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