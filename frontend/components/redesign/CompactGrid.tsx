'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Columns,
  Rows,
  Sparkles,
  FileSpreadsheet,
  ArrowDownToLine,
  Split,
} from 'lucide-react';

interface CompactGridProps {
  tables: Array<{
    id: number | string;
    title: string;
    headers: string[];
    rows: string[][];
  }>;
  activeTableIndex: number;
  onSelectTable: (index: number) => void;
  headers: string[];
  rows: string[][];
  onChange: (headers: string[], rows: string[][]) => void;
  isMerged?: boolean;
  onMergeTables?: () => void;
  onUnmergeTables?: () => void;
}

export const CompactGrid: React.FC<CompactGridProps> = ({
  tables,
  activeTableIndex,
  onSelectTable,
  headers,
  rows,
  onChange,
  isMerged = false,
  onMergeTables,
  onUnmergeTables,
}) => {
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
    s = s.replace(/,([^\s0-9])/g, ', $1');
    s = s.replace(/([A-Za-z0-9]):([^\s/0-9])/g, '$1: $2');
    s = s.replace(/;([^\s])/g, '; $1');
    s = s.replace(/\)([\w(])/g, ') $1');
    s = s.replace(/([A-Za-z0-9])\(/g, '$1 (');
    s = s.replace(/([A-Za-z])- ([A-Za-z])/g, '$1-$2');
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    s = s.replace(/([0-9])([A-Za-z]{2,})/g, '$1 $2');
    s = s.replace(/([0-9]{3,})([a-zA-Z])/g, '$1 $2');
    s = s.replace(/([$€£₹¥])\s+([0-9])/g, '$1$2');
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
      // Ignore clipboard error
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-zinc-200 rounded-md overflow-hidden text-xs">
      {/* 1. Multi-Table Tab Bar (Excel Workbook Style) */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-2 h-9 select-none">
        <div className="flex items-center space-x-1 overflow-x-auto">
          {tables.map((tbl, idx) => (
            <button
              key={tbl.id}
              type="button"
              onClick={() => onSelectTable(idx)}
              className={`px-3 py-1 text-xs font-medium rounded-t border-t border-x transition-colors cursor-pointer ${
                activeTableIndex === idx
                  ? 'bg-white text-zinc-900 border-zinc-300 shadow-2xs font-semibold'
                  : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              {tbl.title || `Table ${idx + 1}`}
            </button>
          ))}
          {tables.length === 0 && (
            <span className="px-2 text-zinc-400 text-xs italic">Sheet 1</span>
          )}

          {/* Merge / Separate Action Button in Tab Bar */}
          {tables.length > 1 && !isMerged && onMergeTables && (
            <button
              type="button"
              onClick={onMergeTables}
              className="h-6 px-2 text-[11px] font-medium rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1 ml-2 transition-colors cursor-pointer shrink-0"
              title="Merge all tables down into 1 with clean spacing"
            >
              <ArrowDownToLine className="w-3 h-3 text-emerald-600" />
              <span>Merge All ({tables.length})</span>
            </button>
          )}

          {isMerged && onUnmergeTables && (
            <button
              type="button"
              onClick={onUnmergeTables}
              className="h-6 px-2 text-[11px] font-medium rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 flex items-center gap-1 ml-2 transition-colors cursor-pointer shrink-0"
              title="Separate back into individual tables"
            >
              <Split className="w-3 h-3 text-zinc-500" />
              <span>Separate Tables</span>
            </button>
          )}
        </div>

        {/* Dimension Counters */}
        <div className="flex items-center space-x-2 text-[11px] font-mono text-zinc-400 shrink-0">
          <span>{headers.length} cols</span>
          <span>×</span>
          <span>{rows.length} rows</span>
        </div>
      </div>

      {/* 2. Grid Actions Mini Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 bg-white gap-2">
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={addColumn}
            className="h-7 px-2.5 rounded border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-zinc-500" />
            <span>Col</span>
          </button>
          <button
            type="button"
            onClick={addRow}
            className="h-7 px-2.5 rounded border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-zinc-500" />
            <span>Row</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={handleAutoFormatSpacing}
            className={`h-7 px-2.5 rounded border text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer ${formatted
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
              }`}
            title="Auto-format and correct missing space delimiters"
          >
            {formatted ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Formatted</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-zinc-500" />
                <span>Clean Text</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={copyAsTsv}
            className={`h-7 px-2.5 rounded border text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer ${copied
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
              }`}
            title="Copy entire table to clipboard (Excel / Sheets Ctrl+V ready)"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-zinc-500" />
                <span>Copy TSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. High-Density Spreadsheet Table */}
      <div className="flex-1 overflow-auto min-h-[380px] max-h-[calc(100vh-220px)] bg-zinc-50/20">
        <table className="w-full border-collapse text-left text-xs font-sans">
          {/* Table Column Headers */}
          <thead className="bg-zinc-100 border-b border-zinc-200 sticky top-0 z-10 select-none">
            <tr>
              {/* Row index header corner */}
              <th className="w-10 px-2 py-1 text-center font-mono text-[11px] font-semibold text-zinc-400 border-r border-zinc-200 bg-zinc-100">
                #
              </th>
              {headers.map((header, colIdx) => (
                <th
                  key={colIdx}
                  className="group relative px-2 py-1 border-r border-zinc-200 min-w-[120px] bg-zinc-100"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-0.5">
                    <span>{getColumnLetter(colIdx)}</span>
                    {headers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteColumn(colIdx)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-600 transition-opacity p-0.5"
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
                    className="w-full font-semibold text-zinc-900 bg-transparent px-1 py-0.5 rounded focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-xs border border-transparent hover:border-zinc-300"
                  />
                </th>
              ))}
              <th className="w-8 px-1 py-1 text-center text-zinc-400 bg-zinc-100 text-[10px]">
                Del
              </th>
            </tr>
          </thead>

          {/* Table Data Rows */}
          <tbody className="divide-y divide-zinc-200 bg-white font-sans">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 2}
                  className="py-12 text-center text-zinc-400 text-xs italic"
                >
                  No table rows detected. Click &quot;Add Row&quot; or re-extract document.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-blue-50/20 transition-colors group">
                  {/* Row Number */}
                  <td className="w-10 px-2 py-1 text-center font-mono text-[11px] text-zinc-400 border-r border-zinc-200 bg-zinc-50/40 select-none">
                    {rowIdx + 1}
                  </td>

                  {/* Cell Inputs */}
                  {row.map((cell, colIdx) => (
                    <td
                      key={colIdx}
                      className="px-1 py-0.5 border-r border-zinc-200 focus-within:bg-blue-50/30"
                    >
                      <input
                        type="text"
                        value={cell}
                        onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                        className="w-full text-zinc-800 bg-transparent px-1.5 py-0.5 rounded focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 text-xs border border-transparent hover:border-zinc-200"
                      />
                    </td>
                  ))}

                  {/* Delete Row Button */}
                  <td className="w-8 px-1 py-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => deleteRow(rowIdx)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-600 p-0.5 rounded transition-opacity"
                      title="Delete row"
                    >
                      <Trash2 className="w-3 h-3 mx-auto" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
