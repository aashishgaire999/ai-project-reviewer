import type { ReviewEvent } from "./events";

const TYPES = new Set(["step", "result", "error"]);

// Reads the review stream: one JSON event per line, where a network chunk
// can end mid-line. A malformed or unknown line is skipped and reported
// instead of throwing and breaking the whole review.
export function createEventParser(onEvent: (event: ReviewEvent) => void, onBadLine: (line: string) => void = () => {}) {
  let buffer = "";
  const handle = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event && typeof event === "object" && TYPES.has(event.type)) onEvent(event as ReviewEvent);
      else onBadLine(line);
    } catch {
      onBadLine(line);
    }
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    },
    end() {
      handle(buffer);
      buffer = "";
    },
  };
}
