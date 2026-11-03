import { describe, expect, it } from "vitest";
import { classifyGithubFailure, githubFailureMessage } from "@/lib/context";

const res = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

describe("classifyGithubFailure", () => {
  it("recognises GitHub's rate limit and when it resets", () => {
    expect(classifyGithubFailure(res(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" }))).toEqual({ reason: "rate_limited", resetAt: 1_800_000_000_000 });
    expect(classifyGithubFailure(res(429))).toEqual({ reason: "rate_limited" });
  });
  it("tells missing repos apart from other failures", () => {
    expect(classifyGithubFailure(res(404))).toEqual({ reason: "not_found" });
    expect(classifyGithubFailure(res(403, { "x-ratelimit-remaining": "12" }))).toEqual({ reason: "unavailable" });
    expect(classifyGithubFailure(res(500))).toEqual({ reason: "unavailable" });
    expect(classifyGithubFailure(null)).toEqual({ reason: "unavailable" });
  });
});

describe("githubFailureMessage", () => {
  it("says how long until the limit resets", () => {
    expect(githubFailureMessage({ reason: "rate_limited", resetAt: 10 * 60_000 }, 0)).toContain("about 10 min");
    expect(githubFailureMessage({ reason: "not_found" })).toContain("Couldn't find that repository");
  });
});
