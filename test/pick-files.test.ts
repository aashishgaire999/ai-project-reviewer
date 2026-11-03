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

  it("reads every source file when the repo fits the budget", () => {
    const tree = Array.from({ length: 30 }, (_, i) => blob(`src/file${i}.ts`));
    expect(pickFiles(tree).filter((p) => p.role === "source")).toHaveLength(30);
  });

  it("stops at the byte budget on big repos, most central files first", () => {
    const tree = [blob("src/index.ts", 5_000), ...Array.from({ length: 120 }, (_, i) => blob(`misc/deep/file${i}.ts`, 3_000))];
    const sources = pickFiles(tree).filter((p) => p.role === "source");
    expect(sources[0].path).toBe("src/index.ts");
    expect(sources).toHaveLength(1 + Math.floor((200_000 - 5_000) / 3_000));
  });

  it("counts a large file only up to the part that is read, and caps the file count", () => {
    const big = Array.from({ length: 20 }, (_, i) => blob(`src/big${i}.ts`, 90_000));
    expect(pickFiles(big).filter((p) => p.role === "source")).toHaveLength(10); // 10 x 20 KB read
    const many = Array.from({ length: 200 }, (_, i) => blob(`src/f${i}.ts`, 500));
    expect(pickFiles(many).filter((p) => p.role === "source")).toHaveLength(80);
  });

  it("reads up to three tests", () => {
    const tree = Array.from({ length: 6 }, (_, i) => blob(`test/t${i}.test.ts`));
    expect(pickFiles(tree).filter((p) => p.role === "test")).toHaveLength(3);
  });
});

describe("readDepth and treeStats", () => {
  it("labels depth from coverage", () => {
    expect(readDepth(12, 12)).toBe("full");
    expect(readDepth(8, 12)).toBe("deep");
    expect(readDepth(40, 212)).toBe("deep");
    expect(readDepth(3, 40)).toBe("partial");
    expect(readDepth(0, 10, true)).toBe("partial");
    expect(readDepth(0, 0)).toBe("surface");
  });
  it("counts source, test and CI files, ignoring dependencies", () => {
    expect(treeStats([blob("src/a.ts"), blob("src/a.test.ts"), blob(".github/workflows/ci.yml"), blob("node_modules/x.js"), blob("eslint.config.mjs")])).toEqual({
      files: 4, sourceFiles: 1, testFiles: 1, ciWorkflows: 1, // the config file exists but is not source
    });
  });
});
