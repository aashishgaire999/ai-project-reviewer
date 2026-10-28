import { createClient } from "redis";

// One tiny interface over two ways of reaching Redis: a direct connection
// (REDIS_URL, e.g. Redis Cloud from Vercel's marketplace) or Upstash's REST
// API. The store and rate limiter only see `Pipeline`.

export type Pipeline = (commands: (string | number)[][]) => Promise<unknown[]>;
export type RedisConfig = { url: string; token: string };
type Env = Record<string, string | undefined>;

export function redisConfig(env: Env = process.env): RedisConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function createPipeline({ url, token }: RedisConfig, fetchImpl: typeof fetch = fetch): Pipeline {
  return async (commands) => {
    const res = await fetchImpl(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const replies = (await res.json()) as { result?: unknown; error?: string }[];
    return replies.map((r) => {
      if (r?.error) throw new Error(`Upstash: ${r.error}`);
      return r?.result ?? null;
    });
  };
}

type Sender = { sendCommand(args: string[]): Promise<unknown> };

// Direct connection. The client is created once per server instance and
// reused across requests; node-redis pipelines commands sent together.
export function createTcpPipeline(connect: () => Promise<Sender>): Pipeline {
  let client: Promise<Sender> | null = null;
  return async (commands) => {
    client ??= connect().catch((error) => {
      client = null; // let the next request try again
      throw error;
    });
    const c = await client;
    return Promise.all(commands.map((cmd) => c.sendCommand(cmd.map(String))));
  };
}

function connectTcp(url: string) {
  return async () => {
    const client = createClient({ url, socket: { connectTimeout: 3_000, reconnectStrategy: (retries) => (retries > 3 ? false : 200 * retries) } });
    client.on("error", (e) => console.error("Redis connection error", String(e).slice(0, 200)));
    await client.connect();
    return client as unknown as Sender;
  };
}

// REDIS_URL wins, then Upstash, else no store at all.
export function pipelineFromEnv(env: Env = process.env): Pipeline | null {
  if (env.REDIS_URL) return createTcpPipeline(connectTcp(env.REDIS_URL));
  const upstash = redisConfig(env);
  return upstash ? createPipeline(upstash) : null;
}

let shared: Pipeline | null | undefined;
export function sharedPipeline(): Pipeline | null {
  if (shared === undefined) shared = pipelineFromEnv();
  return shared;
}
