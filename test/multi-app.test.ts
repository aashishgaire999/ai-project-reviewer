import { describe, expect, it } from "vitest";
import { appRoots, largestSources, pickFiles, type TreeEntry } from "@/lib/pick-files";

const blob = (path: string, size = 3_000): TreeEntry => ({ path, type: "blob", size });

// Shaped like the weather project: several apps side by side.
const weather = [
  blob("README.md"),
  blob("codyza-weather-react/app/package.json", 800),
  blob("codyza-weather-angular/package.json", 800),
  blob("codyza-weather-nest/package.json", 800),
  blob("registration-api-python/requirements.txt", 300),
  blob("supabase/functions/gateway/deno.json", 200),
  ...Array.from({ length: 60 }, (_, i) => blob(`codyza-weather-angular/src/app/part${i}.ts`, 9_000)),
  ...Array.from({ length: 5 }, (_, i) => blob(`codyza-weather-nest/src/weather${i}.service.ts`, 9_000)),
  blob("registration-api-python/main.py", 6_000),
  blob("supabase/functions/gateway/index.ts", 40_000),
  blob("codyza-weather-react/app/src/App.tsx", 5_000),
  blob("codyza-weather-nest/test/app.e2e-spec.ts", 4_000),
  blob("registration-api-python/tests/test_routes.py", 4_000),
];

describe("multi-app repos", () => {
  it("finds each app by its manifest", () => {
    expect(appRoots(weather.filter((f) => f.type === "blob"))).toEqual([
      "codyza-weather-angular", "codyza-weather-nest", "codyza-weather-react/app", "registration-api-python", "supabase/functions/gateway",
    ]);
  });

  it("reads every app instead of letting the biggest one use the whole budget", () => {
    const sources = pickFiles(weather).filter((p) => p.role === "source").map((p) => p.path);
    expect(sources).toContain("registration-api-python/main.py");
    expect(sources).toContain("supabase/functions/gateway/index.ts");
    expect(sources).toContain("codyza-weather-react/app/src/App.tsx");
    expect(sources.some((p) => p.startsWith("codyza-weather-nest/"))).toBe(true);
    // The big Angular app still gets read, just not exclusively.
    expect(sources.filter((p) => p.startsWith("codyza-weather-angular/")).length).toBeLessThan(sources.length);
  });

  it("reads each app's manifest and spreads tests across apps", () => {
    const picked = pickFiles(weather);
    expect(picked.filter((p) => p.role === "manifest").map((p) => p.path)).toEqual(expect.arrayContaining([
      "codyza-weather-angular/package.json", "registration-api-python/requirements.txt", "supabase/functions/gateway/deno.json",
    ]));
    const tests = picked.filter((p) => p.role === "test").map((p) => p.path);
    expect(tests).toEqual(expect.arrayContaining(["codyza-weather-nest/test/app.e2e-spec.ts", "registration-api-python/tests/test_routes.py"]));
  });

  it("leaves single-app repos as they were", () => {
    expect(appRoots([blob("package.json"), blob("src/index.ts")])).toEqual([]);
  });

  it("lists oversized source files, biggest first", () => {
    expect(largestSources(weather)).toEqual([{ path: "supabase/functions/gateway/index.ts", kb: 39 }]);
  });
});
