import { describe, expect, it } from "vitest";
import { applyCaps, overallScore, UNKNOWN_FACTS } from "@/lib/scoring";

const bd = (code: number | null, orig: number | null, comp: number | null, docs: number | null) => ({ code_quality: code, originality: orig, completeness: comp, documentation: docs });

describe("overallScore", () => {
  it("weights code quality most", () => {
    expect(overallScore(bd(10, 5, 5, 5))).toBe(7); // 3.5+1+1.25+1 = 6.75
    expect(overallScore(bd(5, 10, 5, 5))).toBe(6); // 1.75+2+1.25+1 = 6.0
  });
  it("leaves out categories that were not assessed", () => {
    expect(overallScore(bd(null, 8, 6, 4))).toBe(6); // (1.6+1.5+.8)/.65 = 6.0
    expect(overallScore(bd(null, null, null, null))).toBeNull();
  });
});

describe("applyCaps", () => {
  it("changes nothing when facts are unknown", () => {
    expect(applyCaps(bd(9, 9, 9, 9), UNKNOWN_FACTS)).toEqual({ breakdown: bd(9, 9, 9, 9), adjustments: [] });
  });
  it("caps from missing tests, CI and README, and says why", () => {
    const { breakdown, adjustments } = applyCaps(bd(9, 8, 9, 7), { testFiles: 0, ciWorkflows: 0, readme: false, sourceFilesRead: 3 });
    expect(breakdown).toEqual(bd(7, 8, 6, 2));
    expect(adjustments).toEqual([
      "Completeness capped at 6: no test files found",
      "Code quality capped at 7: no test files found",
      "Documentation capped at 2: no README",
    ]);
  });
  it("does not report a cap that changed nothing", () => {
    expect(applyCaps(bd(5, 5, 4, 5), { testFiles: 0, ciWorkflows: 0, readme: true, sourceFilesRead: 2 }).adjustments).toEqual([]);
  });
  it("refuses to score code quality when no source was read", () => {
    const { breakdown, adjustments } = applyCaps(bd(8, 6, 6, 6), { testFiles: null, ciWorkflows: null, readme: true, sourceFilesRead: 0 });
    expect(breakdown.code_quality).toBeNull();
    expect(adjustments).toEqual(["Code quality not scored: no source files could be read"]);
  });
});
