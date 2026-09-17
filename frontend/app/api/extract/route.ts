import { NextRequest, NextResponse } from 'next/server';
import { extractTablesWithGemini, isGeminiConfigured } from '@/lib/gemini';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

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

    // 5. MIME Type Whitelist Guardrail
    let mimeType = file.type || 'application/octet-stream';
    const filename = file.name.toLowerCase();

    if (filename.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (filename.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (filename.endsWith('.webp')) {
      mimeType = 'image/webp';
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          error: 'Unsupported Media Type',
          detail: `File type '${mimeType}' is not supported. Please upload a PDF, PNG, JPG, or WebP document.`,
        },
        { status: 415 }
      );
    }

    // 6. In-Memory Buffer Extraction
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await extractTablesWithGemini(buffer, mimeType);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'X-RateLimit-Limit': String(rateLimit.limit),
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      },
    });
  } catch (err: unknown) {
    console.error('Extraction error:', err);
    const detail = err instanceof Error ? err.message : 'An unexpected error occurred during processing.';
    return NextResponse.json(
      { error: 'Internal Server Error', detail },
      { status: 500 }
    );
  }
}
