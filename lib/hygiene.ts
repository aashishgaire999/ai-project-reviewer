// Repository hygiene signals the server reads from GitHub itself: how recent
// CI runs went, how informative commit messages are, and which source files
// have grown large. Facts, not model opinions, so they are passed to the
// model as context and the CI result can cap the score.

export type CiRun = { conclusion: string | null; status: string; head_branch?: string | null };
export type CiSummary = { completed: number; failed: number; latest: string | null };

export function summarizeCi(runs: CiRun[], branch: string): CiSummary | null {
  const done = runs.filter((r) => r.status === "completed" && (!r.head_branch || r.head_branch === branch));
  if (!done.length) return null;
  const failed = done.filter((r) => r.conclusion === "failure" || r.conclusion === "timed_out").length;
  return { completed: done.length, failed, latest: done[0].conclusion };
}

// Messages that say nothing about the change.
const GENERIC = /^(update[sd]?|updates?\s+\S+\.\w+|fix(es|ed)?|wip|changes?|commit|minor|test(ing)?|stuff|misc|edit(s|ed)?|save|done|final|init(ial)?|first commit|\.+|-+|asdf+)$/i;

export function commitMessageQuality(messages: string[]) {
  const subjects = messages.map((m) => (m.split("\n")[0] ?? "").trim()).filter(Boolean);
  // Merge commits are written by GitHub, not the author.
  const own = subjects.filter((s) => !/^Merge (pull request|branch)/.test(s));
  const generic = own.filter((s) => GENERIC.test(s) || s.length < 6).length;
  return { total: own.length, generic };
}

export type BigFile = { path: string; kb: number };

export function hygieneLines(ci: CiSummary | null, commits: { total: number; generic: number } | null, bigFiles: BigFile[]) {
  const lines: string[] = [];
  if (ci) lines.push(`CI history (default branch): ${ci.completed} recent runs, ${ci.failed} failed; latest run: ${ci.latest ?? "unknown"}.`);
  if (commits && commits.total > 0) lines.push(`Commit messages: ${commits.generic} of the last ${commits.total} say nothing specific (e.g. just "update").`);
  if (bigFiles.length) lines.push(`Largest source files: ${bigFiles.map((f) => `${f.path} (${f.kb} KB)`).join(", ")}.`);
  return lines;
}
