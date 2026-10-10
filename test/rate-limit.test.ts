import { describe, expect, it, vi } from "vitest";
import { createLimiter, createUpstashLimiter } from "@/lib/rate-limit";

// A tiny stand-in for Upstash's REST pipeline that runs the three commands we send.
function fakeUpstash() {
  const store = new Map<string, { value: number; expiresAt: number }>();
  let now = 0;
  const calls: unknown[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    const commands = JSON.parse(String(init.body)) as string[][];
    calls.push({ auth: (init.headers as Record<string, string>).Authorization, commands });
    const results = commands.map(([cmd, key, ...args]) => {
      const entry = store.get(key);
      const live = entry && entry.expiresAt > now ? entry : undefined;
      if (cmd === "SET") {
        if (live) return { result: null };
        store.set(key, { value: Number(args[0]), expiresAt: now + Number(args[2]) * 1000 });
        return { result: "OK" };
      }
      if (cmd === "INCR") {
        const e = live ?? { value: 0, expiresAt: Infinity };
        e.value++;
        store.set(key, e);
        return { result: e.value };
      }
      if (cmd === "PTTL") return { result: live ? live.expiresAt - now : -2 };
      return { error: "unknown command" };
    });
    return new Response(JSON.stringify(results));
  }) as unknown as typeof fetch;
  return { impl, calls, advance: (ms: number) => (now += ms) };
}

describe("createUpstashLimiter", () => {
  it("shares one count per key and resets after the window", async () => {
    const redis = fakeUpstash();
    const check = createUpstashLimiter({ url: "https://r.example/", token: "t", limit: 2, windowMs: 60_000 }, redis.impl);
    expect((await check("ip")).allowed).toBe(true);
    expect((await check("ip")).allowed).toBe(true);
    expect(await check("ip")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect((await check("other-ip")).allowed).toBe(true);
    redis.advance(60_000);
    expect((await check("ip")).allowed).toBe(true);
    expect(redis.calls[0]).toMatchObject({ auth: "Bearer t" });
  });

  it("throws on a Redis error so the caller can fall back", async () => {
    const failing = (async () => new Response("[{},{\"error\":\"WRONGTYPE\"},{}]")) as unknown as typeof fetch;
    const check = createUpstashLimiter({ url: "https://r.example", token: "t", limit: 1, windowMs: 1000 }, failing);
    await expect(check("ip")).rejects.toThrow(/WRONGTYPE/);
  });
});

describe("createLimiter", () => {
  it("uses memory when no Redis is configured", async () => {
    const check = createLimiter(1, 60_000, {});
    expect((await check("ip")).allowed).toBe(true);
    expect((await check("ip")).allowed).toBe(false);
  });

  it("falls back to memory when Redis is unreachable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const check = createLimiter(1, 60_000, { UPSTASH_REDIS_REST_URL: "http://127.0.0.1:1", UPSTASH_REDIS_REST_TOKEN: "t" });
    expect((await check("ip")).allowed).toBe(true);
    expect((await check("ip")).allowed).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
