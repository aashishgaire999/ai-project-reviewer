import type { Depth } from "./review-types";

// Chooses which files of a repo are worth reading for a review: the project
// manifest, one CI workflow, one test, and the most central source files.
// Pure, so the choices are easy to test.

export type TreeEntry = { path: string; type: "blob" | "tree" | string; size?: number };
export type Picked = { path: string; role: "manifest" | "ci" | "test" | "source" };

const SKIP_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", ".next", ".nuxt", "coverage", "target", "__pycache__",
  ".git", ".venv", "venv", "env", "third_party", "third-party", "generated", "gen", ".turbo", ".cache", "bin", "obj",
]);
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Cargo.lock", "poetry.lock", "Pipfile.lock", "go.sum", "composer.lock", "Gemfile.lock"]);
const MANIFESTS = [
  "package.json", "pyproject.toml", "requirements.txt", "setup.py", "go.mod", "Cargo.toml", "pom.xml",
  "build.gradle", "build.gradle.kts", "composer.json", "Gemfile", "pubspec.yaml", "mix.exs", "Package.swift", "deno.json",
];
const MANIFEST_NAMES = new Set(MANIFESTS);
const MAX_APP_MANIFESTS = 6;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|rb|php|cs|cpp|cc|c|h|hpp|swift|dart|vue|svelte|scala|ex|exs|lua|sh)$/i;
// Markup counts as source only when a repo has nothing else (plain HTML/CSS sites).
const MARKUP_EXT = /\.(html|css|scss)$/i;
const TEST = /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|(^|\/)test_[^/]+\.py$/i;
const CONFIG = /(^|\/)[^/]*\.config\.[a-z]+$|(^|\/)\.[^/]+rc(\.[a-z]+)?$|(^|\/)(eslint|prettier|jest|vitest|babel|webpack|rollup|tailwind|postcss|next\.config)/i;
const MINIFIED = /\.min\.[a-z]+$|\.map$|\.d\.ts$/i;
const ENTRY_NAME = /(^|\/)(index|main|app|server|page|route|cli|lib|core|handler|api|mod)\.[a-z]+$/i;
const CORE_DIR = /(^|\/)(src|app|lib|pkg|cmd|internal|server|api|core|components|routes|pages)\//i;

const MAX_FILE_BYTES = 100_000;

function skipped(path: string) {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  return parts.slice(0, -1).some((p) => SKIP_DIRS.has(p) || (p.startsWith(".") && p !== ".github")) || LOCKFILES.has(name) || MINIFIED.test(path);
}

function sourceScore(path: string, size: number) {
  const depth = path.split("/").length - 1;
  let score = 0;
  if (ENTRY_NAME.test(path)) score += 3;
  if (CORE_DIR.test(path)) score += 2;
  score -= depth * 0.4;
  if (size < 400) score -= 2; // too small to say much
  else if (size <= 30_000) score += 1;
  return score;
}

// Source files a review could read (excluding tests and config). Plain
// HTML/CSS sites count their markup, because there the markup is the core.
function sourceCandidates(files: TreeEntry[]) {
  const bytes = (list: TreeEntry[]) => list.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const code = files.filter((f) => CODE_EXT.test(f.path) && !TEST.test(f.path) && !CONFIG.test(f.path));
  const markup = files.filter((f) => MARKUP_EXT.test(f.path));
  return bytes(markup) > bytes(code) ? [...code, ...markup] : code;
}

function readable(tree: TreeEntry[]) {
  return tree.filter((e) => e.type === "blob" && !skipped(e.path) && (e.size ?? 0) > 0 && (e.size ?? 0) <= MAX_FILE_BYTES);
}

// How much source to read. Large files count only up to the part that is read.
export const SOURCE_BUDGET_BYTES = 200_000;
export const FILE_READ_BYTES = 20_000;
export const MAX_SOURCE_FILES = 80;
const MAX_TESTS = 3;

// Folders that are apps of their own: each holds a manifest (package.json,
// pyproject.toml, ...) up to three levels down (e.g. supabase/functions/x). A repo with two or more is a
// multi-app repo, e.g. a frontend, an API and edge functions side by side.
export function appRoots(files: TreeEntry[]): string[] {
  const roots = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    const name = parts[parts.length - 1];
    if (parts.length >= 2 && parts.length <= 4 && MANIFEST_NAMES.has(name)) roots.add(parts.slice(0, -1).join("/"));
  }
  // Keep the outermost folder when one app sits inside another.
  return [...roots].filter((r) => ![...roots].some((o) => o !== r && r.startsWith(`${o}/`))).sort();
}

const rootOf = (path: string, roots: string[]) => roots.find((r) => path.startsWith(`${r}/`)) ?? "";

// Takes one item from each group in turn until every group is empty, so no
// single app can use up the whole budget.
function roundRobin<T>(groups: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; groups.some((g) => i < g.length); i++) for (const g of groups) if (i < g.length) out.push(g[i]);
  return out;
}

// Every source file when the repo is small enough; otherwise the most central
// ones until the budget is spent, shared fairly between the apps of a
// multi-app repo.
export function pickFiles(tree: TreeEntry[], { budget = SOURCE_BUDGET_BYTES, maxSources = MAX_SOURCE_FILES } = {}): Picked[] {
  const files = readable(tree);
  const picked: Picked[] = [];
  const roots = appRoots(files);
  const multiApp = roots.length >= 2;

  const manifest = MANIFESTS.map((name) => files.find((f) => f.path === name)).find(Boolean)
    ?? MANIFESTS.map((name) => files.find((f) => f.path.split("/").length === 2 && f.path.endsWith(`/${name}`))).find(Boolean);
  if (manifest) picked.push({ path: manifest.path, role: "manifest" });
  if (multiApp) {
    for (const root of roots.slice(0, MAX_APP_MANIFESTS)) {
      const m = MANIFESTS.map((name) => files.find((f) => f.path === `${root}/${name}`)).find(Boolean);
      if (m && m.path !== manifest?.path) picked.push({ path: m.path, role: "manifest" });
    }
  }

  const ci = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f.path)).sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
  if (ci) picked.push({ path: ci.path, role: "ci" });

  const byTestSize = (a: TreeEntry, b: TreeEntry) => Math.abs((a.size ?? 0) - 4_000) - Math.abs((b.size ?? 0) - 4_000);
  const allTests = files.filter((f) => CODE_EXT.test(f.path) && TEST.test(f.path));
  const testGroups = multiApp
    ? [...roots, ""].map((r) => allTests.filter((t) => rootOf(t.path, roots) === r).sort(byTestSize))
    : [[...allTests].sort(byTestSize)];
  for (const t of roundRobin(testGroups).slice(0, multiApp ? MAX_TESTS + 1 : MAX_TESTS)) picked.push({ path: t.path, role: "test" });

  const rank = (list: TreeEntry[]) =>
    list
      .map((f) => ({ f, score: sourceScore(f.path, f.size ?? 0) }))
      .sort((a, b) => b.score - a.score || (b.f.size ?? 0) - (a.f.size ?? 0))
      .map((x) => x.f);
  const sources = sourceCandidates(files);
  const ordered = multiApp ? roundRobin([...roots, ""].map((r) => rank(sources.filter((f) => rootOf(f.path, roots) === r)))) : rank(sources);

  let left = budget;
  let count = 0;
  for (const f of ordered) {
    if (count >= maxSources) break;
    const cost = Math.min(f.size ?? 0, FILE_READ_BYTES);
    if (cost > left) continue; // a smaller file may still fit
    picked.push({ path: f.path, role: "source" });
    left -= cost;
    count++;
  }
  return picked;
}

// The biggest source files, a common sign of modules doing too much.
export function largestSources(tree: TreeEntry[], n = 5, minBytes = 20_000) {
  return sourceCandidates(tree.filter((e) => e.type === "blob" && !skipped(e.path)))
    .filter((f) => (f.size ?? 0) >= minBytes)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, n)
    .map((f) => ({ path: f.path, kb: Math.round((f.size ?? 0) / 1024) }));
}

export function treeStats(tree: TreeEntry[]) {
  const files = tree.filter((e) => e.type === "blob" && !skipped(e.path));
  const code = files.filter((f) => CODE_EXT.test(f.path));
  return {
    files: files.length,
    // Source files a review could read: the denominator for coverage.
    sourceFiles: sourceCandidates(readable(tree)).length,
    testFiles: code.filter((f) => TEST.test(f.path)).length,
    ciWorkflows: files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f.path)).length,
  };
}

// How much of the code the review actually saw, decided here rather than by
// the model, so the label on the page is a fact.
export function readDepth(sourcesRead: number, sourceTotal: number, hasManifest = false): Depth {
  if (sourceTotal > 0 && sourcesRead >= sourceTotal) return "full";
  if (sourcesRead >= 3 && (sourcesRead / Math.max(1, sourceTotal) >= 0.5 || sourcesRead >= 15)) return "deep";
  if (sourcesRead >= 1 || hasManifest) return "partial";
  return "surface";
}
