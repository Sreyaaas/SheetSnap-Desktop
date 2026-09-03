'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crop,
  X,
  Maximize2,
  FileText,
  Layers,
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
  customBoxes?: Array<[number, number, number, number]>;
  onCustomBoxesChange?: (boxes: Array<[number, number, number, number]>) => void;
}

export const CompactPreview: React.FC<CompactPreviewProps> = ({
  file,
  detectedBoxes = [],
  customBoxes = [],
  onCustomBoxesChange,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDrawingMode, setIsDrawingMode] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Dragging state
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
    if (!isDrawingMode || isPdf) return;
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

  return (
    <>
      <div className="flex flex-col h-full bg-white border border-zinc-200 rounded-md overflow-hidden text-xs">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-200 bg-zinc-50/80 select-none">
          <div className="flex items-center space-x-2">
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span className="font-semibold text-zinc-700">Document Preview</span>
            {customBoxes.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-medium">
                {customBoxes.length} {customBoxes.length === 1 ? 'Box' : 'Boxes'}
              </span>
            )}
            {detectedBoxes.length > 1 && customBoxes.length === 0 && (
              <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-medium">
                {detectedBoxes.length} Tables Found
              </span>
            )}
          </div>

          {!isPdf && previewUrl && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setIsDrawingMode(!isDrawingMode)}
                className={`h-6 px-2 rounded text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer ${isDrawingMode
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                  }`}
                title={isDrawingMode ? 'Draw ROI box enabled' : 'Click to enable manual ROI box drawing'}
              >
                <Crop className="w-3 h-3" />
                <span>{isDrawingMode ? 'Draw: ON' : 'Draw'}</span>
              </button>

              {customBoxes.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllBoxes}
                  className="h-6 px-1.5 rounded text-[11px] font-medium bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                  title="Clear ROI boxes"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              <div className="h-4 w-px bg-zinc-200 mx-1"></div>

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

        {/* Tip sub-strip for box drawing */}
        {isDrawingMode && !isPdf && (
          <div className="bg-zinc-50 border-b border-zinc-200 px-3 py-1 text-[11px] text-zinc-500 flex items-center justify-between">
            <span>Drag rectangles over tables to isolate them.</span>
            {customBoxes.length > 0 && (
              <span className="font-mono text-zinc-700 font-semibold">{customBoxes.length} selected</span>
            )}
          </div>
        )}

        {/* Preview Viewport Canvas */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-zinc-100/60 p-3 flex items-center justify-center min-h-[380px] max-h-[calc(100vh-220px)] relative"
        >
          {isPdf ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
              <div className="p-3 rounded-lg bg-rose-50 text-rose-600 border border-rose-200">
                <FileText className="w-8 h-8" />
              </div>
              <p className="font-semibold text-zinc-800 text-xs">PDF Document Loaded</p>
              <p className="text-[11px] text-zinc-400 max-w-xs">
                SheetSnap will render and process page 1 at 300 DPI directly during extraction.
              </p>
            </div>
          ) : previewUrl ? (
            <div
              className={`relative inline-block select-none shadow-xs border border-zinc-300 bg-white ${isDrawingMode ? 'cursor-crosshair' : 'cursor-default'
                }`}
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'center center',
                transition: isDrawing ? 'none' : 'transform 0.15s ease',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Document Preview"
                className="max-h-[500px] w-auto object-contain block pointer-events-none"
                draggable={false}
              />

              {/* Detected Table ROI Overlays (when no custom boxes) */}
              {customBoxes.length === 0 &&
                detectedBoxes.map((box, bIdx) => (
                  <div
                    key={box.id}
                    className="absolute border-2 border-emerald-500 bg-emerald-500/10 pointer-events-none transition-all"
                    style={{
                      left: `${box.box_norm[0] * 100}%`,
                      top: `${box.box_norm[1] * 100}%`,
                      width: `${box.box_norm[2] * 100}%`,
                      height: `${box.box_norm[3] * 100}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-600 text-white shadow-xs">
                      {box.title || `Table ${bIdx + 1}`}
                    </span>
                  </div>
                ))}

              {/* User Custom ROI Crop Boxes */}
              {customBoxes.map((box, bIdx) => (
                <div
                  key={bIdx}
                  className="absolute border-2 border-blue-600 bg-blue-600/15 group"
                  style={{
                    left: `${box[0] * 100}%`,
                    top: `${box[1] * 100}%`,
                    width: `${box[2] * 100}%`,
                    height: `${box[3] * 100}%`,
                  }}
                >
                  <div className="absolute -top-5 left-0 flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-600 text-white shadow-xs">
                    <span>Box {bIdx + 1}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteBox(bIdx, e)}
                      className="hover:text-rose-200 ml-1 cursor-pointer"
                      title="Delete box"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {/* Active Drawing Box Indicator */}
              {isDrawing && drawingBox && (
                <div
                  className="absolute border-2 border-dashed border-blue-600 bg-blue-500/20 pointer-events-none"
                  style={{
                    left: `${drawingBox[0] * 100}%`,
                    top: `${drawingBox[1] * 100}%`,
                    width: `${drawingBox[2] * 100}%`,
                    height: `${drawingBox[3] * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-600 text-white">
                    Drawing Box...
                  </span>
                </div>
              )}
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
