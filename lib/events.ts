import type { Review } from "./review-types";

// The review route streams one JSON object per line so the page can show
// each step as it really finishes, not on a timer.
export type StepId = "repo" | "site" | "review";
export type StepStatus = "running" | "done" | "failed" | "skipped";

export type ReviewEvent =
  | { type: "step"; step: StepId; status: StepStatus }
  | { type: "result"; review: Review; repository: string }
  | { type: "error"; error: string };

export function encodeEvent(event: ReviewEvent) {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}
