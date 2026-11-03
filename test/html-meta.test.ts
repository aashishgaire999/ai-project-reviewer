import { describe, expect, it } from "vitest";
import { decodeEntities, extractMeta, parseAttributes } from "@/lib/html-meta";

describe("extractMeta", () => {
  it("reads the description whatever the attribute order or quoting", () => {
    expect(extractMeta(`<meta content="Fast notes" name="description">`).description).toBe("Fast notes");
    expect(extractMeta(`<meta name='description' content='Single quoted'>`).description).toBe("Single quoted");
    expect(extractMeta(`<META NAME=description CONTENT=Unquoted>`).description).toBe("Unquoted");
  });
  it("handles tags across lines and decodes entities", () => {
    const html = `<title>\n  Tom &amp; Jerry&#39;s   app\n</title>\n<meta\n  name="description"\n  content="Cats &lt;3 &#x1F600;"\n/>`;
    expect(extractMeta(html)).toEqual({ title: "Tom & Jerry's app", description: "Cats <3 😀" });
  });
  it("falls back to Open Graph tags", () => {
    expect(extractMeta(`<meta property="og:title" content="OG T"><meta property="og:description" content="OG D">`)).toEqual({ title: "OG T", description: "OG D" });
  });
  it("ignores tag-like text inside comments and scripts", () => {
    const html = `<!-- <title>Old</title> --><script>const t = "<title>Fake</title>"</script><title>Real</title>`;
    expect(extractMeta(html).title).toBe("Real");
  });
  it("returns nothing for pages without metadata", () => {
    expect(extractMeta("<p>hello</p>")).toEqual({});
  });
});

describe("helpers", () => {
  it("parses attributes in any form", () => {
    expect(parseAttributes(`<a href="x" data-id='7' hidden title=plain>`)).toEqual({ href: "x", "data-id": "7", title: "plain" });
  });
  it("leaves unknown or invalid entities alone", () => {
    expect(decodeEntities("&bogus; &#0; &#xZZ;")).toBe("&bogus; &#0; &#xZZ;");
  });
});
