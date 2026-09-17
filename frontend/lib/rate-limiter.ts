/**
 * Production-Grade In-Memory Sliding Window Rate Limiter & DDoS Shield.
 *
 * Protects against automated spam, rapid replay attacks, and API key credit depletion.
 * Designed for serverless and Node.js runtimes.
 */

interface RateLimitRecord {
  timestamps: number[];
  blockedUntil?: number;
}

const ipMap = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < 60_000);
      if (record.timestamps.length === 0 && (!record.blockedUntil || record.blockedUntil < now)) {
        ipMap.delete(ip);
      }
    }
  }, 300_000);
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

  const now = Date.now();
  let record = ipMap.get(clientIp);

  if (!record) {
    record = { timestamps: [] };
    ipMap.set(clientIp, record);
  }

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
 * Extracts the best candidate client IP from request headers (Cloudflare, Vercel, Nginx, direct).
 */
export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  return '127.0.0.1';
}
