import { CATEGORIES, type Category } from "./review-types";

// The overall score is computed here from the category scores rather than
// picked by the model, so it always matches the breakdown. Hard caps come
// from facts the server checked itself, which the model cannot talk past.

// Bump when scoring or how much code is read changes, so saved reviews made
// under older rules are redone instead of reused.
export const SCORING_VERSION = 3;

const WEIGHTS: Record<Category, number> = { code_quality: 0.35, completeness: 0.25, documentation: 0.2, originality: 0.2 };

export type Breakdown = Record<Category, number | null>;

// What the server knows for sure about the repo. null means unknown (for
// example the file tree could not be fetched), and then no cap applies.
export type Facts = {
  testFiles: number | null;
  ciWorkflows: number | null;
  readme: boolean | null;
  sourceFilesRead: number | null;
};

export const UNKNOWN_FACTS: Facts = { testFiles: null, ciWorkflows: null, readme: null, sourceFilesRead: null };

export function applyCaps(breakdown: Breakdown, facts: Facts) {
  const result = { ...breakdown };
  const adjustments: string[] = [];
  const cap = (key: Category, max: number, reason: string) => {
    const value = result[key];
    if (value !== null && value > max) {
      result[key] = max;
      adjustments.push(`${LABEL[key]} capped at ${max}: ${reason}`);
    }
  };
  if (facts.sourceFilesRead === 0 && result.code_quality !== null) {
    result.code_quality = null;
    adjustments.push("Code quality not scored: no source files could be read");
  }
  if (facts.testFiles === 0) {
    cap("completeness", 6, "no test files found");
    cap("code_quality", 7, "no test files found");
  }
  if (facts.ciWorkflows === 0) cap("completeness", 8, "no CI workflow found");
  if (facts.readme === false) cap("documentation", 2, "no README");
  return { breakdown: result, adjustments };
}

const LABEL: Record<Category, string> = {
  code_quality: "Code quality",
  originality: "Originality",
  completeness: "Completeness",
  documentation: "Documentation",
};

// Weighted average of the categories that were scored; categories marked
// not assessed (null) are left out and the weights renormalised.
export function overallScore(breakdown: Breakdown): number | null {
  let sum = 0;
  let weight = 0;
  for (const key of CATEGORIES) {
    const value = breakdown[key];
    if (value === null) continue;
    sum += value * WEIGHTS[key];
    weight += WEIGHTS[key];
  }
  if (weight === 0) return null;
  return Math.min(10, Math.max(1, Math.round(sum / weight)));
}
