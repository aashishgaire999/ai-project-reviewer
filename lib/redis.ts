// Minimal Upstash Redis client over its REST pipeline API, so there is no SDK
// to install. Reads the env var names Upstash and Vercel's integration use.

export type RedisConfig = { url: string; token: string };
export type Pipeline = (commands: (string | number)[][]) => Promise<unknown[]>;

export function redisConfig(env: Record<string, string | undefined> = process.env): RedisConfig | null {
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
