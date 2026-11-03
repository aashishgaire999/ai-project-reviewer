import { describe, expect, it } from "vitest";
import { groundingNote, toMarkdown, verdict } from "@/app/report";
import { normalizeReview } from "@/lib/review-types";
import type { Review } from "@/lib/review-types";

const review: Review = {
  score: 7,
  summary: "A small library.",
  strengths: [{ title: "Tested", detail: "", evidence: "" }],
  improvements: [],
  roadmap: [
    { title: "Add a changelog", detail: "Users can see what changed.", evidence: "" },
    { title: "Ship v2", detail: "", evidence: "package.json" },
  ],
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
    expect(md).toContain("## Review: a/b (7/10)");
    expect(md).toContain("| 8/10 | 5/10 | 7/10 | 9/10 |");
    expect(md).toContain("1. **Add a changelog**: Users can see what changed.\n2. **Ship v2** _(package.json)_");
    expect(md).not.toContain("Fix next");
    expect(md).not.toContain("Worth studying");
  });
});

describe("older saved reviews", () => {
  it("turn plain-sentence lists into title-only items", () => {
    const old = { ...review, strengths: ["Has tests", ""] } as unknown as typeof review;
    expect(normalizeReview(old).strengths).toEqual([{ title: "Has tests", detail: "", evidence: "" }]);
  });
});

describe("groundingNote", () => {
  it("states how much was read, from the server's facts", () => {
    const deep = { ...review, grounded: { repository: true, liveSite: false, read: ["README", "package.json", "src/a.ts", "src/b.ts"], depth: "deep" as const } };
    expect(groundingNote(deep, "repo").label).toBe("Deep read");
    const full = { ...review, grounded: { repository: true, liveSite: false, read: ["README"], depth: "full" as const, coverage: { read: 34, total: 34 } } };
    expect(groundingNote(full, "repo")).toEqual({ label: "Full read", note: expect.stringContaining("34 of 34 source files (100%)") });
    const partial = { ...review, grounded: { repository: true, liveSite: false, read: ["README"], depth: "deep" as const, coverage: { read: 40, total: 212 } } };
    expect(groundingNote(partial, "repo").note).toContain("40 of 212 source files (19%)");
    expect(groundingNote(review, "repo").label).toBe("Surface read");
    expect(groundingNote(review, "site").label).toBe("Site only");
  });
});
