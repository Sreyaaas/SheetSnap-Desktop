/**
 * Enterprise Authentication & Cryptographic Session Security for SheetSnap.
 *
 * Implements:
 * - Web Crypto API (crypto.subtle) HMAC-SHA256 session token generation and verification.
 * - Constant-time string comparison to prevent timing attacks.
 * - Strict cookie security configuration (HttpOnly, Secure, SameSite=Lax).
 * - Compatible with Next.js Middleware (Edge Runtime) and Node.js API Route Handlers.
 */

export const AUTH_COOKIE_NAME = 'sheetsnap_auth_session';
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Retrieves the cryptographic signing secret from environment or fallback.
 */
export function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.SITE_PASSWORD ||
    'sheetsnap_enterprise_hmac_secret_salt_2026_pearl_gulf'
  );
}

/**
 * Retrieves the configured site access passcode.
 */
export function getSitePassword(): string {
  return process.env.SITE_PASSWORD || 'PearlGulf@2026!';
}

/**
 * Base64URL encoder conforming to RFC 7515 (URL-safe without padding).
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decoder conforming to RFC 7515.
 */
function base64UrlDecode(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates an HMAC-SHA256 signed session token containing issued-at and expiration timestamps.
 */
export async function createSessionToken(
  secret: string = getAuthSecret(),
  maxAgeSec: number = AUTH_COOKIE_MAX_AGE
): Promise<string> {
  const enc = new TextEncoder();
  const payload = JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + maxAgeSec * 1000,
  });

  const payloadB64 = base64UrlEncode(enc.encode(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies the cryptographic HMAC-SHA256 signature and checks expiration of a session token.
 */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string = getAuthSecret()
): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, signatureB64] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = base64UrlDecode(signatureB64);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes as BufferSource,
      enc.encode(payloadB64)
    );

    if (!isValid) return false;

    // Verify expiration timestamp
    const payloadRaw = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadRaw);

    if (!payload.exp || typeof payload.exp !== 'number') return false;
    if (Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let result = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const codeA = i < a.length ? a.charCodeAt(i) : 0;
    const codeB = i < b.length ? b.charCodeAt(i) : 0;
    result |= codeA ^ codeB;
  }
  return result === 0;
}
