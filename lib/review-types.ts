// Shared by the server and the browser, so it must not import the AI SDK.

export const CATEGORIES = ["code_quality", "originality", "completeness", "documentation"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Review = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  roadmap: string[];
  // null means "not assessed", e.g. code quality when only a website was given.
  breakdown: Record<Category, number | null>;
  references: string[];
  one_liner: string;
  grounded: { repository: boolean; liveSite: boolean };
};

// What was reviewed: a GitHub repo, or a website on its own.
export type Subject = { kind: "repo" | "site"; key: string; label: string; url: string };

// A finished review as stored and shown on the public board.
export type SavedReview = {
  subject: Subject;
  // For repos, GitHub's last push time. The same repo at the same version
  // always gets the saved review back instead of a fresh, different score.
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
