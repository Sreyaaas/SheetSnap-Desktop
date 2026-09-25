import { PDFDocument } from 'pdf-lib';
import zlib from 'zlib';

export interface PdfTrimResult {
  buffer: Buffer;
  originalPageCount: number;
  extractedPageCount: number;
  wasTrimmed: boolean;
}

/**
 * Specifically detects if a document is a Zamil Purchase Order
 * (matching the layout with Zamil Offshore / Zamil Group + "PURCHASE ORDER" / "PO NUMBER").
 * Excludes Oracle Requisitions and general correspondence that merely mention Zamil.
 */
export function isZamilPurchaseOrder(pdfBuffer: Buffer, filename: string = ''): boolean {
  // 1. Filename heuristic: must indicate Zamil + PO/Purchase, and not Requisition/Oracle
  if (filename) {
    const isPoFilename = /(z[a]{1,2}mil.*(po|purchase)|(po|purchase).*z[a]{1,2}mil)/i.test(filename);
    const isOracleReq = /(requisition|oracle)/i.test(filename);
    if (isPoFilename && !isOracleReq) return true;
  }

  const rawStr = pdfBuffer.toString('latin1');
  const zamilRegex = /z[a]{1,2}mil/i;
  const poTitleRegex = /\bpurchase\s*order\b/i;
  const poNumberRegex = /\bpo\s*number\b/i;
  const zamilPoMarkersRegex = /\b(prno|req-for|promised\s*date|notes\s*to\s*vendor|offshore\s*services|cazamil|mod\s*-\s*purchaser)\b/i;
  const requisitionRegex = /\brequisition\b/i;

  const evaluatesAsZamilPo = (text: string): boolean => {
    // If it explicitly states Requisition and lacks "PURCHASE ORDER", it is an Oracle/General Requisition
    if (requisitionRegex.test(text) && !poTitleRegex.test(text)) {
      return false;
    }

    const hasZamil = zamilRegex.test(text);
    const hasPoTitle = poTitleRegex.test(text);
    const hasPoNumber = poNumberRegex.test(text);
    const hasMarkers = zamilPoMarkersRegex.test(text);

    // Must have Zamil AND (PURCHASE ORDER title or PO NUMBER) AND at least one specific PO marker
    return hasZamil && (hasPoTitle || hasPoNumber) && (hasPoTitle || hasMarkers);
  };

  // 2. Direct match in uncompressed streams or metadata (bound to first 2MB)
  const inspectionSlice = rawStr.length > 2 * 1024 * 1024 ? rawStr.slice(0, 2 * 1024 * 1024) : rawStr;
  if (evaluatesAsZamilPo(inspectionSlice)) {
    return true;
  }

  // 3. Fast stream decompression check across page 1-2 streams (first 8 streams)
  // Hardened against Zip/Decompression bombs (CWE-409) with strict maxOutputLength: 512KB
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  let count = 0;
  let accumulatedText = '';
  const MAX_ACCUMULATED_CHARS = 1024 * 1024; // 1MB text limit

  while ((match = streamRegex.exec(inspectionSlice)) !== null && count < 8) {
    count++;
    try {
      const streamBuf = Buffer.from(match[1], 'latin1');
      // Limit decompressed chunk to 512KB to defuse decompression bombs
      const decompressed = zlib
        .inflateSync(streamBuf, { maxOutputLength: 512 * 1024 })
        .toString('latin1');
      
      accumulatedText += ' ' + decompressed;
      if (accumulatedText.length > MAX_ACCUMULATED_CHARS) {
        accumulatedText = accumulatedText.slice(0, MAX_ACCUMULATED_CHARS);
      }
      
      if (evaluatesAsZamilPo(accumulatedText)) {
        return true;
      }
    } catch {
      // Non-zlib, image stream, or decompression bomb blocked; continue safely
    }
  }

  return evaluatesAsZamilPo(accumulatedText);
}

/**
 * Inspects a PDF buffer. If it contains more than `maxPages` (default 20),
 * slices and returns a new buffer containing only the first `maxPages`.
 */
export async function limitPdfPages(
  pdfBuffer: Buffer,
  maxPages: number = 20
): Promise<PdfTrimResult> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const originalPageCount = pdfDoc.getPageCount();

    if (originalPageCount <= maxPages) {
      return {
        buffer: pdfBuffer,
        originalPageCount,
        extractedPageCount: originalPageCount,
        wasTrimmed: false,
      };
    }

    // Create trimmed PDF with first `maxPages`
    const subDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: maxPages }, (_, i) => i);
    const copiedPages = await subDoc.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach((page) => subDoc.addPage(page));

    const trimmedBytes = await subDoc.save();
    return {
      buffer: Buffer.from(trimmedBytes),
      originalPageCount,
      extractedPageCount: maxPages,
      wasTrimmed: true,
    };
  } catch (err) {
    console.warn('[PDF Trimmer] Warning: Failed to parse PDF pages, falling back to raw buffer:', err);
    return {
      buffer: pdfBuffer,
      originalPageCount: 0,
      extractedPageCount: 0,
      wasTrimmed: false,
    };
  }
}
