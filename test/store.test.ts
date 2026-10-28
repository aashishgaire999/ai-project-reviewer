import { describe, expect, it } from "vitest";
import type { Pipeline } from "@/lib/redis";
import { createPipeline, redisConfig } from "@/lib/redis";
import type { Review, SavedReview } from "@/lib/review-types";
import { canReuse, createStore, subjectForRepo, subjectForSite } from "@/lib/store";

// Runs the handful of Redis commands the store uses against plain maps.
function fakeRedis(): Pipeline {
  const strings = new Map<string, string>();
  const zset = new Map<string, number>();
  const byScoreDesc = () => [...zset.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return async (commands) =>
    commands.map(([cmd, ...a]) => {
      const args = a.map(String);
      switch (cmd) {
        case "GET": return strings.get(args[0]) ?? null;
        case "SET": strings.set(args[0], args[1]); return "OK";
        case "MGET": return args.map((k) => strings.get(k) ?? null);
        case "ZADD": zset.set(args[2], Number(args[1])); return 1;
        case "ZREM": return zset.delete(args[1]) ? 1 : 0;
        case "ZREVRANGE": return byScoreDesc().slice(Number(args[1]), Number(args[2]) + 1);
        case "ZREMRANGEBYRANK": {
          const asc = [...zset.entries()].sort((x, y) => x[1] - y[1]).map(([k]) => k);
          const stop = Number(args[2]) < 0 ? asc.length + Number(args[2]) : Number(args[2]);
          asc.slice(Number(args[1]), stop + 1).forEach((k) => zset.delete(k));
          return 0;
        }
        default: throw new Error(`unsupported ${cmd}`);
      }
    });
}

const review = (score: number): Review => ({
  score,
  summary: "s",
  strengths: [],
  improvements: [],
  roadmap: [],
  breakdown: { code_quality: score, originality: 5, completeness: 5, documentation: 5 },
  references: [],
  one_liner: "",
  grounded: { repository: true, liveSite: false },
});

const saved = (owner: string, repo: string, score: number, at: string, isPublic = true, version = "v1"): SavedReview => ({
  subject: subjectForRepo(owner, repo),
  version,
  review: review(score),
  reviewedAt: at,
  public: isPublic,
});

describe("subjects", () => {
  it("keys repos case-insensitively so one repo has one score", () => {
    expect(subjectForRepo("Vercel", "SWR").key).toBe(subjectForRepo("vercel", "swr").key);
    expect(subjectForRepo("Vercel", "SWR").label).toBe("Vercel/SWR");
  });
  it("keys sites by host and path, ignoring trailing slashes and query", () => {
    expect(subjectForSite(new URL("https://Example.com/app/?x=1")).key).toBe("site:example.com/app");
    expect(subjectForSite(new URL("https://example.com/")).key).toBe("site:example.com");
  });
});

describe("canReuse", () => {
  it("reuses a repo review only while the code is unchanged", () => {
    const s = saved("a", "b", 7, "2026-10-01T00:00:00Z");
    expect(canReuse(s, "v1")).toBe(true);
    expect(canReuse(s, "v2")).toBe(false);
    expect(canReuse({ ...s, version: null }, null)).toBe(false);
  });
  it("reuses a site review for a week", () => {
    const site: SavedReview = { ...saved("a", "b", 7, "2026-10-01T00:00:00Z"), subject: subjectForSite(new URL("https://x.dev")), version: null };
    expect(canReuse(site, null, Date.parse("2026-10-07T00:00:00Z"))).toBe(true);
    expect(canReuse(site, null, Date.parse("2026-10-09T00:00:00Z"))).toBe(false);
  });
});

describe("store", () => {
  it("saves and reads back a review", async () => {
    const store = createStore(fakeRedis());
    const s = saved("a", "b", 7, "2026-10-01T00:00:00Z");
    await store.save(s);
    expect(await store.get(s.subject.key)).toEqual(s);
    expect(await store.get("repo:missing/repo")).toBeNull();
  });

  it("lists public reviews newest first, one entry per subject", async () => {
    const store = createStore(fakeRedis());
    await store.save(saved("a", "old", 5, "2026-10-01T00:00:00Z"));
    await store.save(saved("a", "new", 8, "2026-10-03T00:00:00Z"));
    await store.save(saved("a", "old", 6, "2026-10-05T00:00:00Z", true, "v2"));
    const board = await store.board(10);
    expect(board.map((e) => [e.subject.label, e.score])).toEqual([["a/old", 6], ["a/new", 8]]);
  });

  it("keeps private reviews off the board and removes a review that turns private", async () => {
    const store = createStore(fakeRedis());
    await store.save(saved("a", "hidden", 4, "2026-10-01T00:00:00Z", false));
    await store.save(saved("a", "shown", 9, "2026-10-02T00:00:00Z"));
    await store.save(saved("a", "shown", 9, "2026-10-03T00:00:00Z", false));
    expect(await store.board(10)).toEqual([]);
  });
});

describe("redis client", () => {
  it("reads either Upstash or Vercel integration env names", () => {
    expect(redisConfig({ KV_REST_API_URL: "https://r.dev/", KV_REST_API_TOKEN: "t" })).toEqual({ url: "https://r.dev", token: "t" });
    expect(redisConfig({})).toBeNull();
  });
  it("throws when a command fails", async () => {
    const pipeline = createPipeline({ url: "https://r.dev", token: "t" }, (async () => new Response('[{"error":"ERR"}]')) as unknown as typeof fetch);
    await expect(pipeline([["GET", "x"]])).rejects.toThrow(/ERR/);
  });
});
