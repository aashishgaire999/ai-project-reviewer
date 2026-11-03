import { describe, expect, it } from "vitest";
import { pickFiles, readDepth, treeStats, type TreeEntry } from "@/lib/pick-files";

const blob = (path: string, size = 3_000): TreeEntry => ({ path, type: "blob", size });

describe("pickFiles", () => {
  it("reads the manifest, a CI workflow, one test and core source files", () => {
    const tree = [
      blob("package.json", 900),
      blob("package-lock.json", 90_000),
      blob(".github/workflows/ci.yml", 800),
      blob("src/index.ts", 5_000),
      blob("src/utils/format.ts", 2_000),
      blob("src/server.ts", 8_000),
      blob("src/index.test.ts", 3_500),
      blob("eslint.config.mjs", 600),
      blob("node_modules/react/index.js", 5_000),
      blob("dist/bundle.min.js", 50_000),
      blob("docs/logo.png", 20_000),
      { path: "src", type: "tree" },
    ];
    const picked = pickFiles(tree);
    expect(picked.map((p) => [p.path, p.role])).toEqual([
      ["package.json", "manifest"],
      [".github/workflows/ci.yml", "ci"],
      ["src/index.test.ts", "test"],
      ["src/server.ts", "source"],
      ["src/index.ts", "source"],
      ["src/utils/format.ts", "source"],
    ]);
  });

  it("never picks dependencies, build output, lockfiles, minified or oversized files", () => {
    const tree = [blob("node_modules/a/index.js"), blob("vendor/x.go"), blob("build/app.js"), blob("yarn.lock"), blob("a.min.js"), blob("huge.ts", 500_000)];
    expect(pickFiles(tree)).toEqual([]);
  });

  it("falls back to HTML and CSS for plain static sites", () => {
    const picked = pickFiles([blob("index.html", 4_000), blob("style.css", 2_000), blob("script.js", 300)]);
    expect(picked.map((p) => p.path)).toContain("index.html");
  });

  it("caps how many source files are read", () => {
    const tree = Array.from({ length: 30 }, (_, i) => blob(`src/file${i}.ts`));
    expect(pickFiles(tree).filter((p) => p.role === "source")).toHaveLength(5);
  });
});

describe("readDepth and treeStats", () => {
  it("calls a review deep only when real source files were read", () => {
    expect(readDepth([{ path: "a.ts", role: "source" }, { path: "b.ts", role: "source" }, { path: "c.ts", role: "source" }])).toBe("deep");
    expect(readDepth([{ path: "package.json", role: "manifest" }])).toBe("partial");
    expect(readDepth([])).toBe("surface");
  });
  it("counts source, test and CI files, ignoring dependencies", () => {
    expect(treeStats([blob("src/a.ts"), blob("src/a.test.ts"), blob(".github/workflows/ci.yml"), blob("node_modules/x.js")])).toEqual({
      files: 3, sourceFiles: 1, testFiles: 1, ciWorkflows: 1,
    });
  });
});
