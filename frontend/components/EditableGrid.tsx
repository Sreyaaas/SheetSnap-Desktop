'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Copy, Check, Columns, Rows, Sparkles } from 'lucide-react';

interface EditableGridProps {
  headers: string[];
  rows: string[][];
  onChange: (headers: string[], rows: string[][]) => void;
}

export const EditableGrid: React.FC<EditableGridProps> = ({ headers, rows, onChange }) => {
  const [copied, setCopied] = useState(false);
  const [formatted, setFormatted] = useState(false);

  const getColumnLetter = (index: number): string => {
    let letter = '';
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const updatedRows = rows.map((r, rIdx) =>
      rIdx === rowIndex ? r.map((c, cIdx) => (cIdx === colIndex ? value : c)) : r
    );
    onChange(headers, updatedRows);
  };

  const handleHeaderChange = (colIndex: number, value: string) => {
    const updatedHeaders = headers.map((h, idx) => (idx === colIndex ? value : h));
    onChange(updatedHeaders, rows);
  };

  const addRow = () => {
    const newRow = new Array(headers.length > 0 ? headers.length : 1).fill('');
    onChange(headers.length > 0 ? headers : ['Column 1'], [...rows, newRow]);
  };

  const deleteRow = (rowIndex: number) => {
    const updatedRows = rows.filter((_, idx) => idx !== rowIndex);
    onChange(headers, updatedRows);
  };

  const addColumn = () => {
    const newColName = `Col ${headers.length + 1}`;
    const newHeaders = [...headers, newColName];
    const newRows = rows.map((r) => [...r, '']);
    onChange(newHeaders, newRows);
  };

  const deleteColumn = (colIndex: number) => {
    if (headers.length <= 1) return;
    const newHeaders = headers.filter((_, idx) => idx !== colIndex);
    const newRows = rows.map((r) => r.filter((_, idx) => idx !== colIndex));
    onChange(newHeaders, newRows);
  };

  const cleanCellText = (text: string): string => {
    if (!text) return '';
    let s = text;
    // 1. Commas, colons, semicolons
    s = s.replace(/,([^\s0-9])/g, ', $1');
    s = s.replace(/([A-Za-z0-9]):([^\s/0-9])/g, '$1: $2');
    s = s.replace(/;([^\s])/g, '; $1');
    // 2. Parentheses
    s = s.replace(/\)([\w(])/g, ') $1');
    s = s.replace(/([A-Za-z0-9])\(/g, '$1 (');
    // 3. Hyphen spacing
    s = s.replace(/([A-Za-z])- ([A-Za-z])/g, '$1-$2');
    // 4. camelCase
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    // 5. Digit + unit
    s = s.replace(/([0-9])([A-Za-z]{2,})/g, '$1 $2');
    s = s.replace(/([0-9]{3,})([a-zA-Z])/g, '$1 $2');
    // 6. Collapse spaces
    return s.replace(/\s+/g, ' ').trim();
  };

  const handleAutoFormatSpacing = () => {
    const formattedHeaders = headers.map((h) => cleanCellText(h));
    const formattedRows = rows.map((r) => r.map((c) => cleanCellText(c)));
    onChange(formattedHeaders, formattedRows);
    setFormatted(true);
    setTimeout(() => setFormatted(false), 2000);
  };

  const copyAsTsv = async () => {
    try {
      const headerLine = headers.join('\t');
      const rowLines = rows.map((r) => r.join('\t')).join('\n');
      const tsvContent = `${headerLine}\n${rowLines}`;
      await navigator.clipboard.writeText(tsvContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full space-y-2.5"
    >
      {/* Top Mini Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono font-medium text-zinc-500 flex items-center space-x-1.5">
            <Columns className="w-3 h-3 text-zinc-400" />
            <span>{headers.length} cols</span>
            <span>•</span>
            <Rows className="w-3 h-3 text-zinc-400" />
            <span>{rows.length} rows</span>
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={handleAutoFormatSpacing}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              formatted
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 shadow-2xs'
            }`}
            title="Auto-format and fix missing spaces around punctuation and keywords"
          >
            {formatted ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Formatted!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-zinc-500" />
                <span>Clean Spacing</span>
              </>
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={copyAsTsv}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              copied
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 shadow-2xs'
            }`}
            title="Copy as TSV (paste directly with Ctrl+V into Excel)"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-zinc-400" />
                <span>Copy (Ctrl+V)</span>
              </>
            )}
          </motion.button>

          <button
            type="button"
            onClick={addColumn}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-zinc-400" />
            <span>Col</span>
          </button>

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Row</span>
          </button>
        </div>
      </div>

      {/* Modern Spreadsheet Table */}
      <div className="overflow-hidden border border-zinc-200/90 rounded-2xl shadow-xs bg-white">
        <div className="overflow-x-auto max-h-[500px] divide-y divide-zinc-200/70">
          <table className="w-full border-collapse text-xs text-left">
            {/* Header */}
            <thead className="bg-zinc-50/90 backdrop-blur-xs sticky top-0 z-10 select-none">
              <tr>
                <th className="w-10 px-2.5 py-2 text-center font-mono text-[10px] font-semibold text-zinc-400 border-r border-zinc-200/80 bg-zinc-100/60">
                  #
                </th>
                {headers.map((header, colIdx) => (
                  <th
                    key={colIdx}
                    className="group relative px-2 py-1.5 border-r border-zinc-200/80 last:border-r-0 min-w-[130px]"
                  >
                    <div className="flex flex-col space-y-0.5">
                      <div className="flex items-center justify-between text-[9px] font-mono font-medium text-zinc-400">
                        <span>{getColumnLetter(colIdx)}</span>
                        {headers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteColumn(colIdx)}
                            className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-500 transition-opacity p-0.5"
                            title="Delete column"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={header}
                        onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                        placeholder={`Col ${colIdx + 1}`}
                        className="font-semibold text-zinc-900 bg-transparent w-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-950 rounded px-1 py-0.5 transition-all text-xs"
                      />
                    </div>
                  </th>
                ))}
                <th className="w-10 px-2 py-1.5 text-center text-zinc-400 bg-zinc-50/90 text-[10px]">
                  Del
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-zinc-100 bg-white font-sans">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={headers.length + 2}
                    className="py-10 text-center text-zinc-400 text-xs"
                  >
                    Table is empty. Click &ldquo;Add Row&rdquo; to insert entries.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="group hover:bg-zinc-50/60 transition-colors"
                  >
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-400 border-r border-zinc-100 bg-zinc-50/30 group-hover:bg-zinc-100/50">
                      {rowIdx + 1}
                    </td>

                    {headers.map((_, colIdx) => {
                      const cellValue = row[colIdx] ?? '';
                      return (
                        <td
                          key={colIdx}
                          className="p-0.5 border-r border-zinc-100 last:border-r-0 min-w-[130px]"
                        >
                          <input
                            type="text"
                            value={cellValue}
                            onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                            placeholder="—"
                            className="w-full text-zinc-800 bg-transparent focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-950 rounded px-2 py-1 text-xs transition-all"
                          />
                        </td>
                      );
                    })}

                    <td className="px-1.5 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => deleteRow(rowIdx)}
                        className="opacity-20 group-hover:opacity-100 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-all cursor-pointer"
                        title="Delete row"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};