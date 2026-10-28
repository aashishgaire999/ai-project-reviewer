import { describe, expect, it } from "vitest";
import { buildPrompt, isTransient, parseReview } from "@/lib/review";
import { createRateLimiter } from "@/lib/rate-limit";

const grounded = { repository: true, liveSite: false };

describe("parseReview", () => {
  it("clamps numbers and drops malformed fields", () => {
    const review = parseReview(
      'Sure! {"score": 14, "summary": "A todo app.", "strengths": ["Tests", 3, ""], "breakdown": {"code_quality": -2, "originality": 7.6}}',
      grounded,
    );
    expect(review.score).toBe(10);
    expect(review.strengths).toEqual(["Tests"]);
    expect(review.breakdown).toEqual({ code_quality: 0, originality: 8, completeness: 0, documentation: 0 });
    expect(review.improvements).toEqual([]);
    expect(review.grounded).toBe(grounded);
  });
  it("accepts numeric strings, rounds, and clamps every breakdown field", () => {
    const review = parseReview(
      JSON.stringify({ score: "7.5", breakdown: { code_quality: "9", originality: 99, completeness: null, documentation: "lots" } }),
      grounded,
    );
    expect(review.score).toBe(8);
    expect(review.breakdown).toEqual({ code_quality: 9, originality: 10, completeness: 0, documentation: 0 });
  });
  it("clamps a zero or negative score up to 1", () => {
    expect(parseReview('{"score": 0}', grounded).score).toBe(1);
    expect(parseReview('{"score": -4}', grounded).score).toBe(1);
  });
  it("caps list length and text length", () => {
    const review = parseReview(
      JSON.stringify({ score: 5, strengths: Array.from({ length: 9 }, (_, i) => `s${i}`), summary: "x".repeat(5000), references: "not a list" }),
      grounded,
    );
    expect(review.strengths).toHaveLength(5);
    expect(review.summary).toHaveLength(600);
    expect(review.references).toEqual([]);
  });
  it("rejects a non-numeric score", () => {
    expect(() => parseReview('{"score": "great"}', grounded)).toThrow(/no score/);
    expect(() => parseReview('{"score": null}', grounded)).toThrow(/no score/);
    expect(() => parseReview('{"score": ""}', grounded)).toThrow(/no score/);
    expect(() => parseReview('{"score": true}', grounded)).toThrow(/no score/);
    expect(() => parseReview('{"score": []}', grounded)).toThrow(/no score/);
  });
  it("rejects output without a score", () => {
    expect(() => parseReview('{"summary": "x"}', grounded)).toThrow(/no score/);
    expect(() => parseReview("no json here", grounded)).toThrow(/no JSON/);
  });
  it("treats a missing score as worth retrying", () => {
    expect(isTransient(new Error("AI review returned no score"))).toBe(true);
    expect(isTransient(new Error("API key not valid"))).toBe(false);
  });
});

describe("site-only reviews", () => {
  it("never reports a code quality score without the code", () => {
    const review = parseReview('{"score": 7, "breakdown": {"code_quality": 9, "originality": 6}}', { repository: false, liveSite: true });
    expect(review.breakdown.code_quality).toBeNull();
    expect(review.breakdown.originality).toBe(6);
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
