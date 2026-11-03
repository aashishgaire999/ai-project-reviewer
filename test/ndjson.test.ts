import { describe, expect, it } from "vitest";
import type { ReviewEvent } from "@/lib/events";
import { createEventParser } from "@/lib/ndjson";

function collect() {
  const events: ReviewEvent[] = [];
  const bad: string[] = [];
  return { events, bad, parser: createEventParser((e) => events.push(e), (l) => bad.push(l)) };
}

describe("createEventParser", () => {
  it("joins events split across chunks", () => {
    const { events, parser } = collect();
    parser.push('{"type":"step","step":"repo","sta');
    parser.push('tus":"done"}\n{"type":"error","error":"x"}');
    parser.end();
    expect(events).toEqual([{ type: "step", step: "repo", status: "done" }, { type: "error", error: "x" }]);
  });
  it("skips malformed and unknown lines instead of throwing", () => {
    const { events, bad, parser } = collect();
    expect(() => {
      parser.push('not json\n{"type":"mystery"}\n[1,2]\n\n{"type":"error","error":"ok"}\n');
      parser.end();
    }).not.toThrow();
    expect(events).toEqual([{ type: "error", error: "ok" }]);
    expect(bad).toEqual(["not json", '{"type":"mystery"}', "[1,2]"]);
  });
});
