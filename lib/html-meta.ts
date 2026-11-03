// Pulls the page title and description out of raw HTML. Handles attributes
// in any order, single, double or no quotes, tags split across lines, and
// falls back to Open Graph tags. Not a full HTML parser, on purpose: the
// page's text is only context for the review, so robust and dependency-free
// beats complete.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const clean = (text: string) => decodeEntities(text).replace(/\s+/g, " ").trim();

export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;
  for (const m of tag.matchAll(re)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return attrs;
}

export function extractMeta(html: string): { title?: string; description?: string } {
  // Comments and scripts can contain tag-like text that isn't the page's.
  const head = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));
  const find = (...keys: string[]) => {
    for (const key of keys) {
      const tag = metas.find((a) => (a.name ?? a.property ?? "").toLowerCase() === key && a.content);
      if (tag) return clean(tag.content);
    }
    return undefined;
  };
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = (titleTag && clean(titleTag)) || find("og:title", "twitter:title");
  const description = find("description", "og:description", "twitter:description");
  return { ...(title ? { title } : {}), ...(description ? { description } : {}) };
}
