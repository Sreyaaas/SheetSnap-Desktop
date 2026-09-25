/**
 * Production-Grade In-Memory Sliding Window Rate Limiter & DDoS Shield.
 *
 * Protects against automated spam, rapid replay attacks, and API key credit depletion.
 * Hardened with:
 * - Bounded memory cache (max 10,000 active entries to prevent heap memory exhaustion).
 * - IP format sanitization (prevents header-injection memory blowups).
 * - Automatic eviction of stale and banned entries.
 */

interface RateLimitRecord {
  timestamps: number[];
  blockedUntil?: number;
  lastSeen: number;
}

const MAX_TRACKED_IPS = 10_000;
const ipMap = new Map<string, RateLimitRecord>();

function pruneOldestEntries(): void {
  const now = Date.now();
  // First pass: delete all entries that have no timestamps in the last 2 minutes and aren't banned
  for (const [ip, record] of ipMap.entries()) {
    record.timestamps = record.timestamps.filter((t) => now - t < 120_000);
    if (record.timestamps.length === 0 && (!record.blockedUntil || record.blockedUntil < now)) {
      ipMap.delete(ip);
    }
  }

  // Second pass: if still over limit, evict the oldest entries by lastSeen
  if (ipMap.size >= MAX_TRACKED_IPS) {
    const entries = Array.from(ipMap.entries()).sort(
      (a, b) => a[1].lastSeen - b[1].lastSeen
    );
    const toDeleteCount = Math.floor(MAX_TRACKED_IPS * 0.2); // evict oldest 20%
    for (let i = 0; i < toDeleteCount && i < entries.length; i++) {
      ipMap.delete(entries[i][0]);
    }
  }
}

// Clean up stale entries every 2 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    pruneOldestEntries();
  }, 120_000);
  // Unref timer so it does not keep Node test runners or CLI processes alive
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

export interface RateLimitOptions {
  /** Maximum requests allowed within window */
  maxRequests?: number;
  /** Window size in milliseconds (default 60s) */
  windowMs?: number;
  /** Temporary ban duration in milliseconds if abuse is detected (default 2 minutes) */
  banDurationMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetTimeMs: number;
  retryAfterSeconds?: number;
}

export function checkRateLimit(
  clientIp: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const {
    maxRequests = 20, // 20 requests per minute per IP
    windowMs = 60_000,
    banDurationMs = 120_000,
  } = options;

  // Sanitize IP key to avoid arbitrary-length memory bloat
  const safeIp = (clientIp || '127.0.0.1').slice(0, 64);
  const now = Date.now();

  if (ipMap.size >= MAX_TRACKED_IPS && !ipMap.has(safeIp)) {
    pruneOldestEntries();
  }

  let record = ipMap.get(safeIp);

  if (!record) {
    record = { timestamps: [], lastSeen: now };
    ipMap.set(safeIp, record);
  }

  record.lastSeen = now;

  // Check if IP is currently banned
  if (record.blockedUntil && record.blockedUntil > now) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      limit: maxRequests,
      resetTimeMs: record.blockedUntil,
      retryAfterSeconds: retryAfter,
    };
  }

  // Filter timestamps within current window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= maxRequests) {
    // Excessive burst detected - trigger temporary ban
    record.blockedUntil = now + banDurationMs;
    const retryAfter = Math.ceil(banDurationMs / 1000);
    return {
      allowed: false,
      remaining: 0,
      limit: maxRequests,
      resetTimeMs: record.blockedUntil,
      retryAfterSeconds: retryAfter,
    };
  }

  // Record this valid request
  record.timestamps.push(now);

  const oldestTimestamp = record.timestamps[0] || now;
  const resetTimeMs = oldestTimestamp + windowMs;

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - record.timestamps.length),
    limit: maxRequests,
    resetTimeMs,
  };
}

/**
 * Validates and extracts the best candidate client IP from request headers (Cloudflare, Vercel, direct).
 * Strips untrusted port numbers and sanitizes format to prevent injection attacks.
 */
export function getClientIp(headers: Headers): string {
  const ipRegex = /^[a-fA-F0-9:.]+(%[0-9a-zA-Z]+)?$/;

  const sanitizeIp = (raw: string | null): string | null => {
    if (!raw) return null;
    let clean = raw.trim();
    // If it contains comma (x-forwarded-for chain), take the client IP (first element)
    if (clean.includes(',')) {
      clean = clean.split(',')[0].trim();
    }
    // Remove port if present (e.g. 192.168.1.1:8080 or [::1]:8080)
    if (clean.includes(':') && !clean.includes('::') && clean.includes('.')) {
      clean = clean.split(':')[0].trim();
    }
    if (clean && clean.length <= 64 && ipRegex.test(clean)) {
      return clean;
    }
    return null;
  };

  const cfConnectingIp = sanitizeIp(headers.get('cf-connecting-ip'));
  if (cfConnectingIp) return cfConnectingIp;

  const trueClientIp = sanitizeIp(headers.get('true-client-ip'));
  if (trueClientIp) return trueClientIp;

  const xRealIp = sanitizeIp(headers.get('x-real-ip'));
  if (xRealIp) return xRealIp;

  const xForwardedFor = sanitizeIp(headers.get('x-forwarded-for'));
  if (xForwardedFor) return xForwardedFor;

  return '127.0.0.1';
}
