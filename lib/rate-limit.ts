// Per-IP limits on the server's Gemini key.
//
// With Upstash Redis configured, every serverless instance shares one count.
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

// Fixed window in Redis via Upstash's REST pipeline: create the counter with
// an expiry if it doesn't exist, increment it, and read how long is left.
export function createUpstashLimiter(
  { url, token, limit, windowMs }: { url: string; token: string; limit: number; windowMs: number },
  fetchImpl: typeof fetch = fetch,
): Limiter {
  const windowSeconds = Math.ceil(windowMs / 1000);
  return async (key) => {
    const redisKey = `ratelimit:review:${key}`;
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["SET", redisKey, "0", "EX", String(windowSeconds), "NX"],
        ["INCR", redisKey],
        ["PTTL", redisKey],
      ]),
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const [, incr, pttl] = (await res.json()) as { result?: number; error?: string }[];
    if (typeof incr?.result !== "number") throw new Error(`Upstash: ${incr?.error ?? "bad response"}`);
    const msLeft = typeof pttl?.result === "number" && pttl.result > 0 ? pttl.result : windowMs;
    return incr.result > limit
      ? { allowed: false, retryAfterSeconds: Math.ceil(msLeft / 1000) }
      : { allowed: true, retryAfterSeconds: 0 };
  };
}

// Uses Redis when its env vars are set (names from Upstash or Vercel's
// Upstash integration), and falls back to memory if Redis is unset or down,
// so an outage there never takes the reviewer offline.
export function createLimiter(limit: number, windowMs: number, env: Record<string, string | undefined> = process.env): Limiter {
  const memory = createRateLimiter(limit, windowMs);
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return async (key) => memory(key);
  const redis = createUpstashLimiter({ url, token, limit, windowMs });
  return async (key) => {
    try {
      return await redis(key);
    } catch (error) {
      console.error("Rate limit store unavailable, using in-memory limit", String(error).slice(0, 200));
      return memory(key);
    }
  };
}
