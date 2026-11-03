import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Gemini: each model either answers or fails the way we say.
const behaviour = new Map<string, "quota" | "busy" | "missing" | "ok">();
const calls: string[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        const b = behaviour.get(model) ?? "ok";
        if (b === "quota") throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota"}}');
        if (b === "busy") throw new Error('{"error":{"code":503,"message":"high demand"}}');
        if (b === "missing") throw new Error('{"error":{"code":404,"status":"NOT_FOUND","message":"models/x is not found for API version v1beta"}}');
        return { text: JSON.stringify({ breakdown: { code_quality: 6, originality: 5, completeness: 6, documentation: 5 } }) };
      },
    };
  },
}));

const { generateReview, QuotaError } = await import("@/lib/review");
const input = { githubUrl: "https://github.com/a/b", liveUrl: null, description: "", githubContext: "ctx", liveSiteContext: null };
const run = () => generateReview(input, "key", Date.now() + 60_000);

describe("quota handling", () => {
  beforeEach(() => {
    behaviour.clear();
    calls.length = 0;
  });

  it("does not retry an exhausted model, and falls back to models with their own quota", async () => {
    behaviour.set("gemini-3.6-flash", "quota");
    const review = await run();
    expect(review?.score).toBeGreaterThan(0);
    expect(calls).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
  });

  it("reports a quota error when every model is out of quota", async () => {
    for (const m of ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]) behaviour.set(m, "quota");
    await expect(run()).rejects.toBeInstanceOf(QuotaError);
    expect(calls).toHaveLength(3);
  });

  it("skips a retired model to the fallbacks instead of giving up", async () => {
    behaviour.set("gemini-3.6-flash", "missing");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const review = await run();
    error.mockRestore();
    expect(review?.score).toBeGreaterThan(0);
    expect(calls).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
  });

  it("returns null, not a quota error, when models are only busy", async () => {
    for (const m of ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]) behaviour.set(m, "busy");
    await expect(run()).resolves.toBeNull();
  }, 15_000);
});
