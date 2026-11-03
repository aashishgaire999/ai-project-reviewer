import { beforeEach, describe, expect, it, vi } from "vitest";

// The route end to end, with GitHub and Gemini replaced by fakes.
const gemini = { calls: 0, reply: "" };
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async () => {
        gemini.calls++;
        return { text: gemini.reply };
      },
    };
  },
}));

const github = { delayMs: 0 };
vi.mock("@/lib/context", async (original) => {
  const actual = await original<typeof import("@/lib/context")>();
  return {
    ...actual,
    fetchGithubContext: async (owner: string, repo: string) => {
      await new Promise((r) => setTimeout(r, github.delayMs));
      return {
        text: "FILE src/index.ts (source):\nexport const x = 1;",
        pushedAt: "2026-11-01T00:00:00Z",
        fullName: `${owner}/${repo}`,
        read: ["README", "src/index.ts"],
        depth: "full",
        coverage: { read: 1, total: 1 },
        facts: { testFiles: 0, ciWorkflows: 1, readme: true, sourceFilesRead: 1 },
      };
    },
    fetchLiveSiteContext: async () => null,
  };
});

process.env.GEMINI_API_KEY = "server-key";
delete process.env.REDIS_URL;
const { POST } = await import("@/app/api/review/route");

const post = (body: unknown, signal?: AbortSignal) =>
  POST(new Request("http://localhost/api/review", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `ip-${Math.random()}` }, signal }));

async function events(res: Response) {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(() => {
  gemini.calls = 0;
  gemini.reply = JSON.stringify({
    summary: "A tiny lib.",
    improvements: [{ title: "Add tests", detail: "There are none.", evidence: "src/index.ts" }],
    breakdown: { code_quality: 9, originality: 6, completeness: 9, documentation: 7 },
  });
  github.delayMs = 0;
});

describe("POST /api/review", () => {
  it("rejects a request with neither a repo nor a site", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/GitHub repo, a live site, or both/);
  });

  it("streams the steps and a capped, computed result", async () => {
    const list = await events(await post({ githubUrl: "https://github.com/a/b" }));
    expect(list.map((e) => e.type === "step" ? `${e.step}:${e.status}` : e.type)).toEqual([
      "repo:running", "site:skipped", "repo:done", "review:running", "review:done", "result",
    ]);
    const result = list.at(-1);
    expect(result.subject.label).toBe("a/b");
    // no tests: completeness capped 9 -> 6 and code quality 9 -> 7
    expect(result.review.breakdown).toEqual({ code_quality: 7, originality: 6, completeness: 6, documentation: 7 });
    expect(result.review.score).toBe(7);
    expect(result.review.grounded.adjustments).toHaveLength(2);
    expect(result.reused).toBe(false);
  });

  it("never calls Gemini once the visitor has cancelled", async () => {
    github.delayMs = 150;
    const visitor = new AbortController();
    const res = await post({ githubUrl: "https://github.com/a/b" }, visitor.signal);
    setTimeout(() => visitor.abort(), 30);
    await res.text().catch(() => "");
    await new Promise((r) => setTimeout(r, 250));
    expect(gemini.calls).toBe(0);
  });

  it("reports a model reply with no usable scores as a failed review", async () => {
    gemini.reply = '{"summary":"no scores"}';
    const list = await events(await post({ githubUrl: "https://github.com/a/b" }));
    expect(list.at(-1)).toEqual({ type: "error", error: expect.stringMatching(/didn't return a usable review/) });
  }, 20_000);
});
