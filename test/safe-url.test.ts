import { describe, expect, it } from "vitest";
import { isPrivateAddress, parseGithubRepo, parsePublicHttpsUrl, resolvesPublicly } from "@/lib/safe-url";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"])(
    "blocks %s",
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );
  it.each(["8.8.8.8", "140.82.112.3", "172.32.0.1", "2606:4700::1111"])("allows %s", (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );
});

describe("parsePublicHttpsUrl", () => {
  it("accepts public https URLs and drops the fragment", () => {
    expect(parsePublicHttpsUrl("https://example.com/a#b")?.toString()).toBe("https://example.com/a");
  });
  it.each([
    "http://example.com",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://metadata.google.internal/",
    "https://user:pass@example.com/",
    "https://example.com:8080/",
    "file:///etc/passwd",
    "not a url",
  ])("rejects %s", (value) => expect(parsePublicHttpsUrl(value)).toBeNull());
});

describe("parseGithubRepo", () => {
  it("extracts owner and repo", () => {
    expect(parseGithubRepo("https://github.com/vercel/next.js.git")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseGithubRepo("https://github.com/a/b/tree/main/src")).toEqual({ owner: "a", repo: "b" });
  });
  it.each(["https://gitlab.com/a/b", "https://github.com/a", "https://github.com/a/b%2F..", "http://github.com/a/b"])(
    "rejects %s",
    (value) => expect(parseGithubRepo(value)).toBeNull(),
  );
});

describe("resolvesPublicly", () => {
  it("rejects a public name that resolves to a private address", async () => {
    expect(await resolvesPublicly("evil.example", async () => [{ address: "8.8.8.8" }, { address: "10.0.0.5" }])).toBe(false);
  });
  it("accepts names that resolve only to public addresses", async () => {
    expect(await resolvesPublicly("ok.example", async () => [{ address: "93.184.216.34" }])).toBe(true);
  });
  it("rejects names that fail to resolve", async () => {
    expect(await resolvesPublicly("nx.example", async () => { throw new Error("ENOTFOUND"); })).toBe(false);
  });
});
