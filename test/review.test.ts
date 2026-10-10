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
  it("rejects output without a score", () => {
    expect(() => parseReview('{"summary": "x"}', grounded)).toThrow(/no score/);
    expect(() => parseReview("no json here", grounded)).toThrow(/no JSON/);
  });
  it("treats a missing score as worth retrying", () => {
    expect(isTransient(new Error("AI review returned no score"))).toBe(true);
    expect(isTransient(new Error("API key not valid"))).toBe(false);
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
