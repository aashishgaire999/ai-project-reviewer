import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Gemini where a model can hang until its attempt is cancelled.
const behaviour = new Map<string, "hang" | "ok">();
const calls: { model: string; chars: number }[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: ({ model, contents, config }: { model: string; contents: string; config: { abortSignal?: AbortSignal } }) => {
        calls.push({ model, chars: contents.length });
        if (behaviour.get(model) === "hang") {
          return new Promise((_, reject) => config.abortSignal?.addEventListener("abort", () => reject(new Error("aborted"))));
        }
        return Promise.resolve({
          text: JSON.stringify({
            breakdown: { code_quality: 7, originality: 6, completeness: 5, documentation: 8 },
            reasons: { code_quality: "Typed modules with small functions.", completeness: "No deploy step." },
          }),
        });
      },
    };
  },
}));

const { attemptTimeout, generateReview, parseReview, trimContext } = await import("@/lib/review");

const file = (path: string, role: string, kb: number) => `FILE ${path} (${role}):\n${"x".repeat(kb * 1024)}`;
const context = [
  "Repository: a/b",
  "Coverage: read 3 of 3 source files (all of them).",
  file("package.json", "manifest", 1),
  file("src/a.ts", "source", 30),
  file("src/b.ts", "source", 30),
  file("src/c.ts", "source", 30),
].join("\n\n");

describe("trimContext", () => {
  it("keeps the header and the first files, dropping whole files from the end", () => {
    const cut = trimContext(context, 40_000);
    expect(cut.kept.map((f) => f.path)).toEqual(["package.json", "src/a.ts"]);
    expect(cut.dropped).toBe(2);
    expect(cut.text.startsWith("Repository: a/b")).toBe(true);
    expect(cut.text).not.toContain("src/b.ts");
  });
  it("changes nothing when the context already fits", () => {
    const cut = trimContext(context, 1_000_000);
    expect(cut.dropped).toBe(0);
    expect(cut.text).toBe(context);
  });
});

describe("attemptTimeout", () => {
  it("gives the first attempt 30s and splits what is left between the rest", () => {
    expect(attemptTimeout(50_000, 4, true)).toBe(30_000);
    expect(attemptTimeout(20_000, 2, false)).toBe(10_000);
    expect(attemptTimeout(5_000, 3, false)).toBe(8_000);
  });
});

describe("parseReview reasons", () => {
  it("keeps one reason per scored category and drops the rest", () => {
    const review = parseReview(
      JSON.stringify({
        breakdown: { code_quality: null, originality: 6, completeness: 5, documentation: 8 },
        reasons: { code_quality: "Not read.", originality: "A known idea.", documentation: 42 },
      }),
      { repository: true, liveSite: false },
    );
    expect(review.reasons).toEqual({ originality: "A known idea." });
  });
  it("leaves reasons out when the model gives none", () => {
    const review = parseReview(JSON.stringify({ breakdown: { code_quality: 5, originality: 5, completeness: 5, documentation: 5 } }), { repository: true, liveSite: false });
    expect(review.reasons).toBeUndefined();
  });
});

describe("a slow model", () => {
  beforeEach(() => {
    behaviour.clear();
    calls.length = 0;
  });

  it("is cancelled, and the fallback gets a shorter context and an honest read count", async () => {
    vi.useFakeTimers();
    behaviour.set("gemini-3.6-flash", "hang");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = {
      githubUrl: "https://github.com/a/b",
      liveUrl: null,
      description: "",
      githubContext: context,
      liveSiteContext: null,
      read: ["README", "package.json", "src/a.ts", "src/b.ts", "src/c.ts"],
      depth: "full" as const,
      coverage: { read: 3, total: 3 },
      facts: { testFiles: 1, ciWorkflows: 1, latestCiFailed: false, readme: true, sourceFilesRead: 3 },
    };
    const pending = generateReview(input, "key", Date.now() + 50_000);
    await vi.advanceTimersByTimeAsync(31_000);
    const review = await pending;
    error.mockRestore();
    vi.useRealTimers();

    // The primary was not retried at full size after timing out.
    expect(calls.map((c) => c.model)).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    expect(calls[1].chars).toBeLessThan(calls[0].chars);
    expect(review?.grounded.read).toEqual(["README", "package.json", "src/a.ts"]);
    expect(review?.grounded.coverage).toEqual({ read: 1, total: 3 });
    expect(review?.grounded.depth).toBe("partial");
    expect(review?.grounded.adjustments).toContain("Read 2 files instead of 4: the AI service was slow");
  });
});
