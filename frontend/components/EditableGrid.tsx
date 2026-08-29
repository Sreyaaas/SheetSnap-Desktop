'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Copy, Check, Table2, Columns, Rows } from 'lucide-react';

interface EditableGridProps {
  headers: string[];
  rows: string[][];
  onChange: (headers: string[], rows: string[][]) => void;
}

export const EditableGrid: React.FC<EditableGridProps> = ({ headers, rows, onChange }) => {
  const [copied, setCopied] = useState(false);

  // Convert column index to Excel-style letter (0 -> A, 1 -> B, 26 -> AA...)
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
    const newColName = `Column ${headers.length + 1}`;
    const newHeaders = [...headers, newColName];
    const newRows = rows.map((r) => [...r, '']);
    onChange(newHeaders, newRows);
  };

  const deleteColumn = (colIndex: number) => {
    if (headers.length <= 1) return; // Keep at least one column
    const newHeaders = headers.filter((_, idx) => idx !== colIndex);
    const newRows = rows.map((r) => r.filter((_, idx) => idx !== colIndex));
    onChange(newHeaders, newRows);
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
    <div className="w-full space-y-3">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-slate-900 text-white shadow-xs">
            <Table2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Extracted Table
            </h3>
            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <span className="flex items-center space-x-1">
                <Columns className="w-3 h-3" />
                <span>{headers.length} cols</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <Rows className="w-3 h-3" />
                <span>{rows.length} rows</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={copyAsTsv}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Copy as TSV (pasteable directly into Excel or Google Sheets)"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Data</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={addColumn}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>Add Column</span>
          </button>

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>
        </div>
      </div>

      {/* Spreadsheet Container */}
      <div className="overflow-hidden border border-slate-200/90 rounded-2xl shadow-xs bg-white">
        <div className="overflow-x-auto max-h-[550px] divide-y divide-slate-200">
          <table className="w-full border-collapse text-xs text-left">
            {/* Header with Column Lettering & Editable Titles */}
            <thead className="bg-slate-50/90 backdrop-blur-xs sticky top-0 z-10 select-none">
              <tr>
                {/* Index Column */}
                <th className="w-12 px-3 py-2.5 text-center font-mono text-[11px] font-semibold text-slate-400 border-r border-slate-200 bg-slate-100/70">
                  #
                </th>
                {headers.map((header, colIdx) => (
                  <th
                    key={colIdx}
                    className="group relative px-2.5 py-2 border-r border-slate-200 last:border-r-0 min-w-[140px]"
                  >
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono font-medium text-slate-400">
                        <span>{getColumnLetter(colIdx)}</span>
                        {headers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteColumn(colIdx)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity p-0.5"
                            title="Delete column"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={header}
                        onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                        placeholder={`Column ${colIdx + 1}`}
                        className="font-semibold text-slate-900 bg-transparent w-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-900 rounded px-1.5 py-1 transition-all"
                      />
                    </div>
                  </th>
                ))}
                <th className="w-12 px-2 py-2 text-center text-slate-400 bg-slate-50/90">
                  Action
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={headers.length + 2}
                    className="py-12 text-center text-slate-400 text-xs"
                  >
                    No rows in this table. Click &ldquo;Add Row&rdquo; to insert data.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="group hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Row Index */}
                    <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400 border-r border-slate-100 bg-slate-50/40 group-hover:bg-slate-100/60 font-medium">
                      {rowIdx + 1}
                    </td>

                    {/* Cells */}
                    {headers.map((_, colIdx) => {
                      const cellValue = row[colIdx] ?? '';
                      return (
                        <td
                          key={colIdx}
                          className="p-1 border-r border-slate-100 last:border-r-0 min-w-[140px]"
                        >
                          <input
                            type="text"
                            value={cellValue}
                            onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                            placeholder="—"
                            className="w-full text-slate-800 bg-transparent focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-900 focus:shadow-2xs rounded-md px-2 py-1.5 text-xs transition-all"
                          />
                        </td>
                      );
                    })}

                    {/* Delete Row Button */}
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => deleteRow(rowIdx)}
                        className="opacity-40 group-hover:opacity-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="Delete row"
                        aria-label={`Delete row ${rowIdx + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};