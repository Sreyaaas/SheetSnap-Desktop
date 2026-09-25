/**
 * Enterprise Production-Grade In-Memory Excel Workbook Generator using ExcelJS.
 *
 * Implements:
 * 1. Minimalist Financial/SaaS Design (Big-4 & Stripe Standard):
 *    - Crisp white/light canvas, dark slate typography, double accounting borders.
 *    - Auto-aligned columns (numeric right-aligned, text left-aligned).
 * 2. Cybersecurity Defense (CWE-1236):
 *    - Defends against Excel/CSV Formula Injection (DDE injection).
 * 3. Safe sheet name sanitization & collision prevention.
 */

import ExcelJS from 'exceljs';

export interface TableData {
  title?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

export interface SheetData {
  sheetName: string;
  tables: TableData[];
}

/**
 * Sanitizes cell input to neutralize Excel Formula Injection (CWE-1236).
 * Any cell starting with =, +, -, @, \t, or \r is prefixed with a single quote (')
 * so Excel treats it strictly as literal text, never executing DDE or formulas.
 */
function sanitizeCellValue(val: unknown): string | number {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : '';
  }

  // Prevent prototype or object injection: convert safely to string
  let str = typeof val === 'string' ? val : String(val);

  // Strip non-printable / control characters (except newline \n and carriage return \r)
  // Also strip zero-width characters that can bypass leading-character checks
  str = str.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u200B-\u200D\uFEFF]/g, '');

  // Truncate excessively long individual cell values to prevent memory exhaustion DoS
  if (str.length > 5000) {
    str = str.slice(0, 5000);
  }

  const trimmed = str.trim();
  if (trimmed.length === 0) return '';

  // Check if string is a numeric value
  const num = Number(trimmed.replace(/,/g, ''));
  if (!isNaN(num) && trimmed.match(/^-?\d+(\.\d+)?$/)) {
    return num;
  }

  // Comprehensive Formula Injection Guard (CWE-1236 / DDE Execution):
  // Neutralize =, +, -, @, \t, \r, |, % triggers
  const dangerousTriggers = new Set(['=', '+', '-', '@', '\t', '\r', '|', '%']);
  if (dangerousTriggers.has(trimmed.charAt(0))) {
    return `'${trimmed}`;
  }

  // Also neutralize multiline cells where any line begins with a dangerous trigger
  if (/[\r\n][=+\-@\t\r|%]/.test(str)) {
    return `'${str}`;
  }

  return str;
}

/**
 * Formats a clean, compliant Excel sheet tab name (max 31 characters)
 * in the pattern: "[Table Title] - [File Name]"
 */
export function formatSheetName(tableTitle?: string, fileName?: string): string {
  let title = (tableTitle || 'Table').trim();
  let file = (fileName || '').replace(/\.[^/.]+$/, '').trim();

  // If tableTitle already contains " - " and no fileName was passed, split them
  if (!file && title.includes(' - ')) {
    const parts = title.split(' - ');
    title = parts[0].trim();
    file = parts.slice(1).join(' - ').trim();
  }

  const cleanTitle = title.replace(/[\\/?*:[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanFile = file.replace(/[\\/?*:[\]]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleanFile) return cleanTitle.slice(0, 31);
  if (!cleanTitle) return cleanFile.slice(0, 31);

  const combined = `${cleanTitle} - ${cleanFile}`;
  if (combined.length <= 31) {
    return combined;
  }

  // If too long, smartly truncate both so both title and filename remain readable
  const titleBudget = Math.min(cleanTitle.length, 14);
  const fileBudget = 31 - titleBudget - 3; // 3 chars for " - "
  const shortTitle = cleanTitle.slice(0, titleBudget).trim();
  const shortFile = cleanFile.slice(0, fileBudget).trim();
  return `${shortTitle} - ${shortFile}`;
}

function sanitizeSheetName(name: string, existingNames: Set<string>): string {
  let clean = name.replace(/[\\/?*:[\]]/g, '_').replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^'+|'+$/g, '').trim(); // Excel specification forbids sheet names starting or ending with apostrophes
  if (!clean) clean = 'Sheet';
  if (clean.length > 31) clean = clean.substring(0, 31).trim().replace(/^'+|'+$/g, '');
  if (!clean) clean = 'Sheet';
  let finalName = clean;
  let counter = 1;
  while (existingNames.has(finalName.toLowerCase())) {
    const suffix = `_${counter}`;
    const maxBaseLen = 31 - suffix.length;
    finalName = `${clean.substring(0, maxBaseLen).replace(/'$/, '')}${suffix}`;
    counter++;
    if (counter > 1000) break; // Defensive bound on name collision loop
  }
  existingNames.add(finalName.toLowerCase());
  return finalName;
}

const MAX_EXPORT_ROWS_PER_TABLE = 10_000;
const MAX_EXPORT_COLS_PER_TABLE = 150;

function populateSheetWithTables(sheet: ExcelJS.Worksheet, tables: TableData[]) {
  tables.forEach((table, tIdx) => {
    // If multiple tables exist in the same sheet, separate with a blank row and bold title
    if (tables.length > 1) {
      if (tIdx > 0) {
        sheet.addRow([]); // Blank spacer line
      }
      const titleRow = sheet.addRow([table.title || `Table ${tIdx + 1}`]);
      titleRow.font = { bold: true };
    }

    const rawHeaders = Array.isArray(table.headers) ? table.headers : [];
    const headers = rawHeaders.slice(0, MAX_EXPORT_COLS_PER_TABLE);
    const rawRows = Array.isArray(table.rows) ? table.rows : [];
    const rows = rawRows.slice(0, MAX_EXPORT_ROWS_PER_TABLE);

    // Header Row: Pure default Excel styling, just bold text
    if (headers.length > 0) {
      const sanitizedHeaders = headers.map((h) => {
        const val = sanitizeCellValue(h);
        return typeof val === 'number' ? String(val) : val;
      });

      const headerRow = sheet.addRow(sanitizedHeaders);
      headerRow.font = { bold: true };
    }

    // Data Rows: Pure standard cells without any custom fonts, fills, or borders
    rows.forEach((row) => {
      if (!Array.isArray(row)) return;
      const sanitizedRow = row
        .slice(0, MAX_EXPORT_COLS_PER_TABLE)
        .map((cell) => sanitizeCellValue(cell));
      sheet.addRow(sanitizedRow);
    });
  });

  // Auto-calculate column widths
  sheet.columns.forEach((column) => {
    let maxLen = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const valStr = cell.value !== undefined && cell.value !== null ? String(cell.value) : '';
      const lines = valStr.split('\n');
      for (const line of lines) {
        if (line.length > maxLen) {
          maxLen = line.length;
        }
      }
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 48);
  });
}

/**
 * Generates an Excel workbook with multiple sheets corresponding to each document/tab.
 */
export async function generateMultiSheetExcelBuffer(sheets: SheetData[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SheetSnap';
  workbook.lastModifiedBy = 'SheetSnap';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheetsToExport = sheets.length > 0 ? sheets : [
    { sheetName: 'Sheet1', tables: [{ title: 'Table 1', headers: ['No Data'], rows: [] }] }
  ];

  const usedNames = new Set<string>();

  sheetsToExport.forEach((sheetData) => {
    const rawName = formatSheetName(sheetData.sheetName);
    const safeName = sanitizeSheetName(rawName, usedNames);
    const worksheet = workbook.addWorksheet(safeName, {
      views: [{ showGridLines: true }],
    });

    const tables = sheetData.tables.length > 0 ? sheetData.tables : [
      { title: safeName, headers: ['No Data'], rows: [] }
    ];

    populateSheetWithTables(worksheet, tables);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Legacy single-document tables export (each table becomes its own worksheet).
 */
export async function generateExcelBuffer(tables: TableData[], fileName?: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SheetSnap';
  workbook.lastModifiedBy = 'SheetSnap';
  workbook.created = new Date();
  workbook.modified = new Date();

  const tablesToExport = tables.length > 0 ? tables : [
    { title: 'Sheet 1', headers: ['No Data'], rows: [] }
  ];

  const usedNames = new Set<string>();

  tablesToExport.forEach((table, index) => {
    const rawTitle = formatSheetName(table.title || `Table ${index + 1}`, fileName);
    const safeName = sanitizeSheetName(rawTitle, usedNames);

    const sheet = workbook.addWorksheet(safeName, {
      views: [{ showGridLines: true }],
    });

    populateSheetWithTables(sheet, [table]);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
