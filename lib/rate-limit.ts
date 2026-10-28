import type { Pipeline } from "./redis";

// Per-IP limits on the server's Gemini key.
//
// With Redis configured, every serverless instance shares one count.
// Without it, each instance counts on its own in memory: warm instances keep
// their count, but separate instances don't share it, so this slows abuse
// rather than capping it exactly.

export type LimitResult = { allowed: boolean; retryAfterSeconds: number };
export type Limiter = (key: string) => Promise<LimitResult>;

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function check(key: string): LimitResult {
    const t = now();
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - t) / 1000) };
    }
    entry.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

// Fixed window in Redis: create the counter with an expiry if it doesn't
// exist, increment it, and read how long is left.
export function createRedisLimiter(redis: Pipeline, limit: number, windowMs: number): Limiter {
  const windowSeconds = Math.ceil(windowMs / 1000);
  return async (key) => {
    const redisKey = `ratelimit:review:${key}`;
    const [, count, pttl] = await redis([
      ["SET", redisKey, "0", "EX", windowSeconds, "NX"],
      ["INCR", redisKey],
      ["PTTL", redisKey],
    ]);
    if (typeof count !== "number") throw new Error("Rate limit store returned no count");
    const msLeft = typeof pttl === "number" && pttl > 0 ? pttl : windowMs;
    return count > limit ? { allowed: false, retryAfterSeconds: Math.ceil(msLeft / 1000) } : { allowed: true, retryAfterSeconds: 0 };
  };
}

// Uses Redis when one is configured, and falls back to memory if it is
// unset or down, so an outage there never takes the reviewer offline.
export function createLimiter(limit: number, windowMs: number, redis: Pipeline | null): Limiter {
  const memory = createRateLimiter(limit, windowMs);
  if (!redis) return async (key) => memory(key);
  const shared = createRedisLimiter(redis, limit, windowMs);
  return async (key) => {
    try {
      return await shared(key);
    } catch (error) {
      console.error("Rate limit store unavailable, using in-memory limit", String(error).slice(0, 200));
      return memory(key);
    }
  };
}
