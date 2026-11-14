import { afterEach, describe, expect, it } from "vitest";
import { findWrapIssues, readHeroArt } from "@/registry/ouro/check/wrap-check";

// Ouro check's wrap rules, lone-word, tall-heading, one-word-line, hard-break and narrow-heading, and the hero art that
// dark-art compares, in a real browser: for each a page that fails it and the near misses that pass, and the opt-outs.
// Text is set in a monospace font at a width in ch, so its lines fall in the same places in every browser.
// scripts/check/check.test.mts runs the whole check on their fixture pages, and dark-art across a light and a dark run.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
  document.body.style.background = "";
  document.documentElement.style.background = "";
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.style.width = "600px";
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const mono = (size: number, width: string) => `font:${size}px/1.25 monospace;width:${width};margin:0;text-wrap:wrap`;
const of = (rule: string, options?: Parameters<typeof findWrapIssues>[0]) => findWrapIssues(options).filter((issue) => issue.rule === rule);

describe("findWrapIssues: lone-word", () => {
  it("finds a block whose last line holds one word, a hyphen's piece included, in a scroller too, named by its words", () => {
    render(`
      <p id="widow" style="${mono(16, "15ch")}">aaaa bbbb cccc dddd</p>
      <li style="${mono(16, "15ch")}">aaaa bbbb cccc-dddd</li>
      <h2 class="a b" style="${mono(16, "15ch")}">aaaa <code>bbbb</code> cccc <span>dddd</span></h2>
      <p style="${mono(16, "55ch")}">A paragraph whose words run on well past forty letters ends</p>
      <div style="max-height:1.5em;overflow:auto"><p style="${mono(16, "15ch")}">eeee ffff gggg hhhh</p></div>`);
    const issues = of("lone-word");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ['p#widow "aaaa bbbb cccc dddd"', 'ends on "dddd" alone: aaaa bbbb cccc / dddd'],
      ['li "aaaa bbbb cccc-dddd"', 'ends on "cccc-dddd" alone: aaaa bbbb cccc-dddd / cccc-dddd'],
      ['h2 "aaaa bbbb cccc dddd"', 'ends on "dddd" alone: aaaa bbbb cccc / dddd'],
      ['p "A paragraph whose words run on well past…"', 'ends on "ends" alone: A paragraph whose words run on well past forty letters / ends'],
      ['p "eeee ffff gggg hhhh"', 'ends on "hhhh" alone: eeee ffff gggg / hhhh'],
    ]);
    expect(host.querySelector("#widow")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
  });

  it("passes a last line of two words, three words in all, an unbreakable last token, a last word in code, a flex row, text a clamp or a hidden overflow cuts short, hidden text and allowed elements", () => {
    render(`
      <p style="${mono(16, "10ch")}">aaaa bbbb cccc dddd</p>
      <p style="${mono(16, "10ch")}">aaaa bbbb cccc</p>
      <p style="${mono(16, "15ch")}">aaaa bbbb cccc https://example.com/a</p>
      <p style="${mono(16, "15ch")}">aaaa bbbb cccc averyveryverylongtokenname</p>
      <p style="${mono(16, "15ch")}">aaaa bbbb cccc a</p>
      <p style="${mono(16, "15ch")}">aaaa bbbb cccc fn(x)</p>
      <p style="${mono(16, "15ch")}">aaaa bbbb cccc <code>dddd</code></p>
      <dd style="${mono(16, "15ch")}">Type: <kbd>aaaa bbbb cccc dddd</kbd></dd>
      <p style="${mono(16, "15ch")};display:flex;flex-wrap:wrap;gap:0 1ch"><span>aaaa</span><span>bbbb</span><span>cccc</span><span>dddd</span></p>
      <p style="${mono(16, "15ch")};display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden">aaaa bbbb cccc dddd</p>
      <div style="max-height:1.5em;overflow:hidden"><p style="${mono(16, "15ch")}">aaaa bbbb cccc dddd</p></div>
      <p hidden style="${mono(16, "15ch")}">aaaa bbbb cccc dddd</p>
      <p style="${mono(16, "15ch")};visibility:hidden">aaaa bbbb cccc dddd</p>
      <p style="${mono(16, "15ch")}">aaaa bbbb cccc <span style="position:absolute;width:1px;height:1px;overflow:hidden">dddd</span></p>
      <p style="${mono(16, "15ch")};height:20px"> </p>
      <pre style="${mono(16, "15ch")};white-space:pre-wrap">aaaa bbbb cccc dddd</pre>
      <ul><li><p style="${mono(16, "10ch")}">aaaa bbbb cccc dddd</p></li></ul>
      <div data-ouro-allow="lone-word" data-ouro-allow-why="a source as written"><p style="${mono(16, "15ch")}">aaaa bbbb cccc dddd</p></div>
      <p data-ouro-allow="all" data-ouro-allow-why="every rule waived here" style="${mono(16, "15ch")}">aaaa bbbb cccc dddd</p>`);
    expect(of("lone-word")).toEqual([]);
    host.insertAdjacentHTML("beforeend", `<p data-ouro-allow="lone-word" style="${mono(16, "15ch")}">aaaa bbbb cccc eeee</p>`);
    expect(of("lone-word").map((issue) => issue.element)).toEqual(['p "aaaa bbbb cccc eeee"']);
  });
});

describe("findWrapIssues: tall-heading", () => {
  it("finds an h1 at display size that runs five lines or more, and passes four lines, a small one and an h2", () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i).repeat(4)).join(" ");
    render(`
      <h1 style="${mono(40, "12ch")}">${words(10)}</h1>
      <h1 style="${mono(40, "12ch")}">${words(8)}</h1>
      <h1 style="${mono(20, "12ch")}">${words(10)}</h1>
      <h2 style="${mono(40, "12ch")}">${words(10)}</h2>`);
    expect(of("tall-heading").map(({ element, detail }) => [element, detail])).toEqual([
      ['h1 "aaaa bbbb cccc dddd eeee ffff gggg hhhh …"', "5 lines at 40px: aaaa bbbb / cccc dddd / eeee ffff / gggg hhhh / iiii jjjj"],
    ]);
    expect(of("tall-heading", { tallLines: 4 })).toHaveLength(2);
  });
});

describe("findWrapIssues: one-word-line", () => {
  it("finds big text of three lines or more with one word alone on a line before its last by choice, and passes words too long to share a line and small text", () => {
    render(`
      <p style="${mono(30, "10ch")}">aa <span style="display:inline-block">bbbb cc dd</span> ee</p>
      <p style="${mono(20, "10ch")}">aa <span style="display:inline-block">bbbb cc dd</span> ee</p>
      <p style="${mono(30, "10ch")}">aa bbbbbbbbbb cc dd ee</p>
      <p style="${mono(30, "10ch")};display:grid"><span>aa <span style="display:inline-block">bbbb cc dd</span> ee</span><span>ff</span></p>
      <p style="${mono(30, "10ch")}">aa bb cc dd ee</p>
      <p style="${mono(30, "14ch")}">aaaa bbbb cc https://example.com/x dd ee</p>`);
    expect(of("one-word-line").map(({ element, detail }) => [element, detail])).toEqual([['p "aa bbbb cc dd ee"', '"aa" alone on a line at 30px: aa / bbbb cc dd / ee']]);
  });
});

describe("findWrapIssues: hard-break", () => {
  it("finds a heading broken by a <br> or split into block-level line spans, and passes inline spans, one block and an icon's box", () => {
    render(`
      <h1>One line<br>and the next</h1>
      <h2><span style="display:block">When an agent</span> <span style="display:block">gets it wrong</span></h2>
      <h2><span>Inline</span> <em>spans</em></h2>
      <h2><span style="display:block">A kicker</span> and its title</h2>
      <h2><span style="display:block"><svg width="16" height="16"></svg>Icon</span><span style="display:block">Title</span></h2>
      <p>Not a heading<br>at all</p>`);
    expect(of("hard-break").map(({ element, detail }) => [element, detail])).toEqual([
      ['h1 "One lineand the next"', "a <br> breaks it by hand"],
      ['h2 "When an agent gets it wrong"', "its words are split into 2 block-level line spans"],
    ]);
  });
});

describe("findWrapIssues: narrow-heading", () => {
  it("finds a big heading that wraps under a max-width holding it to less than its column, and passes the near misses", () => {
    render(`
      <h1 style="${mono(32, "auto")};max-width:12ch">aaaa bbbb cccc dddd</h1>
      <h1 style="${mono(32, "auto")}">aaaa bbbb cccc dddd</h1>
      <h1 style="${mono(32, "auto")};max-width:12ch">aaaa</h1>
      <h2 style="${mono(20, "auto")};max-width:12ch">aaaa bbbb cccc dddd</h2>
      <div style="width:240px;padding:0 20px"><h2 style="${mono(32, "auto")};max-width:9ch">aaaa bbbb</h2></div>`);
    const issues = of("narrow-heading");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.element).toBe('h1 "aaaa bbbb cccc dddd"');
    expect(issues[0]!.detail).toMatch(/^max-width \d+(\.\d+)?px holds it to \d+px of the 600px its parent gives it: aaaa bbbb \/ cccc dddd$/);
  });
});

describe("readHeroArt", () => {
  const svg = (w: number, h: number, fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`)}`;
  const decoded = async () => Promise.all([...host.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));

  it("reads the largest picture in the first screen, marks it, and says whether the page is dark", async () => {
    render(`
      <img alt="" src="${svg(400, 100, "red")}" width="400" height="100">
      <img alt="A meadow at dawn, with Ouro and the friends of every product along a winding path" src="${svg(500, 200, "green")}" width="500" height="200">
      <img alt="Below the screen" src="${svg(600, 300, "blue")}" width="600" height="300" style="position:absolute;top:200vh">`);
    await decoded();
    const art = readHeroArt()!;
    expect(art.element).toBe('img "A meadow at dawn, with Ouro and the frie…"');
    expect(art.src).toContain("green");
    expect(art.darkPage).toBe(false);
    expect(host.querySelectorAll("img")[1]!.getAttribute("data-ouro-check-ref")).toBe(art.ref);
    document.body.style.background = "rgb(10, 10, 12)";
    expect(readHeroArt()!.darkPage).toBe(true);
    document.body.style.background = "transparent";
    document.documentElement.style.background = "rgb(250, 250, 250)";
    expect(readHeroArt()!.darkPage).toBe(false);
    document.documentElement.style.background = "transparent";
    expect(readHeroArt()!.darkPage).toBe(false);
    host.querySelectorAll("img")[1]!.alt = "";
    expect(readHeroArt({ minArea: 50000 })!.element).toBe("img");
  });

  it("finds nothing without a big picture in view, and leaves out a hidden or allowed one", async () => {
    render(`
      <img alt="Small" src="${svg(100, 100, "red")}" width="100" height="100">
      <img alt="Hidden" src="${svg(500, 200, "red")}" width="500" height="200" style="visibility:hidden">
      <div data-ouro-allow="dark-art" data-ouro-allow-why="the same art by day and night"><img alt="Allowed" src="${svg(500, 200, "red")}" width="500" height="200"></div>
      <div data-ouro-allow="dark-art"><img alt="No reason" src="${svg(400, 200, "red")}" width="400" height="200"></div>
      <div data-ouro-allow="lone-word" data-ouro-allow-why="another rule"><img alt="Other rule" src="${svg(300, 250, "red")}" width="300" height="250"></div>
      <img alt="Above" src="${svg(500, 200, "red")}" width="500" height="200" style="position:absolute;top:-400px">
      <img alt="Unloaded" width="500" height="200">`);
    await decoded();
    expect(readHeroArt()!.element).toBe('img "No reason"');
    host.querySelectorAll("div")[1]!.remove();
    expect(readHeroArt()!.element).toBe('img "Other rule"');
    host.querySelectorAll("div")[1]!.remove();
    expect(readHeroArt()).toBeNull();
  });
});
