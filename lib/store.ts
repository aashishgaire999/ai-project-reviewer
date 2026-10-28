import type { BoardEntry, SavedReview, Subject } from "./review-types";
import type { Pipeline } from "./redis";

// Saved reviews, one per subject, plus the public board: a sorted set of
// subject keys by review time. A subject can only appear on it once.

const KEEP_SECONDS = 90 * 24 * 3600;
const SITE_REUSE_MS = 7 * 24 * 3600 * 1000;
const BOARD = "board";
const BOARD_MAX = 200;
const reviewKey = (key: string) => `review:${key}`;

export function subjectForRepo(owner: string, repo: string): Subject {
  return { kind: "repo", key: `repo:${owner}/${repo}`.toLowerCase(), label: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}` };
}

export function subjectForSite(url: URL): Subject {
  const path = url.pathname.replace(/\/+$/, "");
  const label = `${url.hostname.toLowerCase()}${path}`;
  return { kind: "site", key: `site:${label}`.toLowerCase(), label, url: url.toString() };
}

// A repo keeps its score until new code is pushed. A site has no version
// signal, so its review is reused for a week.
export function canReuse(saved: SavedReview, version: string | null, now = Date.now()) {
  if (saved.subject.kind === "repo") return saved.version !== null && saved.version === version;
  return now - Date.parse(saved.reviewedAt) < SITE_REUSE_MS;
}

export function toBoardEntry(saved: SavedReview): BoardEntry {
  return { subject: saved.subject, score: saved.review.score, breakdown: saved.review.breakdown, reviewedAt: saved.reviewedAt };
}

export function createStore(redis: Pipeline) {
  return {
    async get(key: string): Promise<SavedReview | null> {
      const [raw] = await redis([["GET", reviewKey(key)]]);
      if (typeof raw !== "string") return null;
      try {
        return JSON.parse(raw) as SavedReview;
      } catch {
        return null;
      }
    },

    async save(saved: SavedReview) {
      const key = saved.subject.key;
      await redis([
        ["SET", reviewKey(key), JSON.stringify(saved), "EX", KEEP_SECONDS],
        saved.public ? ["ZADD", BOARD, Date.parse(saved.reviewedAt), key] : ["ZREM", BOARD, key],
        ["ZREMRANGEBYRANK", BOARD, 0, -(BOARD_MAX + 1)],
      ]);
    },

    async board(limit: number): Promise<BoardEntry[]> {
      const [keys] = await redis([["ZREVRANGE", BOARD, 0, limit - 1]]);
      if (!Array.isArray(keys) || keys.length === 0) return [];
      const [values] = await redis([["MGET", ...keys.map((k) => reviewKey(String(k)))]]);
      if (!Array.isArray(values)) return [];
      return values.flatMap((raw) => {
        if (typeof raw !== "string") return [];
        try {
          const saved = JSON.parse(raw) as SavedReview;
          return saved.public ? [toBoardEntry(saved)] : [];
        } catch {
          return [];
        }
      });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
