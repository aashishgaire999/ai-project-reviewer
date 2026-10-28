import { describe, expect, it, vi } from "vitest";
import { createLimiter, createRedisLimiter } from "@/lib/rate-limit";
import { createPipeline, createTcpPipeline, pipelineFromEnv } from "@/lib/redis";

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

describe("createRedisLimiter over Upstash REST", () => {
  it("shares one count per key and resets after the window", async () => {
    const redis = fakeUpstash();
    const check = createRedisLimiter(createPipeline({ url: "https://r.example", token: "t" }, redis.impl), 2, 60_000);
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
    const check = createRedisLimiter(createPipeline({ url: "https://r.example", token: "t" }, failing), 1, 1000);
    await expect(check("ip")).rejects.toThrow(/WRONGTYPE/);
  });
});

describe("createLimiter", () => {
  it("uses memory when no Redis is configured", async () => {
    const check = createLimiter(1, 60_000, null);
    expect((await check("ip")).allowed).toBe(true);
    expect((await check("ip")).allowed).toBe(false);
  });

  it("falls back to memory when Redis is unreachable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const check = createLimiter(1, 60_000, createPipeline({ url: "http://127.0.0.1:1", token: "t" }));
    expect((await check("ip")).allowed).toBe(true);
    expect((await check("ip")).allowed).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("direct Redis connection", () => {
  it("connects once and reuses the client across requests", async () => {
    let connects = 0;
    const sent: string[][] = [];
    const pipeline = createTcpPipeline(async () => {
      connects++;
      return { sendCommand: async (args: string[]) => (sent.push(args), args[0] === "INCR" ? 1 : "OK") };
    });
    expect(await pipeline([["SET", "k", 0], ["INCR", "k"]])).toEqual(["OK", 1]);
    await pipeline([["GET", "k"]]);
    expect(connects).toBe(1);
    expect(sent).toEqual([["SET", "k", "0"], ["INCR", "k"], ["GET", "k"]]);
  });

  it("retries the connection on the next request after a failed connect", async () => {
    let attempts = 0;
    const pipeline = createTcpPipeline(async () => {
      if (++attempts === 1) throw new Error("ECONNREFUSED");
      return { sendCommand: async () => "PONG" };
    });
    await expect(pipeline([["PING"]])).rejects.toThrow(/ECONNREFUSED/);
    expect(await pipeline([["PING"]])).toEqual(["PONG"]);
  });

  it("prefers REDIS_URL, then Upstash, else nothing", () => {
    expect(pipelineFromEnv({})).toBeNull();
    expect(pipelineFromEnv({ UPSTASH_REDIS_REST_URL: "https://r.dev", UPSTASH_REDIS_REST_TOKEN: "t" })).toBeTypeOf("function");
    expect(pipelineFromEnv({ REDIS_URL: "redis://127.0.0.1:1" })).toBeTypeOf("function");
  });
});
