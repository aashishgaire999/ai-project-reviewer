import { parsePublicHttpsUrl, resolvesPublicly } from "./safe-url";

// Gathers what the reviewer actually looks at: repo metadata, README, root
// files and languages from GitHub, plus the live site's visible text. Every
// fetch is best-effort. A failure means less context, never a crash, and the
// prompt says when something could not be fetched.

const MAX_PAGE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

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

export async function fetchGithubContext(owner: string, repo: string, timeoutMs: number) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = {
    "User-Agent": "ai-project-reviewer",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const get = (path: string, accept?: string) =>
    fetchWithTimeout(`${base}${path}`, timeoutMs, { headers: accept ? { ...headers, Accept: accept } : headers });
  const [repoRes, readmeRes, rootRes, langRes] = await Promise.allSettled([
    get(""),
    get("/readme", "application/vnd.github.raw+json"),
    get("/contents/"),
    get("/languages"),
  ]);
  const ok = (r: PromiseSettledResult<Response>) => (r.status === "fulfilled" && r.value.ok ? r.value : null);

  const parts: string[] = [];
  try {
    const meta = ok(repoRes);
    if (!meta) return null;
    const data = await meta.json();
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
    const root = ok(rootRes);
    if (root) {
      const entries: { name: string; type: string }[] = await root.json();
      if (Array.isArray(entries)) {
        parts.push(`Top-level files: ${entries.map((e) => (e.type === "dir" ? `${e.name}/` : e.name)).join(", ")}`);
      }
    }
    const readme = ok(readmeRes);
    parts.push(readme ? `README:\n${(await readme.text()).slice(0, 4000)}` : "README: none found");
  } catch {
    // Keep whatever was collected before the failure.
  }
  return parts.join("\n") || null;
}

// Follows redirects by hand so every hop is checked against private addresses.
async function fetchPublicPage(start: URL, timeoutMs: number): Promise<string | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await resolvesPublicly(url.hostname))) return null;
    const res = await fetchWithTimeout(url.toString(), timeoutMs, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AIProjectReviewer/1.0)", Accept: "text/html" },
    });
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

async function readCapped(res: Response, maxBytes: number) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
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
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim();
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
