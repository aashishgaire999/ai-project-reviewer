import { describe, expect, it } from "vitest";
import { commitMessageQuality, hygieneLines, summarizeCi } from "@/lib/hygiene";
import { applyCaps, UNKNOWN_FACTS } from "@/lib/scoring";

describe("summarizeCi", () => {
  it("counts completed runs on the default branch, newest first", () => {
    const runs = [
      { status: "completed", conclusion: "success", head_branch: "main" },
      { status: "in_progress", conclusion: null, head_branch: "main" },
      { status: "completed", conclusion: "failure", head_branch: "feature" },
      { status: "completed", conclusion: "failure", head_branch: "main" },
    ];
    expect(summarizeCi(runs, "main")).toEqual({ completed: 2, failed: 1, latest: "success" });
    expect(summarizeCi([], "main")).toBeNull();
  });
});

describe("commitMessageQuality", () => {
  it("spots messages that say nothing, ignoring merge commits", () => {
    const q = commitMessageQuality(["update", "Update", "fix", "Add rate limiting to the gateway\n\nbody", "Merge pull request #3 from x/y", "wip", "Update README.md", "Handle expired Turnstile tokens"]);
    expect(q).toEqual({ total: 7, generic: 5 });
  });
});

describe("hygieneLines", () => {
  it("reports what was measured", () => {
    const lines = hygieneLines({ completed: 10, failed: 4, latest: "failure" }, { total: 30, generic: 22 }, [{ path: "a.ts", kb: 41 }]);
    expect(lines.join("\n")).toContain("10 recent runs, 4 failed; latest run: failure");
    expect(lines.join("\n")).toContain("22 of the last 30");
    expect(lines.join("\n")).toContain("a.ts (41 KB)");
  });
});

describe("CI cap", () => {
  it("caps completeness at 7 when the latest CI run failed", () => {
    const r = applyCaps({ code_quality: 8, originality: 7, completeness: 9, documentation: 8 }, { ...UNKNOWN_FACTS, latestCiFailed: true });
    expect(r.breakdown.completeness).toBe(7);
    expect(r.adjustments).toEqual(["Completeness capped at 7: the latest CI run failed"]);
  });
});
