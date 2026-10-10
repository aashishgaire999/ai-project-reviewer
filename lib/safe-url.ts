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

export type ResolvedAddress = { address: string; family?: number };
type Resolve = (hostname: string) => Promise<ResolvedAddress[]>;
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | { address: string; family: number }[],
  family?: number,
) => void;

const defaultResolve: Resolve = (hostname) => lookup(hostname, { all: true });

export class BlockedAddressError extends Error {
  code = "EBLOCKED";
}

// A DNS lookup for the HTTP client's sockets. It resolves the name, refuses
// it if ANY address is private, and hands the checked addresses straight to
// the connection. Because the check and the connect use the same answer,
// DNS rebinding (a safe answer for the check, a private one for the
// connect) has nothing to exploit.
export function safeLookup(resolve: Resolve = defaultResolve) {
  return (hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback) => {
    resolve(hostname).then(
      (addresses) => {
        const blocked = addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address));
        if (blocked) {
          callback(new BlockedAddressError(`${hostname} resolves to a private or unknown address`), "");
          return;
        }
        const withFamily = addresses.map(({ address, family }) => ({ address, family: family ?? isIP(address) }));
        if (typeof options === "object" && options?.all) callback(null, withFamily);
        else callback(null, withFamily[0].address, withFamily[0].family);
      },
      (error) => callback(error, ""),
    );
  };
}
