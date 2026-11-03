// Shared by the server and the browser, so it must not import the AI SDK.

export const CATEGORIES = ["code_quality", "originality", "completeness", "documentation"] as const;
export type Category = (typeof CATEGORIES)[number];

// One point in a list: a short headline, one line of detail, and where in
// the project it was seen (a file path or page), shown when expanded.
export type Item = { title: string; detail: string; evidence: string };

export type Depth = "deep" | "partial" | "surface";

export type Review = {
  score: number;
  summary: string;
  strengths: Item[];
  improvements: Item[]; // most impactful first
  roadmap: Item[];
  // null means "not assessed", e.g. code quality when only a website was given.
  breakdown: Record<Category, number | null>;
  references: Item[];
  one_liner: string;
  grounded: {
    repository: boolean;
    liveSite: boolean;
    // What the review actually read. Missing on reviews saved before this existed.
    read?: string[];
    depth?: Depth;
    // Caps the server applied from facts it checked, e.g. "Completeness capped at 6: no test files found".
    adjustments?: string[];
    // Which scoring rules produced this review. Older reviews have none.
    scoring?: number;
  };
};

// Reviews saved before items had titles stored plain sentences; show those
// as a title-only item so old reviews still render.
export function toItem(value: unknown): Item | null {
  if (typeof value === "string") return value.trim() ? { title: value.trim(), detail: "", evidence: "" } : null;
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  const title = str(v.title, 120);
  if (!title) return null;
  return { title, detail: str(v.detail, 400), evidence: str(v.evidence, 200) };
}

export function toItems(value: unknown, max = 5): Item[] {
  return Array.isArray(value) ? value.map(toItem).filter((i): i is Item => i !== null).slice(0, max) : [];
}

// Brings a stored review (possibly from an older format) up to the current shape.
export function normalizeReview(review: Review): Review {
  return {
    ...review,
    strengths: toItems(review.strengths),
    improvements: toItems(review.improvements),
    roadmap: toItems(review.roadmap),
    references: toItems(review.references, 4),
  };
}

// What was reviewed: a GitHub repo, or a website on its own.
export type Subject = { kind: "repo" | "site"; key: string; label: string; url: string };

// A finished review as stored and shown on the public board.
export type SavedReview = {
  subject: Subject;
  // For repos, GitHub's last push time. The same repo at the same version
  // always gets the saved review back instead of a new, different score.
  version: string | null;
  review: Review;
  reviewedAt: string;
  public: boolean;
};

export type BoardEntry = {
  subject: Subject;
  score: number;
  breakdown: Review["breakdown"];
  reviewedAt: string;
};
