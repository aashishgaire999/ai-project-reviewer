import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// The server fetches URLs that visitors type in. These checks stop it being
// pointed at this machine, a private network, or a cloud metadata endpoint.

export function isPrivateAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(host) === 6) {
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return host === "::" || host === "::1" || /^(fc|fd|fe[89ab])/.test(host) || host.startsWith("::ffff:");
  }
  return false;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return isPrivateAddress(host);
}

// Parses a visitor-supplied URL. Only plain https URLs to public-looking hosts pass.
export function parsePublicHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    if (isPrivateHostname(url.hostname)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function parseGithubRepo(value: unknown): { owner: string; repo: string } | null {
  const url = parsePublicHttpsUrl(value);
  if (!url || url.hostname.toLowerCase() !== "github.com") return null;
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  const name = /^[A-Za-z0-9_.-]{1,100}$/;
  if (!owner || !repo || !name.test(owner) || !name.test(repo)) return null;
  return { owner, repo: repo.replace(/\.git$/, "") };
}

type Lookup = (hostname: string) => Promise<{ address: string }[]>;
const defaultLookup: Lookup = (hostname) => lookup(hostname, { all: true });

// A public-looking name can still resolve to a private address, so check
// every address the name resolves to before fetching it.
export async function resolvesPublicly(hostname: string, resolve: Lookup = defaultLookup): Promise<boolean> {
  try {
    const addresses = await resolve(hostname);
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}
