// Fixed-window limit per key, kept in memory. On serverless hosts each
// instance has its own memory, so this slows abuse rather than capping it
// exactly. Use a shared store (Redis, Upstash) if the server key costs real money.

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function check(key: string): { allowed: boolean; retryAfterSeconds: number } {
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
