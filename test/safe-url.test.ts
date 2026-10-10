import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { Agent, fetch } from "undici";
import { BlockedAddressError, isPrivateAddress, parseGithubRepo, parsePublicHttpsUrl, safeLookup, type ResolvedAddress } from "@/lib/safe-url";

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

describe("parsePublicHttpsUrl with encoded or disguised hosts", () => {
  // The URL parser normalises these to 127.0.0.1 / ::ffff:7f00:1 before the check runs.
  it.each([
    "https://2130706433/",
    "https://0x7f.0.0.1/",
    "https://0177.0.0.1/",
    "https://127.1/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::]/",
    "https://LOCALHOST/",
    "https://localhost./",
    "https://foo.localhost/",
    "https://router.home.arpa/",
    "https://169.254.169.254/latest/meta-data/",
  ])("rejects %s", (value) => expect(parsePublicHttpsUrl(value)).toBeNull());
});

type LookupResult = { err: NodeJS.ErrnoException | null; address: unknown; family?: number };
function runLookup(resolve: (h: string) => Promise<ResolvedAddress[]>, options: { all?: boolean } = {}) {
  return new Promise<LookupResult>((done) =>
    safeLookup(resolve)("site.example", options, (err, address, family) => done({ err, address, family })),
  );
}

describe("safeLookup", () => {
  it("blocks a name if any address is private", async () => {
    const { err } = await runLookup(async () => [{ address: "93.184.216.34" }, { address: "10.0.0.5" }]);
    expect(err).toBeInstanceOf(BlockedAddressError);
  });
  it("blocks a name that resolves to nothing", async () => {
    expect((await runLookup(async () => [])).err).toBeInstanceOf(BlockedAddressError);
  });
  it("passes resolver failures through", async () => {
    const failure = Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    expect((await runLookup(async () => { throw failure; })).err).toBe(failure);
  });
  it("returns the checked address, with its family, for single lookups", async () => {
    expect(await runLookup(async () => [{ address: "93.184.216.34" }])).toEqual({ err: null, address: "93.184.216.34", family: 4 });
  });
  it("returns every checked address when the socket asks for all", async () => {
    const { address } = await runLookup(async () => [{ address: "2606:4700::1111" }, { address: "1.1.1.1", family: 4 }], { all: true });
    expect(address).toEqual([{ address: "2606:4700::1111", family: 6 }, { address: "1.1.1.1", family: 4 }]);
  });
  it("resolves once per connection, so a rebinding answer cannot slip past the check", async () => {
    const answers = ["93.184.216.34", "127.0.0.1"];
    let calls = 0;
    const resolve = async () => [{ address: answers[calls++] ?? "127.0.0.1" }];
    expect((await runLookup(resolve)).address).toBe("93.184.216.34");
    expect((await runLookup(resolve)).err).toBeInstanceOf(BlockedAddressError);
    expect(calls).toBe(2);
  });
});

describe("pinned agent against a real local server", () => {
  it("never connects when the name resolves to a private address", async () => {
    let hits = 0;
    const server = createServer((_, res) => { hits++; res.end("secret"); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    const toLocalhost = async () => [{ address: "127.0.0.1", family: 4 }];
    // Control: a plain lookup with the same answer does reach the server,
    // which proves the socket connects to whatever the lookup returns.
    const plainLookup: LookupFunction = (_h, o, cb) =>
      o?.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4);
    const plain = new Agent({ connect: { lookup: plainLookup } });
    const pinned = new Agent({ connect: { lookup: safeLookup(toLocalhost) } });
    try {
      expect(await (await fetch(`http://rebind.example:${port}/`, { dispatcher: plain })).text()).toBe("secret");
      expect(hits).toBe(1);
      await expect(fetch(`http://rebind.example:${port}/`, { dispatcher: pinned })).rejects.toThrow();
      expect(hits).toBe(1);
    } finally {
      await Promise.all([plain.close(), pinned.close()]);
      server.close();
    }
  });
});
