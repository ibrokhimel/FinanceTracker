/**
 * In-memory token-bucket rate limiter per user + per resource type.
 *
 *   if (!check(userId, 'msg')) return bot.sendMessage(...'slow down')
 */

const BUCKETS = new Map(); // key → { tokens, lastRefill }

const LIMITS = {
  msg:   { max: 30,  refillPerSec: 30 / 60 },     // 30/min
  photo: { max: 12,  refillPerSec: 12 / 60 },     // 12/min
  ai:    { max: 100, refillPerSec: 100 / 3600 },  // 100/hr
};

function refill(b, cfg, now) {
  const elapsed = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(cfg.max, b.tokens + elapsed * cfg.refillPerSec);
  b.lastRefill = now;
}

/**
 * Consume one token. Returns true if allowed, false if throttled.
 */
export function check(userId, kind = 'msg') {
  const cfg = LIMITS[kind];
  if (!cfg) return true;
  const key = `${userId}:${kind}`;
  const now = Date.now();
  let b = BUCKETS.get(key);
  if (!b) {
    b = { tokens: cfg.max, lastRefill: now };
    BUCKETS.set(key, b);
  } else {
    refill(b, cfg, now);
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/** Non-destructive peek — returns remaining tokens (or null if no bucket). */
export function peek(userId, kind = 'msg') {
  const cfg = LIMITS[kind];
  if (!cfg) return null;
  const b = BUCKETS.get(`${userId}:${kind}`);
  if (!b) return cfg.max;
  refill(b, cfg, Date.now());
  return Math.max(0, b.tokens);
}

/** Diagnostics — how many buckets are tracked. */
export function size() { return BUCKETS.size; }

/** Periodic cleanup so we don't leak memory for inactive users. */
export function sweep(maxAgeMs = 24 * 3600 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [k, b] of BUCKETS) {
    if (b.lastRefill < cutoff) BUCKETS.delete(k);
  }
}
setInterval(sweep, 60 * 60 * 1000).unref?.();
