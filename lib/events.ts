import type { Review, Subject } from "./review-types";

// The review route streams one JSON object per line so the page can show
// each step as it really finishes, not on a timer.
export type StepId = "repo" | "site" | "review";
export type StepStatus = "running" | "done" | "failed" | "skipped";

export type ReviewEvent =
  | { type: "step"; step: StepId; status: StepStatus }
  // reused: true means this subject was already reviewed at this version and
  // the saved review is returned instead of a new, possibly different score.
  | { type: "result"; review: Review; subject: Subject; reviewedAt: string; reused: boolean }
  | { type: "error"; error: string };

export function encodeEvent(event: ReviewEvent) {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}
