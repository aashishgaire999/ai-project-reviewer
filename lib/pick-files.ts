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
  "build.gradle", "build.gradle.kts", "composer.json", "Gemfile", "pubspec.yaml", "mix.exs", "Package.swift",
];
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

export function pickFiles(tree: TreeEntry[], maxSource = 5): Picked[] {
  const files = tree.filter((e) => e.type === "blob" && !skipped(e.path) && (e.size ?? 0) > 0 && (e.size ?? 0) <= MAX_FILE_BYTES);
  const picked: Picked[] = [];

  const manifest = MANIFESTS.map((name) => files.find((f) => f.path === name)).find(Boolean)
    ?? MANIFESTS.map((name) => files.find((f) => f.path.split("/").length === 2 && f.path.endsWith(`/${name}`))).find(Boolean);
  if (manifest) picked.push({ path: manifest.path, role: "manifest" });

  const ci = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f.path)).sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
  if (ci) picked.push({ path: ci.path, role: "ci" });

  const code = files.filter((f) => CODE_EXT.test(f.path));
  const tests = code.filter((f) => TEST.test(f.path));
  const test = [...tests].sort((a, b) => Math.abs((a.size ?? 0) - 4_000) - Math.abs((b.size ?? 0) - 4_000))[0];
  if (test) picked.push({ path: test.path, role: "test" });

  const bytes = (list: TreeEntry[]) => list.reduce((sum, f) => sum + (f.size ?? 0), 0);
  let sources = code.filter((f) => !TEST.test(f.path) && !CONFIG.test(f.path));
  // Plain HTML/CSS sites: when markup outweighs the code, the markup is the core.
  const markup = files.filter((f) => MARKUP_EXT.test(f.path));
  if (bytes(markup) > bytes(sources)) sources = [...sources, ...markup];
  const ranked = sources
    .map((f) => ({ f, score: sourceScore(f.path, f.size ?? 0) }))
    .sort((a, b) => b.score - a.score || (b.f.size ?? 0) - (a.f.size ?? 0))
    .slice(0, maxSource);
  for (const { f } of ranked) picked.push({ path: f.path, role: "source" });

  return picked;
}

export function treeStats(tree: TreeEntry[]) {
  const files = tree.filter((e) => e.type === "blob" && !skipped(e.path));
  const code = files.filter((f) => CODE_EXT.test(f.path));
  return {
    files: files.length,
    sourceFiles: code.filter((f) => !TEST.test(f.path)).length,
    testFiles: code.filter((f) => TEST.test(f.path)).length,
    ciWorkflows: files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f.path)).length,
  };
}


// How much of the code the review actually saw, decided here rather than by
// the model, so the label on the page is a fact.
export function readDepth(picked: Picked[]): Depth {
  const sources = picked.filter((p) => p.role === "source").length;
  if (sources >= 3) return "deep";
  if (sources >= 1 || picked.some((p) => p.role === "manifest")) return "partial";
  return "surface";
}
