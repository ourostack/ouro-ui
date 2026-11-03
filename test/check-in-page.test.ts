import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ALIASES, boxOf, decodeImages, isReady, listAllowances, listenForReady, outline, runAxe } from "@/registry/ouro/check/in-page";
import { findOverlaps } from "@/registry/ouro/check/overlap-check";
import { findSizeIssues } from "@/registry/ouro/check/size-check";

// Ouro check's in-page side (ouro-check), in a real browser: for each rule a page that fails it and one that passes,
// and the opt-outs. scripts/check.test.mjs runs the whole check on fixture pages in Chromium.

const state = window as unknown as { __ouroCheckRef?: number; __ouroCheckReady?: boolean; axe?: typeof axe };
let host: HTMLDivElement;
const urls: string[] = [];

beforeAll(() => {
  state.axe = axe;
});
afterEach(() => {
  host?.remove();
  document.body.removeAttribute("data-ouro-allow");
  document.body.removeAttribute("data-ouro-allow-why");
  document.documentElement.classList.remove("app-ready");
  delete state.__ouroCheckRef;
  delete state.__ouroCheckReady;
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  window.scrollTo(0, 0);
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

/** A PNG of `width`×`height` pixels, as a blob: URL. */
async function picture(width: number, height: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#3a7";
  context.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), "image/png"));
  const url = URL.createObjectURL(blob);
  urls.push(url);
  return url;
}

const rules = (issues: { rule: string }[]) => issues.map((issue) => issue.rule);
const LONG = "Prose that runs the whole width of a wide screen is hard to read, because the eye loses its place on the way back to the start of the next line.";

describe("findSizeIssues: sideways-scroll", () => {
  it("names the outermost elements that stick out past the screen, and how far", async () => {
    render(`<div id="strip" style="width:${innerWidth + 300}px;height:20px"><span style="display:inline-block;width:10px">x</span></div>`);
    const [issue] = await findSizeIssues();
    expect(issue).toMatchObject({ rule: "sideways-scroll", element: "div#strip", ref: "s1" });
    expect(issue!.detail).toMatch(/^\d+px wider than the screen$/);
    expect(document.getElementById("strip")!.getAttribute("data-ouro-check-ref")).toBe("s1");
  });

  it("passes a page whose wide content scrolls in its own box", async () => {
    render(`<div style="overflow-x:auto"><div style="width:${innerWidth + 300}px;height:20px"></div></div>`);
    expect(await findSizeIssues()).toEqual([]);
  });

  it("names the page when only an allowed element sticks out, and passes a page that allows it with a reason", async () => {
    render(`<div data-scroll-x="a timeline people pan sideways" style="width:${innerWidth + 300}px;height:20px"></div><div data-scroll-x="" style="width:10px;height:1px"></div>`);
    expect(await findSizeIssues()).toMatchObject([{ rule: "sideways-scroll", element: "the page" }]);
    document.body.setAttribute("data-ouro-allow", "sideways-scroll");
    expect(rules(await findSizeIssues())).toEqual(["sideways-scroll"]);
    document.body.setAttribute("data-ouro-allow-why", "a timeline people pan sideways");
    expect(await findSizeIssues()).toEqual([]);
  });
});

describe("findSizeIssues: clipped-text", () => {
  it("finds text cut across by its box, and an ellipsis or a line clamp that leaves the whole text nowhere", async () => {
    render(`
      <button id="save" class="a b c d" style="width:60px;white-space:nowrap;overflow:hidden">Save every change you made today</button>
      <span aria-hidden="true" style="display:block;width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">An ellipsis cuts this</span>
      <p aria-hidden="true" title="Only part of it" style="width:120px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden">Clamped to one line, but this text needs three or four</p>
      <p style="width:120px;height:20px;overflow:hidden;line-height:20px">Cut below by a fixed height, this text needs several lines</p>`);
    const issues = await findSizeIssues();
    expect(rules(issues)).toEqual(["clipped-text", "clipped-text", "clipped-text", "clipped-text"]);
    expect(issues[0]!.element).toBe('button#save.a.b.c "Save every change you made today"');
    expect(issues[0]!.detail).toMatch(/^\d+px cut across$/);
    expect(issues[1]!.element).toBe('span "An ellipsis cuts this"');
    expect(issues[1]!.detail).toMatch(/^\d+px cut across \(ellipsis\)$/);
    expect(issues[2]!.element).toMatch(/^p "Clamped to one line, but this text needs…"$/);
    expect(issues[2]!.detail).toMatch(/^\d+px cut below \(line clamp\)$/);
    expect(issues[3]!.detail).toMatch(/^\d+px cut below$/);
  });

  it("passes text that fits, hidden text, a block with block children, allowed clamps, and truncation whose whole text is still there", async () => {
    render(`
      <button style="overflow:hidden">Save</button>
      <div style="width:60px;overflow:hidden;white-space:nowrap">Text <div>and a block inside it</div></div>
      <div style="width:300px;overflow:hidden;white-space:nowrap"><b>only</b> <br>inline <span style="display:contents">children</span> fit</div>
      <div style="width:60px;overflow:hidden;white-space:nowrap" hidden>Hidden text that does not fit</div>
      <div style="width:60px;overflow:hidden;white-space:nowrap;opacity:0">Faded text that does not fit</div>
      <div style="width:60px;overflow:hidden;white-space:nowrap;visibility:hidden">Invisible text that does not fit</div>
      <div style="width:1px;overflow:hidden;white-space:nowrap">Too small to read</div>
      <div style="width:60px;overflow-y:hidden;height:200px">Tall enough below</div>
      <div style="width:300px;overflow-x:clip">Fits across</div>
      <p data-clip-ok="a code that fits once copied" style="width:60px;overflow:hidden;white-space:nowrap">The plain alias allows this</p>
      <p data-ouro-allow="clipped-text long-lines" data-ouro-allow-why="a one-line preview" style="width:60px;overflow:hidden;white-space:nowrap">A preview cut on purpose</p>
      <p data-ouro-allow="all" data-ouro-allow-why="" style="width:60px;overflow:hidden;white-space:nowrap">An allow without a reason does not count</p>
      <svg><text>svg text</text></svg>
      <div></div>
      <span style="display:block;width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">An ellipsis cuts this, all of it still read out</span>
      <p style="width:120px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden">Clamped to one line, all of it still read out</p>
      <span aria-hidden="true" title="Hidden from the tree, whole in the title" style="display:block;width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Hidden from the tree, whole in the title</span>
      <p aria-hidden="true" aria-label="Whole in the label: clamped to a line" style="width:120px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden">clamped   to a line</p>`);
    expect(rules(await findSizeIssues())).toEqual(["clipped-text"]);
  });
});

describe("findSizeIssues: blurry-image", () => {
  it("holds a picture to the screen's own density, at most 2, unless told another", async () => {
    const small = await picture(100, 50);
    render(`<img src="${small}" alt="cover" style="width:400px;height:200px">`);
    await decodeImages();
    const density = Math.min(2, devicePixelRatio);
    expect(await findSizeIssues()).toMatchObject([{ rule: "blurry-image", detail: `drawn 400×200 from 100×50; at ${density}x it needs ${400 * density}px wide` }]);
  });

  it("finds a picture drawn larger than its pixels allow at the density, by how it fits", async () => {
    const small = await picture(100, 50);
    render(`
      <img src="${small}" alt="cover" style="width:200px;height:100px">
      <img src="${small}" alt="contain" style="width:200px;height:200px;object-fit:contain">
      <img src="${small}" alt="none" style="width:200px;height:100px;object-fit:none">`);
    await decodeImages();
    const issues = await findSizeIssues({ density: 2 });
    expect(rules(issues)).toEqual(["blurry-image", "blurry-image", "blurry-image"]);
    expect(issues[0]!.detail).toBe("drawn 200×100 from 100×50; at 2x it needs 400px wide");
    expect(issues[1]!.detail).toBe("drawn 200×200 from 100×50; at 2x it needs 400px wide");
    expect(issues[2]!.detail).toBe("drawn 200×100 from 100×50; at 2x it needs 200px wide");
    expect(issues[0]!.element).toBe('img "cover"');
  });

  it("reads the file's own pixels, so a srcset width that shrinks naturalWidth is not blurry", async () => {
    const big = await picture(800, 400);
    render(`<img srcset="${big} 800w" sizes="400px" alt="sharp" style="width:400px;height:200px">`);
    await decodeImages();
    expect(host.querySelector("img")!.naturalWidth).toBe(400);
    expect(await findSizeIssues({ density: 2 })).toEqual([]);
    expect(rules(await findSizeIssues({ density: 3 }))).toEqual(["blurry-image"]);
    expect(await findSizeIssues({ tolerance: 1.1, minImage: 96 })).toEqual([]);
  });

  it("passes pictures with enough pixels, SVG, small, hidden, broken and allowed pictures", async () => {
    const big = await picture(400, 200);
    const small = await picture(100, 50);
    render(`
      <img src="${big}" alt="sharp" style="width:200px;height:100px">
      <img src="${big}" alt="scale-down" style="width:200px;height:200px;object-fit:scale-down">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E" alt="svg" style="width:200px;height:200px">
      <img src="${small}" alt="small" style="width:60px;height:30px">
      <img src="${small}" alt="hidden" hidden style="width:200px;height:100px">
      <span data-size-ignore="a soft backdrop on purpose"><img src="${small}" alt="alias" style="width:200px;height:100px"></span>
      <img src="${small}" alt="allowed" data-ouro-allow="blurry-image" data-ouro-allow-why="a soft backdrop on purpose" style="width:200px;height:100px">
      <img alt="no source yet" style="width:200px;height:100px">`);
    await decodeImages();
    expect(await findSizeIssues({ density: 2 })).toEqual([]);
  });

  it("falls back to the drawn picture's size when its source no longer loads, and names a data: picture by its alt", async () => {
    const url = await picture(100, 50);
    render(`<img src="${url}" alt="gone" style="width:200px;height:100px">`);
    await decodeImages();
    URL.revokeObjectURL(url);
    expect(await findSizeIssues({ density: 2 })).toMatchObject([{ rule: "blurry-image", detail: "drawn 200×100 from 100×50; at 2x it needs 400px wide" }]);
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;
    host.innerHTML = `<img src="${canvas.toDataURL()}" alt="a dot" aria-label="A dot" style="width:200px;height:200px">`;
    await decodeImages();
    expect(await findSizeIssues({ density: 2 })).toMatchObject([{ rule: "blurry-image", element: 'img "A dot"' }]);
    host.innerHTML = `<img src="${canvas.toDataURL()}" style="width:200px;height:200px">`;
    await decodeImages();
    expect(await findSizeIssues({ density: 2 })).toMatchObject([{ rule: "blurry-image", element: "img" }]);
  });

  it("names a picture with an address by its last two folders, never by its host, which a local server changes", async () => {
    render(`<img src="${new URL("../scripts/check/fixtures/picture-160.png?v=1", import.meta.url).href}" alt="a fixture" style="width:200px;height:200px">`);
    await decodeImages();
    expect(await findSizeIssues({ density: 2 })).toMatchObject([{ rule: "blurry-image", element: "fixtures/picture-160.png" }]);
  });
});

describe("findSizeIssues: broken-image", () => {
  it("finds a picture that loaded empty, named as a blurry one would be, unless allowed with a reason", async () => {
    render(`
      <img src="data:image/png;base64,broken" alt="broken" style="width:200px;height:100px">
      <img src="${new URL("../scripts/check/fixtures/missing.png", import.meta.url).href}" alt="missing" width="400" height="300">
      <img src="data:image/png;base64,broken" alt="allowed" data-ouro-allow="broken-image" data-ouro-allow-why="a placeholder the test swaps">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" alt="an svg without a size">
      <img alt="no source yet">`);
    await decodeImages();
    expect(await findSizeIssues()).toMatchObject([
      { rule: "broken-image", element: 'img "broken"', detail: "the picture did not load" },
      { rule: "broken-image", element: "fixtures/missing.png" },
    ]);
  });
});

describe("findSizeIssues: long-lines", () => {
  it("finds prose whose lines average more than the limit, and marks an element once per finding", async () => {
    render(`<p id="wide" style="width:2000px;white-space:nowrap;overflow:hidden">${LONG}</p>`);
    const issues = await findSizeIssues({ maxChars: 100 });
    expect(rules(issues)).toContain("long-lines");
    const long = issues.find((issue) => issue.rule === "long-lines")!;
    expect(long.detail).toBe(`about ${LONG.length} characters a line (keep to 100)`);
    expect(document.getElementById("wide")!.getAttribute("data-ouro-check-ref")!.split(" ").length).toBe(issues.filter((i) => i.element.startsWith("p#wide")).length);
  });

  it("passes short lines, short text, code, tables, navigation and allowed prose", async () => {
    render(`
      <p style="width:300px">${LONG}</p>
      <p style="width:2000px">Short.</p>
      <pre><p style="width:2000px">${LONG}</p></pre>
      <nav><p style="width:2000px">${LONG}</p></nav>
      <p style="width:2000px" data-long-lines-ok="a one-line ticker">${LONG}</p>
      <p style="width:2000px">A <div>block</div> inside ${LONG}</p>
      <p style="width:2000px" hidden>${LONG}</p>
      <p style="width:2000px" data-ouro-allow="long-lines" data-ouro-allow-why="a one-line ticker">${LONG}</p>`);
    expect(rules(await findSizeIssues())).not.toContain("long-lines");
  });
});

describe("findOverlaps", () => {
  it("finds a line of text drawn over another line, or over a picture, in the same section", async () => {
    const url = await picture(100, 100);
    render(`
      <section style="position:relative">
        <p id="under" class="a b c d" style="margin:0">This paragraph sits under a label</p>
        <p style="position:absolute;top:0;left:0;margin:0">A label on top</p>
      </section>
      <section style="position:relative">
        <img src="${url}" alt="a square" style="width:100px;height:100px;display:block">
        <span style="position:absolute;top:40px;left:10px">Over the picture</span>
      </section>`);
    await decodeImages();
    const issues = findOverlaps();
    expect(issues.map((issue) => issue.element)).toEqual(['p#under.a.b.c "This paragraph sits under a label" × p "A label on top"', 'span "Over the picture" × img "a square"']);
    expect(issues[0]!).toMatchObject({ rule: "overlap", ref: "o1" });
    expect(issues[0]!.detail).toMatch(/^\d+×\d+px at scroll 0$/);
    expect(document.getElementById("under")!.getAttribute("data-ouro-check-ref")).toBe("o1");
  });

  it("names a picture without words by its tag alone", async () => {
    const url = await picture(100, 100);
    render(`<div style="position:relative"><img src="${url}" style="width:100px;height:100px;display:block"><span style="position:absolute;top:40px;left:10px">Over</span></div>`);
    await decodeImages();
    expect(findOverlaps().map((issue) => issue.element)).toEqual(['span "Over" × img ""']);
  });

  it("checks what a sticky heading covers at each scroll position, once per pair, and stops after maxSteps", async () => {
    render(`
      <section data-ouro-section>
        <h2 style="position:sticky;top:0;margin:0;line-height:10px;font-size:20px">Sticky</h2>
        <div style="height:${innerHeight * 3}px"></div>
        <p style="margin:0">Scrolled under</p>
      </section>`);
    const all = findOverlaps({ slack: 0 });
    expect(all.length).toBeLessThanOrEqual(1);
    expect(findOverlaps({ maxSteps: 1 })).toEqual([]);
    expect(scrollY).toBe(0);
  });

  it("passes text of one block, nested blocks, different sections, covered rows, hidden, clipped and allowed text", async () => {
    const url = await picture(100, 100);
    render(`
      <p style="margin:0">One <b>block</b> <span style="display:contents">of <i>text</i></span></p>
      <div style="position:relative"><div>Outer<div style="position:absolute;top:0">Inner</div></div></div>
      <section style="position:relative;height:20px"><p style="margin:0">First section</p></section>
      <section style="position:relative;height:20px"><p style="position:absolute;top:-20px;margin:0">Second section</p></section>
      <div style="position:relative">
        <div style="position:sticky;top:0;background:white;height:20px">Column title</div>
        <p style="margin:-20px 0 0">A row under it</p>
      </div>
      <div style="position:relative"><p style="margin:0">Visible</p><p hidden style="position:absolute;top:0;margin:0">Hidden</p>
        <p style="position:absolute;top:0;margin:0;visibility:hidden">Invisible</p><p style="position:absolute;top:0;margin:0;opacity:0">Faded</p>
        <p style="position:absolute;top:0;margin:0;display:none">None</p>
        <div style="position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden">Clipped away</div>
        <p data-overlap-ignore="a stamp over the words" style="position:absolute;top:0;margin:0">Plain alias</p>
        <p data-ouro-allow="overlap" data-ouro-allow-why="a stamp" style="position:absolute;top:0;margin:0">Stamp</p>
        <script>/* not text */</script><svg width="100" height="100"><text y="10">svg text</text><svg width="80" height="80"></svg></svg>
      </div>
      <div style="position:relative"><img src="${url}" alt="one" style="width:100px;height:100px;display:block"><img src="${url}" alt="two" style="position:absolute;top:0;width:100px;height:100px">
        <img src="${url}" alt="tiny" style="position:absolute;top:0;width:20px;height:20px"><img src="${url}" alt="hidden" hidden></div>
      <p style="margin:0">\u200b</p>
      <p style="line-height:normal;margin:0">Normal line height</p>
      <p style="line-height:4px;font-size:16px;margin:0">Tight<br>lines</p>`);
    await decodeImages();
    // Text whose inline parents reach the body belongs to the body's block.
    // (A zero-width space draws a box too thin to cover anything.)
    const loose = document.createElement("span");
    loose.textContent = "Loose text";
    document.body.append(loose);
    try {
      expect(findOverlaps()).toEqual([]);
    } finally {
      loose.remove();
    }
  });
});

describe("aliases", () => {
  it("counts a plain alias only with its reason as its value, as data-ouro-allow does only with data-ouro-allow-why", async () => {
    for (const [name, rule] of [["data-clip-ok", "clipped-text"], ["data-size-ignore", "clipped-text"]]) {
      render(`<p ${name}="" style="width:60px;overflow:hidden;white-space:nowrap">Cut, and the alias gives no reason</p>`);
      expect(rules(await findSizeIssues())).toEqual([rule]);
      host.remove();
    }
    render(`<section style="position:relative"><p style="margin:0">Under</p><p data-overlap-ignore=" " style="position:absolute;top:0;margin:0">Over</p></section>`);
    expect(rules(findOverlaps())).toEqual(["overlap"]);
    host.remove();
    render(`<p data-ouro-allow="clipped-text" data-ouro-allow-why="   " style="width:60px;overflow:hidden;white-space:nowrap">Cut, and the reason is spaces</p>`);
    expect(rules(await findSizeIssues())).toEqual(["clipped-text"]);
  });

  it("keeps a broken picture a finding under data-size-ignore, since it is broken at any size", async () => {
    render(`<span data-size-ignore="a soft backdrop"><img src="data:image/png;base64,broken" alt="Backdrop" style="width:200px;height:100px"></span>`);
    await decodeImages();
    expect(await findSizeIssues()).toMatchObject([{ rule: "broken-image", element: 'img "Backdrop"' }]);
  });

  it("lists every opt-out with a reason, and none without one", () => {
    render(`
      <p id="ticker" data-ouro-allow="long-lines clipped-text" data-ouro-allow-why="a ticker">${LONG}</p>
      <p data-ouro-allow="overlap" data-ouro-allow-why="">No reason</p>
      <div class="a b c d" data-overlap-ignore="  a stamp " aria-label="Stamp"></div>
      <img data-size-ignore="a soft backdrop" alt="Backdrop">
      <span data-long-lines-ok="">No reason</span>
      <span data-clip-ok="   ">Spaces are no reason</span>
      <p data-ouro-allow="overlap" data-ouro-allow-why="  ">Spaces are no reason</p>
      <span data-clip-ok="a code"></span>
      <div data-scroll-x="a timeline"></div>`);
    expect(listAllowances(ALIASES)).toEqual([
      { rules: "long-lines clipped-text", element: `p#ticker "${LONG.slice(0, 40)}…"`, reason: "a ticker" },
      { rules: "overlap", element: 'div.a.b.c "Stamp" [data-overlap-ignore]', reason: "a stamp" },
      { rules: "clipped-text", element: "span [data-clip-ok]", reason: "a code" },
      { rules: "sideways-scroll", element: "div [data-scroll-x]", reason: "a timeline" },
      { rules: "sideways-scroll clipped-text long-lines blurry-image", element: 'img "Backdrop" [data-size-ignore]', reason: "a soft backdrop" },
    ]);
  });
});

describe("readiness", () => {
  it("is ready once the page fires a ready event, marks itself ready, or has drawn its h1", () => {
    listenForReady(["ouro:ready", "app:drawn"]);
    expect(isReady()).toBe(false);
    window.dispatchEvent(new Event("ouro:ready"));
    expect(isReady()).toBe(true);
    delete state.__ouroCheckReady;
    document.dispatchEvent(new Event("app:drawn"));
    expect(isReady()).toBe(true);
    delete state.__ouroCheckReady;
    render(`<div data-app-ready="false"></div>`);
    expect(isReady()).toBe(false);
    host.firstElementChild!.setAttribute("data-app-ready", "");
    expect(isReady()).toBe(true);
    host.innerHTML = `<h1> </h1><h1 hidden>Hidden</h1>`;
    expect(isReady()).toBe(false);
    host.innerHTML = `<h1>Drawn</h1>`;
    expect(isReady()).toBe(true);
    host.innerHTML = "";
    document.documentElement.classList.add("app-ready");
    expect(isReady()).toBe(true);
  });

  it("treats a page without module scripts as ready once loaded", () => {
    const scripts = [...document.querySelectorAll('script[type="module"]')];
    for (const script of scripts) script.setAttribute("type", "text/x-held");
    try {
      expect(isReady()).toBe(true);
    } finally {
      for (const script of scripts) script.setAttribute("type", "module");
    }
  });
});

describe("close-ups", () => {
  it("boxes the marked elements, padded and scrolled into view, and outlines them through their style", () => {
    render(`<div style="height:${innerHeight * 2}px"></div><p id="a" data-ouro-check-ref="s1 o2" style="width:100px;margin:0">One</p><p data-ouro-check-ref="o2" style="width:50px;margin:0">Two</p>`);
    const box = boxOf({ ref: "o2", width: innerWidth, height: innerHeight });
    const a = document.getElementById("a")!.getBoundingClientRect();
    expect(box.x).toBe(Math.max(0, a.left - 24) + scrollX);
    expect(box.width).toBe(Math.min(document.documentElement.scrollWidth, a.right + 24) - Math.max(0, a.left - 24));
    expect(box.height).toBeGreaterThan(a.height * 2);
    expect(box.y).toBeGreaterThan(0);
    outline({ ref: "o2", on: true });
    expect(document.getElementById("a")!.style.getPropertyValue("outline")).toMatch(/\b3px\b/);
    expect(document.getElementById("a")!.style.getPropertyPriority("outline")).toBe("important");
    outline({ ref: "o2", on: false });
    expect(document.getElementById("a")!.style.getPropertyValue("outline")).toBe("");
  });

  it("boxes the screen for a finding about the whole page or with no marked element", () => {
    document.body.setAttribute("data-ouro-check-ref", "s9");
    try {
      expect(boxOf({ ref: "s9", width: 300, height: 200 })).toEqual({ x: 0, y: scrollY, width: 300, height: 200 });
    } finally {
      document.body.removeAttribute("data-ouro-check-ref");
    }
    expect(boxOf({ ref: "s404", width: 300, height: 200 })).toEqual({ x: 0, y: scrollY, width: 300, height: 200 });
  });
});

describe("runAxe", () => {
  it("reports serious and critical violations, one per rule, and leaves out allowed elements", async () => {
    render(`
      <button id="unnamed"><svg width="10" height="10" aria-hidden="true"></svg></button>
      <button class="nameless"><svg width="10" height="10" aria-hidden="true"></svg></button>
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="20" height="20">
      <div data-ouro-allow="axe" data-ouro-allow-why="a third-party widget we do not own"><button><svg width="10" height="10" aria-hidden="true"></svg></button></div>`);
    const issues = await runAxe();
    const button = issues.find((issue) => issue.element.startsWith("button-name"))!;
    expect(button).toMatchObject({ rule: "axe", impact: "critical", element: "button-name: #unnamed", detail: "critical: Buttons must have discernible text (2 elements)" });
    expect(document.getElementById("unnamed")!.getAttribute("data-ouro-check-ref")).toBe(button.ref);
    const image = issues.find((issue) => issue.element.startsWith("image-alt"))!;
    expect(image.detail).toBe("critical: Images must have alternative text");
    expect(issues.every((issue) => issue.impact === "serious" || issue.impact === "critical")).toBe(true);
    host.innerHTML = `<button>Named</button>`;
    expect(await runAxe()).toEqual([]);
  });
});
