/**
 * Production-grade In-Memory Excel Workbook Generator using ExcelJS.
 *
 * Generates formatted multi-sheet Excel files with auto-column width,
 * clean typography, alternating zebra rows, and styling.
 */

import ExcelJS from 'exceljs';

export interface TableData {
  title?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

export async function generateExcelBuffer(tables: TableData[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SheetSnap';
  workbook.lastModifiedBy = 'SheetSnap';
  workbook.created = new Date();
  workbook.modified = new Date();

  const tablesToExport = tables.length > 0 ? tables : [
    { title: 'Sheet 1', headers: ['No Data'], rows: [] }
  ];

  tablesToExport.forEach((table, index) => {
    const rawTitle = table.title || `Table ${index + 1}`;
    // Sanitize sheet name: Excel allows max 31 chars, no invalid chars [\ / ? * : [ ]]
    const sanitizedTitle = rawTitle.replace(/[\\/?*:[\]]/g, '_').substring(0, 31) || `Sheet${index + 1}`;

    const sheet = workbook.addWorksheet(sanitizedTitle, {
      views: [{ showGridLines: true }],
    });

    const headers = table.headers || [];
    const rows = table.rows || [];

    // Header Row Styling
    if (headers.length > 0) {
      const headerRow = sheet.addRow(headers);
      headerRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Slate 800
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerRow.height = 26;
    }

    // Data Rows
    rows.forEach((row, rowIdx) => {
      const dataRow = sheet.addRow(row.map((cell) => (cell === null || cell === undefined ? '' : cell)));
      dataRow.font = { name: 'Segoe UI', size: 10 };
      dataRow.alignment = { vertical: 'middle' };
      dataRow.height = 20;

      // Alternating zebra striping
      if (rowIdx % 2 === 1) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }, // Slate 50
        };
      }

      // Thin borders for clean appearance
      dataRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
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
      column.width = Math.min(maxLen + 4, 45); // bounded width
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
