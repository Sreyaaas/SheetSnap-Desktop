'use client';

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileImage, FileText, AlertCircle, X, Check, ArrowUpRight } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, selectedFile }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const validateAndPass = (file: File) => {
    setError(null);
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext || '')) {
      setError('Unsupported file format. Upload a JPG, PNG, WebP, or PDF document.');
      return;
    }
    if (file.size === 0) {
      setError('The selected file is empty.');
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndPass(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const isPdf = selectedFile?.name.toLowerCase().endsWith('.pdf');

  return (
    <div className="w-full space-y-2">
      {/* Hidden Native File Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/png, image/jpeg, image/jpg, image/webp, application/pdf"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            validateAndPass(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            role="button"
            tabIndex={0}
            aria-label="Upload document file for table extraction"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group relative rounded-2xl border border-dashed p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 outline-none ${
              isDragging
                ? 'border-zinc-950 bg-zinc-100/80 ring-2 ring-zinc-950/10'
                : 'border-zinc-300/80 hover:border-zinc-400 bg-white/50 hover:bg-white'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-3.5">
              {/* Minimal Icon */}
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className={`p-3 rounded-xl transition-all duration-200 shadow-2xs ${
                  isDragging
                    ? 'bg-zinc-950 text-white'
                    : 'bg-zinc-100 text-zinc-600 border border-zinc-200/80 group-hover:bg-zinc-950 group-hover:text-white group-hover:border-zinc-950'
                }`}
              >
                <Upload className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5" />
              </motion.div>

              {/* Text */}
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-900">
                  <span className="font-semibold underline underline-offset-4 decoration-zinc-300 group-hover:decoration-zinc-900 transition-colors">
                    Click to upload
                  </span>{' '}
                  or drag and drop document
                </p>
                <p className="text-xs text-zinc-400">
                  PDF documents, invoices, purchase orders, or camera photos
                </p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 pt-0.5">
                {['PDF', 'PNG', 'JPG', 'WebP'].map((fmt) => (
                  <span
                    key={fmt}
                    className="px-2 py-0.5 text-[10px] font-mono font-medium tracking-wide bg-zinc-100 text-zinc-600 rounded-md border border-zinc-200/70"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          /* Selected File Card */
          <motion.div
            key="filecard"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-zinc-200/90 rounded-2xl p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-zinc-100 border border-zinc-200/70 flex items-center justify-center text-zinc-700 shrink-0">
                  {isPdf ? (
                    <FileText className="w-5 h-5 text-rose-600" />
                  ) : (
                    <FileImage className="w-5 h-5 text-zinc-800" />
                  )}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-900 truncate">
                      {selectedFile.name}
                    </p>
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      <Check className="w-2.5 h-2.5" />
                      Loaded
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {formatFileSize(selectedFile.size)} • {isPdf ? 'PDF Document' : 'Image File'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => onFileSelect(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                  title="Remove file"
                  aria-label="Remove selected file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center space-x-2 text-rose-600 text-xs px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};