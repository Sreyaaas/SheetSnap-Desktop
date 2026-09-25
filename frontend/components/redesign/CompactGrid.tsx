'use client';

import React, { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Check,
  ArrowDownToLine,
  Split,
  ChevronLeft,
  ChevronRight,
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
  const tabBarRef = useRef<HTMLDivElement>(null);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabBarRef.current) {
      const offset = direction === 'left' ? -180 : 180;
      tabBarRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const handleTabsWheel = (e: React.WheelEvent) => {
    if (tabBarRef.current && e.deltaY !== 0) {
      tabBarRef.current.scrollLeft += e.deltaY;
    }
  };

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
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-2 h-9 select-none gap-2">
        {/* Left: Scrollable Table Tabs with Left/Right Nav Arrows */}
        <div className="flex items-center min-w-0 flex-1 overflow-hidden">
          {/* Scroll Left Button (shown if 5+ tables) */}
          {tables.length > 4 && (
            <button
              type="button"
              onClick={() => scrollTabs('left')}
              className="h-6 w-5 shrink-0 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/70 rounded cursor-pointer transition-colors mr-1"
              title="Scroll tables left"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Scrollable Tabs */}
          <div
            ref={tabBarRef}
            onWheel={handleTabsWheel}
            className="flex items-center space-x-1 overflow-x-auto scroll-smooth py-0.5"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {tables.map((tbl, idx) => (
              <button
                key={tbl.id}
                type="button"
                onClick={() => onSelectTable(idx)}
                className={`px-3 py-1 text-xs font-medium rounded-t border-t border-x transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
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
          </div>

          {/* Scroll Right Button (shown if 5+ tables) */}
          {tables.length > 4 && (
            <button
              type="button"
              onClick={() => scrollTabs('right')}
              className="h-6 w-5 shrink-0 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/70 rounded cursor-pointer transition-colors ml-1"
              title="Scroll tables right"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right: Pinned Actions (Merge All / Separate Tables + Dimension Counters) ALWAYS VISIBLE */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Merge / Separate Action Button: Pinned to the right so it NEVER gets pushed off-screen */}
          {tables.length > 1 && !isMerged && onMergeTables && (
            <button
              type="button"
              onClick={onMergeTables}
              className="h-6 px-2.5 text-[11px] font-medium rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
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
              className="h-6 px-2.5 text-[11px] font-medium rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
              title="Separate back into individual tables"
            >
              <Split className="w-3 h-3 text-zinc-500" />
              <span>Separate Tables</span>
            </button>
          )}

          {/* Dimension Counters */}
          <div className="hidden sm:flex items-center space-x-1.5 text-[11px] font-mono text-zinc-400 shrink-0 pl-1 border-l border-zinc-200">
            <span>{headers.length} cols</span>
            <span>×</span>
            <span>{rows.length} rows</span>
          </div>
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
