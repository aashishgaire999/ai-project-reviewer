import { Agent, fetch as pinnedFetch } from "undici";
import { FILE_READ_BYTES, pickFiles, readDepth, SOURCE_BUDGET_BYTES, treeStats, type Picked, type TreeEntry } from "./pick-files";
import type { Coverage, Depth } from "./review-types";
import { UNKNOWN_FACTS, type Facts } from "./scoring";
import { extractMeta } from "./html-meta";
import { parsePublicHttpsUrl, safeLookup } from "./safe-url";

// Gathers what the reviewer actually looks at: repo metadata, README, root
// files and languages from GitHub, plus the live site's visible text. Every
// fetch is best-effort. A failure means less context, never a crash, and the
// prompt says when something could not be fetched.

const MAX_PAGE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

// Every connection to a visitor-supplied site goes through this agent, so
// each socket connects only to an address safeLookup has just approved.
const pinnedAgent = new Agent({ connect: { lookup: safeLookup() } });

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function stripHtml(html: string, maxLength: number) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export type GithubContext = {
  text: string;
  pushedAt: string | null;
  fullName: string;
  // Exactly which files the review saw, for the "Read:" line on the page.
  read: string[];
  depth: Depth;
  coverage: Coverage | null;
  facts: Facts;
};

const FILE_CHARS = FILE_READ_BYTES;
// How much source code to read, adjustable with READ_BUDGET_KB (default 200).
// Bigger reads see more of large repos but cost more Gemini tokens.
export function sourceBudget(env: Record<string, string | undefined> = process.env) {
  const kb = Number(env.READ_BUDGET_KB);
  return Number.isFinite(kb) && kb >= 20 && kb <= 2_000 ? Math.round(kb * 1024) : SOURCE_BUDGET_BYTES;
}
const PARALLEL_DOWNLOADS = 16;

// Runs `task` over `items` with at most `limit` in flight, keeping order.
async function mapLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await task(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function readRawFiles(owner: string, repo: string, branch: string, picked: Picked[], timeoutMs: number) {
  const ref = branch.split("/").map(encodeURIComponent).join("/");
  const results = await mapLimited(picked, PARALLEL_DOWNLOADS, async (p) => {
    const path = p.path.split("/").map(encodeURIComponent).join("/");
    const res = await fetchWithTimeout(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`, timeoutMs, {
      headers: { "User-Agent": "ai-project-reviewer" },
    });
    if (!res.ok) return null;
    return { ...p, text: await res.text() };
  });
  const files: (Picked & { text: string })[] = [];
  // Sources plus manifest, CI and tests, with some headroom.
  let budget = sourceBudget() + 40_000;
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value || budget <= 0) continue;
    const text = r.value.text.slice(0, Math.min(FILE_CHARS, budget));
    budget -= text.length;
    files.push({ ...r.value, text: text.length < r.value.text.length ? `${text}\n… (truncated)` : text });
  }
  return files;
}

// Why a repo couldn't be read, so the visitor gets the real reason.
export type GithubFailure = { reason: "not_found" | "rate_limited" | "unavailable"; resetAt?: number };

export function classifyGithubFailure(res: Response | null): GithubFailure {
  if (!res) return { reason: "unavailable" };
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  if (res.status === 429 || (res.status === 403 && remaining === "0")) {
    return { reason: "rate_limited", ...(Number.isFinite(reset) && reset > 0 ? { resetAt: reset * 1000 } : {}) };
  }
  if (res.status === 404 || res.status === 451) return { reason: "not_found" };
  return { reason: "unavailable" };
}

export class GithubFetchError extends Error {
  constructor(public failure: GithubFailure) {
    super(`GitHub fetch failed: ${failure.reason}`);
  }
}

export function githubFailureMessage(failure: GithubFailure, now = Date.now()) {
  if (failure.reason === "not_found") return "Couldn't find that repository. Check the link, and that the repo is public.";
  if (failure.reason === "rate_limited") {
    const minutes = failure.resetAt ? Math.max(1, Math.ceil((failure.resetAt - now) / 60_000)) : null;
    return `GitHub's request limit for this site is used up${minutes ? `; it resets in about ${minutes} min` : ""}. Try again then.`;
  }
  return "GitHub didn't respond. Try again in a minute.";
}

// Throws GithubFetchError when the repo itself can't be read.
export async function fetchGithubContext(owner: string, repo: string, timeoutMs: number): Promise<GithubContext | null> {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = {
    "User-Agent": "ai-project-reviewer",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const get = (path: string, accept?: string) =>
    fetchWithTimeout(`${base}${path}`, timeoutMs, { headers: accept ? { ...headers, Accept: accept } : headers });
  const [repoRes, readmeRes, langRes] = await Promise.allSettled([
    get(""),
    get("/readme", "application/vnd.github.raw+json"),
    get("/languages"),
  ]);
  const ok = (r: PromiseSettledResult<Response>) => (r.status === "fulfilled" && r.value.ok ? r.value : null);

  const meta = ok(repoRes);
  if (!meta) throw new GithubFetchError(classifyGithubFailure(repoRes.status === "fulfilled" ? repoRes.value : null));
  const parts: string[] = [];
  const read: string[] = [];
  let picked: Picked[] = [];
  let coverage: Coverage | null = null;
  const facts: Facts = { ...UNKNOWN_FACTS };
  let pushedAt: string | null = null;
  let fullName = `${owner}/${repo}`;
  try {
    const data = await meta.json();
    pushedAt = typeof data.pushed_at === "string" ? data.pushed_at : null;
    if (typeof data.full_name === "string") fullName = data.full_name;
    parts.push(
      `Repository: ${data.full_name}`,
      `Description: ${data.description || "none given"}`,
      `Stars: ${data.stargazers_count} · Forks: ${data.forks_count} · Open issues: ${data.open_issues_count}`,
      `Created: ${data.created_at?.slice(0, 10)} · Last push: ${data.pushed_at?.slice(0, 10)}`,
      `License: ${data.license?.spdx_id || "none"}`,
    );
    const langs = ok(langRes);
    if (langs) {
      const bytes: Record<string, number> = await langs.json();
      const total = Object.values(bytes).reduce((a, b) => a + b, 0);
      if (total) {
        parts.push(
          `Languages: ${Object.entries(bytes)
            .map(([name, size]) => `${name} ${((size / total) * 100).toFixed(1)}%`)
            .join(", ")}`,
        );
      }
    }
    const readme = ok(readmeRes);
    facts.readme = Boolean(readme);
    if (readme) read.push("README");
    parts.push(readme ? `README:\n${(await readme.text()).slice(0, 4000)}` : "README: none found");

    // The whole file list in one call, then the files worth reading.
    const branch = typeof data.default_branch === "string" ? data.default_branch : "main";
    const treeRes = await get(`/git/trees/${encodeURIComponent(branch)}?recursive=1`).catch(() => null);
    if (treeRes?.ok) {
      const tree = (await treeRes.json()) as { tree?: TreeEntry[]; truncated?: boolean };
      const entries = Array.isArray(tree.tree) ? tree.tree : [];
      const stats = treeStats(entries);
      // A truncated tree may be missing files, so it can't prove anything is absent.
      if (!tree.truncated) {
        facts.testFiles = stats.testFiles;
        facts.ciWorkflows = stats.ciWorkflows;
      }
      parts.push(
        `File tree: ${stats.files} files, ${stats.sourceFiles} source, ${stats.testFiles} test, ${stats.ciWorkflows} CI workflow(s)${tree.truncated ? " (very large repo, list truncated)" : ""}`,
        `Top-level: ${[...new Set(entries.map((e) => e.path.split("/")[0]))].slice(0, 40).join(", ")}`,
      );
      const files = await readRawFiles(owner, repo, branch, pickFiles(entries, { budget: sourceBudget() }), timeoutMs);
      picked = files;
      facts.sourceFilesRead = files.filter((f) => f.role === "source").length;
      coverage = { read: facts.sourceFilesRead, total: Math.max(stats.sourceFiles, facts.sourceFilesRead) };
      parts.push(`Coverage: read ${coverage.read} of ${coverage.total} source files${coverage.read < coverage.total ? " (the most central ones)" : " (all of them)"}.`);
      for (const f of files) {
        read.push(f.path);
        parts.push(`FILE ${f.path} (${f.role}):\n${f.text}`);
      }
    }
  } catch {
    // Keep whatever was collected before the failure.
  }
  return parts.length ? { text: parts.join("\n\n"), pushedAt, fullName, read, depth: readDepth(coverage?.read ?? 0, coverage?.total ?? 0, picked.some((p) => p.role === "manifest")), coverage, facts } : null;
}

// Follows redirects by hand so every hop's URL is re-checked; the pinned
// agent checks every address actually connected to.
export async function fetchPublicPage(start: URL, timeoutMs: number, agent: Agent = pinnedAgent): Promise<string | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await pinnedFetch(url.toString(), {
        dispatcher: agent,
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AIProjectReviewer/1.0)", Accept: "text/html" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = parsePublicHttpsUrl(new URL(res.headers.get("location") || "", url).toString());
      if (!next) return null;
      url = next;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) return null;
    return readCapped(res, MAX_PAGE_BYTES);
  }
  return null;
}

// Typed by the two reader methods used, so it accepts undici's and the DOM's streams alike.
type ByteReader = { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> };

async function readCapped(res: { body: { getReader(): ByteReader } | null }, maxBytes: number) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, maxBytes));
}

export async function fetchLiveSiteContext(liveUrl: URL, timeoutMs: number) {
  try {
    const html = await fetchPublicPage(liveUrl, timeoutMs);
    if (html === null) return null;
    const { title, description } = extractMeta(html);
    return [
      title && `Page title: ${title}`,
      description && `Meta description: ${description}`,
      `Visible page content: ${stripHtml(html, 2500) || "(empty, likely rendered by client-side JavaScript)"}`,
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return null;
  }
}
