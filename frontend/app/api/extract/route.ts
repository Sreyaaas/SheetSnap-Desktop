import { NextRequest, NextResponse } from 'next/server';
import { extractTablesWithGemini, isGeminiConfigured } from '@/lib/gemini';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { limitPdfPages, isZamilPurchaseOrder } from '@/lib/pdf-trimmer';

// Maximum allowed payload size: 10 Megabytes
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

export async function POST(req: NextRequest) {
  try {
    // 1. DDoS & Rate Limiting Guardrail
    const clientIp = getClientIp(req.headers);
    const rateLimit = checkRateLimit(clientIp, {
      maxRequests: 25, // 25 extractions per minute
      windowMs: 60_000,
      banDurationMs: 120_000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          detail: `Rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds before submitting again.`,
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

    // 2. Check Gemini Configuration
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        {
          error: 'Configuration Error',
          detail: 'GEMINI_API_KEY is not configured on the server. Please add your GEMINI_API_KEY.',
        },
        { status: 503 }
      );
    }

    // 3. Parse Multipart Form Data
    const formData = await req.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Bad Request', detail: 'No file uploaded. Please provide an image or PDF.' },
        { status: 400 }
      );
    }

    // 4. File Size Guardrail (Max 10MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: 'Payload Too Large',
          detail: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum limit of 10 MB.`,
        },
        { status: 413 }
      );
    }

    // 5. In-Memory Buffer Extraction
    const arrayBuffer = await file.arrayBuffer();
    const buffer: Buffer = Buffer.from(arrayBuffer);

    // 6. Magic Bytes Whitelist Guardrail (CWE-434 / Unrestricted File Upload)
    const magicMime = detectMagicMimeType(buffer);
    let mimeType = magicMime || file.type || 'application/octet-stream';
    const filename = file.name.toLowerCase();

    // Secondary extension check only if matches recognized format
    if (!magicMime) {
      if (filename.endsWith('.pdf')) {
        mimeType = 'application/pdf';
      } else if (filename.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (filename.endsWith('.webp')) {
        mimeType = 'image/webp';
      }
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType) || (!magicMime && !ALLOWED_MIME_TYPES.has(file.type))) {
      return NextResponse.json(
        {
          error: 'Unsupported Media Type',
          detail: 'File content signature does not match supported document types (PDF, PNG, JPG, or WebP).',
        },
        { status: 415 }
      );
    }

    let finalBuffer: Buffer = buffer;
    let pageNotice: string | undefined;

    if (mimeType === 'application/pdf') {
      // Specifically check if document is a Zamil Purchase Order
      const isZamilPo = isZamilPurchaseOrder(buffer, filename);
      const zamilMaxPages = parseInt(process.env.ZAMIL_MAX_PAGES || '8', 10);
      const targetPageLimit = isZamilPo ? zamilMaxPages : 20;

      const trimResult = await limitPdfPages(buffer, targetPageLimit);
      finalBuffer = trimResult.buffer;

      if (trimResult.wasTrimmed) {
        if (isZamilPo) {
          pageNotice = `Zamil Purchase Order detected (${trimResult.originalPageCount} pages). First ${targetPageLimit} pages extracted to capture line items and optimize token usage.`;
        } else {
          pageNotice = `Large document detected (${trimResult.originalPageCount} pages). First 20 pages extracted for speed and accuracy.`;
        }
      }
    }

    const sessionId = req.headers.get('x-session-id') || undefined;
    const result = await extractTablesWithGemini(
      finalBuffer,
      mimeType,
      undefined,
      file.name,
      sessionId
    );

    return NextResponse.json(
      {
        ...result,
        page_notice: pageNotice,
      },
      {
        status: 200,
        headers: {
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  } catch (err: unknown) {
    console.error('Extraction error:', err);
    // Sanitize error detail to prevent leaking internal provider credentials or paths (CWE-209)
    const isDev = process.env.NODE_ENV === 'development';
    const detail = isDev && err instanceof Error
      ? err.message
      : 'Document analysis failed. Please verify the document is a legible table document and try again.';

    return NextResponse.json(
      { error: 'Internal Server Error', detail },
      { status: 500 }
    );
  }
}

/**
 * Validates the true binary file signature (magic bytes) to defend against extension spoofing.
 */
function detectMagicMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // PDF: %PDF- (ISO 32000 allows %PDF- anywhere within first 1024 bytes)
  const headerSlice = buffer.subarray(0, Math.min(buffer.length, 1024));
  if (headerSlice.includes('%PDF-')) {
    return 'application/pdf';
  }

  // PNG: \x89PNG\r\n\x1a\n (0x89 0x50 0x4e 0x47)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // HEIC / HEIF: 'ftyp' at bytes 4-7 with brand 'heic', 'mif1', 'msf1', or 'hevc'
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 && // 'f'
    buffer[5] === 0x74 && // 't'
    buffer[6] === 0x79 && // 'y'
    buffer[7] === 0x70    // 'p'
  ) {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
  }

  return null;
}
