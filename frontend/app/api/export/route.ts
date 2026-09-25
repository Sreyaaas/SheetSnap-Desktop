import { NextRequest, NextResponse } from 'next/server';
import {
  generateExcelBuffer,
  generateMultiSheetExcelBuffer,
  TableData,
  SheetData,
} from '@/lib/excel-generator';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

const MAX_EXPORT_SHEETS = 50;
const MAX_EXPORT_TABLES_PER_SHEET = 25;

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting Shield (30 exports per minute per IP)
    const clientIp = getClientIp(req.headers);
    const rateLimit = checkRateLimit(clientIp, {
      maxRequests: 30,
      windowMs: 60_000,
      banDurationMs: 120_000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          detail: `Export rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds before exporting again.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds || 60),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const body = await req.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Bad Request', detail: 'Invalid JSON payload structure.' },
        { status: 400 }
      );
    }

    let excelBuffer: Buffer;

    // Check if multi-sheet request
    if (Array.isArray(body.sheets) && body.sheets.length > 0) {
      if (body.sheets.length > MAX_EXPORT_SHEETS) {
        return NextResponse.json(
          {
            error: 'Payload Too Large',
            detail: `Number of sheets (${body.sheets.length}) exceeds the maximum allowed limit of ${MAX_EXPORT_SHEETS}.`,
          },
          { status: 413 }
        );
      }

      const sheets: SheetData[] = body.sheets.slice(0, MAX_EXPORT_SHEETS).map((s: any) => ({
        sheetName: typeof s?.sheetName === 'string' ? s.sheetName.slice(0, 100) : 'Sheet',
        tables: Array.isArray(s?.tables) ? s.tables.slice(0, MAX_EXPORT_TABLES_PER_SHEET) : [],
      }));

      excelBuffer = await generateMultiSheetExcelBuffer(sheets);
    } else {
      let tables: TableData[] = [];

      if (Array.isArray(body.tables)) {
        if (body.tables.length > MAX_EXPORT_TABLES_PER_SHEET * 2) {
          return NextResponse.json(
            {
              error: 'Payload Too Large',
              detail: `Number of tables exceeds the maximum allowed limit.`,
            },
            { status: 413 }
          );
        }
        tables = body.tables.slice(0, MAX_EXPORT_TABLES_PER_SHEET * 2);
      } else if (Array.isArray(body.headers) && Array.isArray(body.rows)) {
        tables = [
          {
            title: typeof body.title === 'string' ? body.title.slice(0, 100) : 'Table 1',
            headers: body.headers,
            rows: body.rows,
          },
        ];
      }

      if (tables.length === 0) {
        return NextResponse.json(
          { error: 'Bad Request', detail: 'No table or sheet data provided for export.' },
          { status: 400 }
        );
      }

      const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 150) : undefined;
      excelBuffer = await generateExcelBuffer(tables, fileName);
    }

    const filename = `sheetsnap_export_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;

    return new Response(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(excelBuffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: unknown) {
    console.error('Export error:', err);
    // Sanitize error response: do not leak internal stack traces or paths
    return NextResponse.json(
      { error: 'Internal Server Error', detail: 'Failed to generate Excel file. Please try again.' },
      { status: 500 }
    );
  }
}
