import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("undici", async (original) => ({ ...(await original<typeof import("undici")>()), fetch: vi.fn() }));

const { fetch } = await import("undici");
const { fetchPublicPage, stripHtml } = await import("@/lib/context");
const mockFetch = vi.mocked(fetch);

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

describe("fetchPublicPage redirects", () => {
  beforeEach(() => mockFetch.mockReset());

  it("stops at a redirect to a private address without following it", async () => {
    mockFetch.mockResolvedValueOnce(redirect("https://169.254.169.254/latest/meta-data/") as never);
    expect(await fetchPublicPage(new URL("https://site.example/"), 1000)).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("stops at a redirect that downgrades to http", async () => {
    mockFetch.mockResolvedValueOnce(redirect("http://site.example/") as never);
    expect(await fetchPublicPage(new URL("https://site.example/"), 1000)).toBeNull();
  });

  it("follows a relative redirect on a public host", async () => {
    mockFetch.mockResolvedValueOnce(redirect("/home") as never).mockResolvedValueOnce(html("<h1>Hi</h1>") as never);
    expect(await fetchPublicPage(new URL("https://site.example/"), 1000)).toBe("<h1>Hi</h1>");
    expect(String(mockFetch.mock.calls[1][0])).toBe("https://site.example/home");
  });

  it("gives up after three redirects", async () => {
    mockFetch.mockImplementation(async () => redirect("https://site.example/again") as never);
    expect(await fetchPublicPage(new URL("https://site.example/"), 1000)).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("ignores pages that are not HTML", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { headers: { "content-type": "application/json" } }) as never);
    expect(await fetchPublicPage(new URL("https://site.example/"), 1000)).toBeNull();
  });
});

describe("stripHtml", () => {
  it("drops scripts, styles and tags", () => {
    expect(stripHtml("<style>a{}</style><p>Hi&nbsp;<b>there</b></p><script>steal()</script>", 100)).toBe("Hi there");
  });
});
