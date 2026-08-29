'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileImage, FileText, AlertCircle, X, CheckCircle2 } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, selectedFile }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateAndPass = (file: File) => {
    setError(null);
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !['jpg', 'jpeg', 'png', 'pdf'].includes(ext || '')) {
      setError('Unsupported file type. Please select a JPG, PNG, or PDF file.');
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const isPdf = selectedFile?.name.toLowerCase().endsWith('.pdf');

  return (
    <div className="w-full space-y-3">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/png, image/jpeg, image/jpg, application/pdf"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            validateAndPass(e.target.files[0]);
            e.target.value = ''; // Reset input to allow re-uploading same file if desired
          }
        }}
      />

      {!selectedFile ? (
        /* Empty / Drop Zone State */
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload document file for table extraction"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={handleKeyDown}
          className={`group relative border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
            isDragging
              ? 'border-slate-900 bg-slate-100/80 scale-[0.995] shadow-inner'
              : 'border-slate-200 hover:border-slate-400 bg-white/70 hover:bg-white shadow-xs'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            {/* Upload Icon Badge */}
            <div
              className={`p-3.5 rounded-2xl transition-all duration-200 shadow-sm ${
                isDragging
                  ? 'bg-slate-900 text-white scale-110'
                  : 'bg-slate-50 text-slate-600 border border-slate-200/80 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900'
              }`}
            >
              <Upload className="w-6 h-6 transition-transform group-hover:-translate-y-0.5 duration-200" />
            </div>

            {/* Prompt Text */}
            <div className="space-y-1.5 max-w-sm">
              <p className="text-sm font-medium text-slate-800">
                <span className="text-slate-900 font-semibold underline underline-offset-4 decoration-slate-300 group-hover:decoration-slate-900 transition-colors">
                  Click to upload
                </span>{' '}
                or drag and drop
              </p>
              <p className="text-xs text-slate-500">
                Purchase orders, invoices, scanned receipts, or data sheets
              </p>
            </div>

            {/* Format Tags */}
            <div className="flex items-center gap-1.5 pt-1">
              {['PDF', 'PNG', 'JPG', 'JPEG'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2 py-0.5 text-[11px] font-medium tracking-wide bg-slate-100 text-slate-600 rounded-md border border-slate-200/60"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Selected File Card */
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs transition-all hover:border-slate-300">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 shrink-0">
                {isPdf ? (
                  <FileText className="w-6 h-6 text-rose-600" />
                ) : (
                  <FileImage className="w-6 h-6 text-blue-600" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {selectedFile.name}
                  </p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {formatFileSize(selectedFile.size)} • {selectedFile.type || (isPdf ? 'PDF Document' : 'Image')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onFileSelect(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Remove file"
                aria-label="Remove selected file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Validation Error */}
      {error && (
        <div className="flex items-center space-x-2 text-rose-600 text-xs px-3 py-2 bg-rose-50 border border-rose-200/80 rounded-xl animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};