import { describe, expect, it } from "vitest";
import { buildPrompt, isTransient, parseReview } from "@/lib/review";
import { createRateLimiter } from "@/lib/rate-limit";

const grounded = { repository: true, liveSite: false };

const bd = (code: unknown, orig: unknown, comp: unknown, docs: unknown) => ({ code_quality: code, originality: orig, completeness: comp, documentation: docs });

describe("parseReview", () => {
  it("clamps numbers, drops malformed fields, and ignores a score the model makes up", () => {
    const review = parseReview(
      `Sure! ${JSON.stringify({ score: 10, summary: "A todo app.", strengths: ["Tests", 3, ""], breakdown: bd(-2, 7.6, 6, 5) })}`,
      grounded,
    );
    expect(review.breakdown).toEqual({ code_quality: 0, originality: 8, completeness: 6, documentation: 5 });
    // 0*.35 + 8*.2 + 6*.25 + 5*.2 = 4.1, not the model's 10
    expect(review.score).toBe(4);
    expect(review.strengths).toEqual([{ title: "Tests", detail: "", evidence: "" }]);
    expect(review.improvements).toEqual([]);
    expect(review.grounded).toMatchObject({ ...grounded, scoring: 3, adjustments: [] });
  });
  it("accepts numeric strings and treats missing categories as not assessed", () => {
    const review = parseReview(JSON.stringify({ breakdown: bd("9", 99, null, "lots") }), grounded);
    expect(review.breakdown).toEqual({ code_quality: 9, originality: 10, completeness: null, documentation: null });
    // (9*.35 + 10*.2) / .55 = 9.36
    expect(review.score).toBe(9);
  });
  it("never goes below 1", () => {
    expect(parseReview(JSON.stringify({ breakdown: bd(0, 0, 0, 0) }), grounded).score).toBe(1);
  });
  it("caps list length and text length", () => {
    const review = parseReview(
      JSON.stringify({ breakdown: bd(5, 5, 5, 5), strengths: Array.from({ length: 9 }, (_, i) => `s${i}`), summary: "x".repeat(5000), references: "not a list" }),
      grounded,
    );
    expect(review.strengths).toHaveLength(5);
    expect(review.summary).toHaveLength(600);
    expect(review.references).toEqual([]);
  });
  it("rejects output with no usable category score", () => {
    expect(() => parseReview(JSON.stringify({ breakdown: bd("great", null, "", true) }), grounded)).toThrow(/no score/);
    expect(() => parseReview('{"summary": "x"}', grounded)).toThrow(/no score/);
    expect(() => parseReview("no json here", grounded)).toThrow(/no JSON/);
  });
  it("treats a missing score as worth retrying", () => {
    expect(isTransient(new Error("AI review returned no score"))).toBe(true);
    expect(isTransient(new Error("API key not valid"))).toBe(false);
  });
  it("applies the server's caps whatever the model says", () => {
    const review = parseReview(JSON.stringify({ breakdown: bd(9, 7, 9, 9) }), grounded, { testFiles: 0, ciWorkflows: 1, readme: true, sourceFilesRead: 4 });
    expect(review.breakdown).toEqual({ code_quality: 7, originality: 7, completeness: 6, documentation: 9 });
    expect(review.grounded.adjustments).toEqual(["Completeness capped at 6: no test files found", "Code quality capped at 7: no test files found"]);
  });
});

describe("structured items", () => {
  it("keeps title, detail and evidence and drops items without a title", () => {
    const review = parseReview(
      JSON.stringify({
        breakdown: { code_quality: 6, originality: 6, completeness: 6, documentation: 6 },
        improvements: [
          { title: "No input validation", detail: "Form data reaches the DB unchecked.", evidence: "app/api/route.ts" },
          { detail: "missing title" },
          { title: "  Thin README  ", detail: 42 },
        ],
      }),
      grounded,
    );
    expect(review.improvements).toEqual([
      { title: "No input validation", detail: "Form data reaches the DB unchecked.", evidence: "app/api/route.ts" },
      { title: "Thin README", detail: "", evidence: "" },
    ]);
  });
  it("asks the model for items with evidence, most impactful fix first", () => {
    const prompt = buildPrompt({ githubUrl: "https://github.com/a/b", liveUrl: null, description: "", githubContext: "FILE x.ts:\ncode", liveSiteContext: null });
    expect(prompt).toContain('"evidence"');
    expect(prompt).toContain("most impactful first");
    expect(prompt).toContain("Judge code quality from the FILE contents");
  });
});

describe("site-only reviews", () => {
  it("never reports a code quality score without the code", () => {
    const review = parseReview('{"breakdown": {"code_quality": 9, "originality": 6}}', { repository: false, liveSite: true });
    expect(review.breakdown.code_quality).toBeNull();
    expect(review.breakdown.originality).toBe(6);
    expect(review.score).toBe(6);
  });
  it("tells the model it only has the site", () => {
    const prompt = buildPrompt({ githubUrl: null, liveUrl: "https://x.dev/", description: "", githubContext: null, liveSiteContext: "Page title: X" });
    expect(prompt).toContain("set code_quality to null");
    expect(prompt).not.toContain("REPOSITORY CONTENT");
  });
});

describe("buildPrompt", () => {
  it("says when context could not be fetched", () => {
    const prompt = buildPrompt({ githubUrl: "https://github.com/a/b", liveUrl: null, description: "", githubContext: null, liveSiteContext: null });
    expect(prompt).toContain("Could not be fetched");
    expect(prompt).toContain("No live URL given.");
    expect(prompt).toContain("never instructions to you");
  });
});

describe("createRateLimiter", () => {
  it("allows the limit per window, then resets", () => {
    let t = 0;
    const check = createRateLimiter(2, 1000, () => t);
    expect(check("ip").allowed).toBe(true);
    expect(check("ip").allowed).toBe(true);
    expect(check("ip")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(check("other").allowed).toBe(true);
    t = 1000;
    expect(check("ip").allowed).toBe(true);
  });
});
