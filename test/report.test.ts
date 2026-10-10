import { describe, expect, it } from "vitest";
import { toMarkdown, verdict } from "@/app/report";
import type { Review } from "@/lib/review-types";

const review: Review = {
  score: 7,
  summary: "A small library.",
  strengths: ["Tested"],
  improvements: [],
  roadmap: ["Add a changelog", "Ship v2"],
  breakdown: { code_quality: 8, originality: 5, completeness: 7, documentation: 9 },
  references: [],
  one_liner: "",
  grounded: { repository: true, liveSite: false },
};

describe("verdict", () => {
  it("follows the scale given to the model", () => {
    expect([1, 4, 5, 6, 7, 8, 9, 10].map(verdict)).toEqual([
      "Needs work", "Needs work", "Decent start", "Decent start", "Solid", "Solid", "Excellent", "Exceptional",
    ]);
  });
});

describe("toMarkdown", () => {
  it("includes the score table and skips empty sections", () => {
    const md = toMarkdown(review, "a/b");
    expect(md).toContain("## Review: a/b (7/10, Solid)");
    expect(md).toContain("| 8/10 | 5/10 | 7/10 | 9/10 |");
    expect(md).toContain("1. Add a changelog\n2. Ship v2");
    expect(md).not.toContain("Fix next");
    expect(md).not.toContain("Worth studying");
  });
});
