import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, getClientIp } from '../lib/rate-limiter.ts';
import { formatSheetName, generateExcelBuffer, generateMultiSheetExcelBuffer } from '../lib/excel-generator.ts';
import { isGeminiConfigured, getTelemetryAnalytics, resetTelemetryStats } from '../lib/gemini.ts';
import { isZamilPurchaseOrder } from '../lib/pdf-trimmer.ts';
import { createSessionToken, verifySessionToken, timingSafeCompare } from '../lib/auth.ts';

test('--- Rate Limiter & IP Shield Tests ---', async (t) => {
  await t.test('allows requests within limit and enforces block on burst limit', () => {
    const testIp = '192.168.10.50';
    // Clear / fresh IP
    const firstCheck = checkRateLimit(testIp, { maxRequests: 3, windowMs: 5000, banDurationMs: 10000 });
    assert.strictEqual(firstCheck.allowed, true);
    assert.strictEqual(firstCheck.remaining, 2);

    const secondCheck = checkRateLimit(testIp, { maxRequests: 3, windowMs: 5000, banDurationMs: 10000 });
    assert.strictEqual(secondCheck.allowed, true);
    assert.strictEqual(secondCheck.remaining, 1);

    const thirdCheck = checkRateLimit(testIp, { maxRequests: 3, windowMs: 5000, banDurationMs: 10000 });
    assert.strictEqual(thirdCheck.allowed, true);
    assert.strictEqual(thirdCheck.remaining, 0);

    // 4th request exceeds maxRequests -> should trigger ban
    const fourthCheck = checkRateLimit(testIp, { maxRequests: 3, windowMs: 5000, banDurationMs: 10000 });
    assert.strictEqual(fourthCheck.allowed, false);
    assert.ok(fourthCheck.retryAfterSeconds > 0);
  });

  await t.test('getClientIp sanitizes IPv4, IPv6, strips ports, and handles X-Forwarded-For chains', () => {
    const headers1 = new Headers({ 'x-forwarded-for': '203.0.113.195:8080, 70.41.3.18' });
    assert.strictEqual(getClientIp(headers1), '203.0.113.195');

    const headers2 = new Headers({ 'cf-connecting-ip': '198.51.100.4' });
    assert.strictEqual(getClientIp(headers2), '198.51.100.4');

    const headers3 = new Headers({ 'x-real-ip': '2001:db8::8a2e:370:7334' });
    assert.strictEqual(getClientIp(headers3), '2001:db8::8a2e:370:7334');

    // Untrusted garbage / script injection in header should safely fallback to default IP
    const headersMalicious = new Headers({ 'x-forwarded-for': '<script>alert(1)</script>' });
    assert.strictEqual(getClientIp(headersMalicious), '127.0.0.1');
  });
});

test('--- Excel Generator & Formula Injection (CWE-1236) Defenses ---', async (t) => {
  await t.test('formatSheetName cleans illegal characters and enforces 31 character limit', () => {
    const raw = 'Invoice / [2026] * Summary? : Test';
    const cleaned = formatSheetName(raw, 'MyDocument.pdf');
    assert.ok(cleaned.length <= 31);
    assert.ok(!/[\\/?*:[\]]/.test(cleaned));
  });

  await t.test('neutralizes formula injection triggers (=, +, -, @, |, %) in generated spreadsheet', async () => {
    const maliciousTables = [
      {
        title: 'SecurityTest',
        headers: ['Item', 'Formula Attack', 'Valid Number', 'DDE Pipe'],
        rows: [
          ['Line 1', '=cmd|\'/C calc\'!A0', 42.5, '|malicious_pipe'],
          ['Line 2', '@SUM(A1:A10)', -150.25, '%userprofile%'],
          ['Line 3', '\u200B=malicious_payload', '+text_formula', 'Normal text'],
        ],
      },
    ];

    const buffer = await generateExcelBuffer(maliciousTables, 'test_export');
    assert.ok(buffer instanceof Buffer);
    assert.ok(buffer.length > 0);

    // Verify OpenXML format (starts with PK zip magic bytes 0x50 0x4B 0x03 0x04)
    assert.strictEqual(buffer[0], 0x50);
    assert.strictEqual(buffer[1], 0x4B);
    assert.strictEqual(buffer[2], 0x03);
    assert.strictEqual(buffer[3], 0x04);
  });

  await t.test('generateMultiSheetExcelBuffer handles multi-sheet exports with bounds', async () => {
    const sheets = [
      {
        sheetName: 'Sheet A',
        tables: [
          {
            title: 'Table A1',
            headers: ['Col 1', 'Col 2'],
            rows: [['Data A', 'Data B']],
          },
        ],
      },
      {
        sheetName: 'Sheet B',
        tables: [
          {
            title: 'Table B1',
            headers: ['Col X'],
            rows: [['Data X']],
          },
        ],
      },
    ];

    const buffer = await generateMultiSheetExcelBuffer(sheets);
    assert.ok(buffer instanceof Buffer);
    assert.ok(buffer.length > 0);
  });
});

test('--- Gemini Telemetry & Service Tests ---', async (t) => {
  await t.test('isGeminiConfigured returns boolean based on environment variable', () => {
    const originalKey = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_API_KEY = 'test_key_123';
      assert.strictEqual(isGeminiConfigured(), true);

      delete process.env.GEMINI_API_KEY;
      assert.strictEqual(isGeminiConfigured(), false);
    } finally {
      if (originalKey !== undefined) {
        process.env.GEMINI_API_KEY = originalKey;
      }
    }
  });

  await t.test('getTelemetryAnalytics returns correct structure and initializes properly', () => {
    resetTelemetryStats();
    const analytics = getTelemetryAnalytics();

    assert.ok(analytics.summary);
    assert.strictEqual(analytics.summary.total_requests, 0);
    assert.strictEqual(analytics.summary.successful_requests, 0);
    assert.strictEqual(analytics.summary.failed_requests, 0);
    assert.strictEqual(analytics.summary.currency, 'INR');

    assert.ok(analytics.quota);
    assert.strictEqual(analytics.quota.minute_limit, 1000);
    assert.ok(Array.isArray(analytics.daily_history));
    assert.strictEqual(analytics.daily_history.length, 7); // Pre-seeded 7 days
    assert.ok(Array.isArray(analytics.recent_invocations));
  });
});

test('--- PDF Trimmer Heuristic & PO Recognition Tests ---', async (t) => {
  await t.test('isZamilPurchaseOrder distinguishes Zamil POs from Oracle Requisitions', () => {
    // 1. Zamil PO content simulation
    const zamilPoBuffer = Buffer.from('Zamil Offshore Services Company PURCHASE ORDER PO NUMBER: 12345 PRNO: 9999', 'latin1');
    assert.strictEqual(isZamilPurchaseOrder(zamilPoBuffer, 'zamil_po_123.pdf'), true);

    // 2. Oracle Requisition simulation
    const oracleReqBuffer = Buffer.from('Oracle Corporation Requisition Title: Requisition Lines Charge Account', 'latin1');
    assert.strictEqual(isZamilPurchaseOrder(oracleReqBuffer, 'oracle_requisition.pdf'), false);
  });
});

test('--- Authentication & Cryptographic Session Security Tests ---', async (t) => {
  const testSecret = 'secure_enterprise_test_key_salt_2026';

  await t.test('generates and verifies HMAC-SHA256 session token', async () => {
    const token = await createSessionToken(testSecret, 3600);
    assert.ok(typeof token === 'string');
    assert.ok(token.includes('.'));

    const isValid = await verifySessionToken(token, testSecret);
    assert.strictEqual(isValid, true);
  });

  await t.test('rejects tampered or forged tokens', async () => {
    const token = await createSessionToken(testSecret, 3600);
    // Tamper with payload
    const tampered = 'x' + token.slice(1);
    const isValid = await verifySessionToken(tampered, testSecret);
    assert.strictEqual(isValid, false);
  });

  await t.test('rejects expired tokens', async () => {
    // Negative expiration (already expired)
    const expiredToken = await createSessionToken(testSecret, -10);
    const isValid = await verifySessionToken(expiredToken, testSecret);
    assert.strictEqual(isValid, false);
  });

  await t.test('timingSafeCompare validates exact string equality and resists timing attacks', () => {
    assert.strictEqual(timingSafeCompare('Secret123', 'Secret123'), true);
    assert.strictEqual(timingSafeCompare('Secret123', 'Secret124'), false);
    assert.strictEqual(timingSafeCompare('Short', 'LongerStringHere'), false);
    assert.strictEqual(timingSafeCompare('', 'NonEmpty'), false);
  });
});

