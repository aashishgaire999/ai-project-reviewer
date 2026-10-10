// Shared by the server and the browser, so it must not import the AI SDK.

export const CATEGORIES = ["code_quality", "originality", "completeness", "documentation"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Review = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  roadmap: string[];
  breakdown: Record<Category, number>;
  references: string[];
  one_liner: string;
  grounded: { repository: boolean; liveSite: boolean };
};
