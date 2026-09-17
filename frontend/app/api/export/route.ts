import { NextRequest, NextResponse } from 'next/server';
import { generateExcelBuffer, TableData } from '@/lib/excel-generator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let tables: TableData[] = [];

    if (Array.isArray(body.tables)) {
      tables = body.tables;
    } else if (Array.isArray(body.headers) && Array.isArray(body.rows)) {
      tables = [
        {
          title: body.title || 'Table 1',
          headers: body.headers,
          rows: body.rows,
        },
      ];
    }

    if (tables.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', detail: 'No table data provided for export.' },
        { status: 400 }
      );
    }

    // Generate Excel Buffer in-memory
    const excelBuffer = await generateExcelBuffer(tables);

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
    const detail = err instanceof Error ? err.message : 'Failed to generate Excel file.';
    return NextResponse.json({ error: 'Internal Server Error', detail }, { status: 500 });
  }
}
