import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ALIASES, behindModal, veiled, boxOf, decodeImages, findFragmentFocusIssues, isReady, listAllowances, listPersonSignals, listenForReady, outline, runAxe } from "@/registry/ouro/check/in-page";
import { findImageFades } from "@/registry/ouro/check/fade-check";
import { findOverlaps } from "@/registry/ouro/check/overlap-check";
import { findSizeIssues } from "@/registry/ouro/check/size-check";
import { server } from "vitest/browser";

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

describe("veiled", () => {
  it("names the refs whose every element sits inside a [data-ouro-veil] layer, and none that mark nothing", () => {
    render('<p data-ouro-check-ref="1">Page</p><section data-ouro-veil="narrow"><p data-ouro-check-ref="2">Veiled</p><span data-ouro-check-ref="3">Split</span></section><span data-ouro-check-ref="3">Split</span>');
    expect(veiled(["1", "2", "3", "4"])).toEqual(["2"]);
  });

  it("draws a solid layer that says so, with the reason when one is given", () => {
    const page = render('<section data-ouro-veil="" style="height:80px"><p>Hidden</p></section><section data-ouro-veil="below 600px" style="height:80px"></section>');
    const [plain, reason] = [...page.querySelectorAll("section")].map((el) => getComputedStyle(el, "::after"));
    expect(plain!.content).toBe('"Not designed yet"');
    expect(reason!.content.replace(/" "/g, "")).toBe('"Not designed yet: below 600px"');
    expect(plain!.backgroundImage).toBe("none");
  });
});

describe("behindModal", () => {
  it("names no ref while no modal is open, or only a hidden one", () => {
    render('<p data-ouro-check-ref="1">Page</p><div role="dialog" aria-modal="true" hidden><p data-ouro-check-ref="2">Closed</p></div>');
    expect(behindModal(["1", "2"])).toEqual([]);
  });

  it("names the refs whose every element sits outside an open aria-modal popup", () => {
    render(
      '<p data-ouro-check-ref="1">Page</p><p data-ouro-check-ref="3">Split</p>' +
        '<div role="dialog" aria-modal="true"><p data-ouro-check-ref="2">In the modal</p><span data-ouro-check-ref="3">Split</span></div>',
    );
    expect(behindModal(["1", "2", "3", "4"])).toEqual(["1"]);
  });

  it("counts a modal <dialog> and an element that holds the modal as the modal's", () => {
    const page = render('<section data-ouro-check-ref="1"><dialog><p data-ouro-check-ref="2">Asked</p></dialog></section><p data-ouro-check-ref="3">Page</p>');
    page.querySelector("dialog")!.showModal();
    expect(behindModal(["1", "2", "3"])).toEqual(["3"]);
    page.querySelector("dialog")!.close();
  });
});

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

  it("passes an ellipsis behind an open modal, which hides the page on purpose, but not one the modal itself hides", async () => {
    const cut = (words: string) => `<span style="display:block;width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${words}</span>`;
    render(`
      <div aria-hidden="true">${cut("Behind the modal, read once it closes")}</div>
      <div role="dialog" aria-modal="true"><div aria-hidden="true">${cut("Hidden inside the modal itself")}</div></div>
      <div role="dialog" aria-modal="true" style="display:none">${cut("A closed modal hides nothing")}</div>`);
    expect((await findSizeIssues()).map((issue) => issue.element)).toEqual(['span "Hidden inside the modal itself"']);
    host.remove();
    // The page hides the modal too, so nothing in it is reachable.
    render(`<div aria-hidden="true"><div role="dialog" aria-modal="true">${cut("Hidden with its modal")}</div></div>`);
    expect((await findSizeIssues()).map((issue) => issue.element)).toEqual(['span "Hidden with its modal"']);
  });
});

describe("findSizeIssues: clipped-text, fading out", () => {
  const cut = `display:block;width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;

  it("leaves out text cut while it fades out to nothing, and still reports it when it fades in or holds", async () => {
    render(`<span id="out" aria-hidden="true" style="${cut}">The line on its way out</span><span id="in" aria-hidden="true" style="${cut}">The line on its way in</span>`);
    const fade = (id: string, from: number, to: number) => document.getElementById(id)!.animate([{ opacity: from }, { opacity: to }], { duration: 60_000 });
    const out = fade("out", 1, 0);
    const into = fade("in", 0.5, 1);
    try {
      expect((await findSizeIssues()).map((issue) => issue.element)).toEqual(['span#in "The line on its way in"']);
    } finally {
      out.cancel();
      into.cancel();
    }
    expect(rules(await findSizeIssues())).toEqual(["clipped-text", "clipped-text"]);
  });

  it("still reports text whose fade out is paused, or that moves without fading", async () => {
    render(`<span id="paused" aria-hidden="true" style="${cut}">A fade held part way</span><span id="moving" aria-hidden="true" style="${cut}">A line that slides</span>`);
    const paused = document.getElementById("paused")!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 60_000 });
    paused.pause();
    const moving = document.getElementById("moving")!.animate([{ translate: "0 0" }, { translate: "4px 0" }], { duration: 60_000 });
    try {
      expect(rules(await findSizeIssues())).toEqual(["clipped-text", "clipped-text"]);
    } finally {
      paused.cancel();
      moving.cancel();
    }
  });

  it("leaves out text inside an element that fades out to nothing", async () => {
    render(`<div id="leaving"><span aria-hidden="true" style="${cut}">A line inside a fading box</span></div>`);
    const out = document.getElementById("leaving")!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 60_000 });
    try {
      expect(await findSizeIssues()).toEqual([]);
    } finally {
      out.cancel();
    }
  });
});

describe("findSizeIssues: clipped-text, cut by an ancestor's box", () => {
  const card = (inner: string) => `<article style="position:relative;overflow:hidden;width:240px;height:150px;padding:0 16px;border:1px solid #c9d3df">${inner}</article>`;
  const title = (margin: string) => `<h3 style="margin:${margin};height:26px;font:600 20px/26px system-ui">Card title</h3>`;
  const clipped = async () => (await findSizeIssues()).filter((issue) => issue.rule === "clipped-text");

  it("finds a title pushed partly out of the card that hides its overflow, named with how much shows", async () => {
    render(card(`${title("-18px 0 0")}<p>Body</p>`));
    expect(await clipped()).toMatchObject([{ rule: "clipped-text", element: 'h3 "Card title"', detail: expect.stringMatching(/^shown \d+px\/26px$/) }]);
    const [issue] = await clipped();
    expect(Number(issue!.detail.match(/^shown (\d+)px/)![1])).toBeLessThan(26 * 0.9);
  });

  it("finds a title cut by a card hidden on one axis, whose other axis computes to auto", async () => {
    render(`<article style="position:relative;overflow-x:hidden;width:240px;height:150px;padding:0 16px">${title("-18px 0 0")}<p>Body</p></article>`);
    expect(await clipped()).toMatchObject([{ rule: "clipped-text", element: 'h3 "Card title"' }]);
  });

  it("finds text cut by a box that clips one axis only, and a picture pushed past the edge of one that clips sideways", async () => {
    render(`<article style="overflow-y:clip;width:240px;height:150px;padding:0 16px"><h3 style="position:relative;top:-18px;margin:0;height:26px;font:600 20px/26px system-ui">Card title</h3><p>Body</p></article>`);
    expect(await clipped()).toMatchObject([{ element: 'h3 "Card title"', detail: expect.stringMatching(/^shown \d+px\/26px$/) }]);
    host.remove();
    const url = await picture(960, 540);
    render(`<article style="overflow-x:clip;width:240px;height:150px;padding:0 16px"><img src="${url}" alt="A picture past the edge" style="display:block;max-width:none;width:300px;height:150px;margin-left:-40px;object-fit:cover"></article>`);
    await decodeImages();
    expect(await clipped()).toMatchObject([{ element: 'img "A picture past the edge"', detail: "shown 240px/300px" }]);
  });

  it("reports a block cut inside a cut block once, at the outermost, and a block cut on its own", async () => {
    render(card(`<ul style="margin:-18px 0 0;padding:0"><li style="list-style:none;height:26px"><p style="margin:0;height:26px">Nested line</p></li></ul><p style="position:absolute;top:-18px;left:16px;margin:0;height:26px">Stand-alone line</p>`));
    expect((await clipped()).map(({ element }) => element)).toEqual(['li "Nested line"', 'p "Stand-alone line"']);
  });

  it("names a long title by its first 60 characters, and a picture with no words by its tag alone", async () => {
    const long = "A title that runs on well past the sixty characters a name keeps, so the name ends in an ellipsis";
    render(card(`<h3 style="margin:-18px 0 0;height:26px;white-space:nowrap;font:600 20px/26px system-ui">${long}</h3>`));
    expect((await clipped()).map(({ element }) => element)).toEqual([`h3 "${long.slice(0, 60)}…"`]);
    host.remove();
    const url = await picture(960, 540);
    render(`<div style="width:240px;height:150px;overflow:hidden"><picture style="display:block"><img src="${url}" style="display:block;width:240px;height:150px;margin-top:-40px"></picture></div>`);
    await decodeImages();
    expect(await clipped()).toMatchObject([{ element: "picture", detail: "shown 110px/150px" }]);
    host.remove();
    render(`<div style="width:240px;height:150px;overflow:hidden"><picture style="display:block;width:240px;height:150px;margin-top:-40px"><source srcset="${url}"></picture></div>`);
    expect(await clipped()).toMatchObject([{ element: "picture", detail: "shown 110px/150px" }]);
  });

  it("passes text in a plain horizontal scroller, which scrolls it rather than cuts it", async () => {
    render('<div style="display:flex;gap:12px;overflow-x:auto;width:200px"><div style="flex:0 0 180px"><p>Slide one</p></div><div style="flex:0 0 180px"><p>Slide two</p></div></div>');
    expect(await clipped()).toEqual([]);
  });

  it("passes a title inside its card, and a cut one the page allows with a reason", async () => {
    render(card(`${title("16px 0 4px")}<p>Body</p>`));
    expect(await clipped()).toEqual([]);
    host.remove();
    render(card(`<h3 data-ouro-allow="clipped-text" data-ouro-allow-why="a title that rises on purpose" style="margin:-18px 0 0;height:26px;font:600 20px/26px system-ui">Card title</h3>`));
    expect(await clipped()).toEqual([]);
  });

  it("passes a visually hidden label that its card would cut: clipped with inset(50%), or the 1px sr-only pattern", async () => {
    render(card(`${title("16px 0 4px")}<p style="position:absolute;top:-20px;left:0;width:200px;height:26px;margin:0;clip-path:inset(50%)">Label for the card</p>`));
    expect(await clipped()).toEqual([]);
    host.remove();
    render(card(`${title("16px 0 4px")}<span class="sr-only" style="position:absolute;top:-20px;left:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"><p style="margin:0">Label for the card</p></span><p style="position:absolute;top:-20px;left:0;width:1px;height:1px;margin:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">Second label</p>`));
    expect(await clipped()).toEqual([]);
  });

  it("passes text in a horizontally scrolling carousel, which scrolls the text rather than cuts it", async () => {
    render(
      '<div style="overflow:hidden;width:200px"><div role="region" aria-roledescription="carousel" aria-label="Featured" style="display:flex;gap:12px;overflow-x:auto;width:200px">' +
        '<div style="flex:0 0 180px"><p>Slide one</p></div><div style="flex:0 0 180px"><p>Slide two</p></div></div></div>',
    );
    expect(await clipped()).toEqual([]);
  });

  it("passes a picture cropped by object-fit inside a frame whose box fits it, and finds one whose box the frame cuts", async () => {
    const url = await picture(960, 540);
    render(`<div style="width:240px;height:150px;overflow:hidden"><img src="${url}" alt="A cropped picture" style="display:block;width:240px;height:150px;object-fit:cover"></div>`);
    await decodeImages();
    expect(await clipped()).toEqual([]);
    host.remove();
    render(`<div style="width:240px;height:150px;overflow:hidden"><img src="${url}" alt="A cropped picture" style="display:block;max-width:none;width:300px;height:150px;object-fit:cover"></div>`);
    await decodeImages();
    expect((await clipped()).map(({ element, detail }) => [element, detail])).toEqual([['img "A cropped picture"', "shown 240px/300px"]]);
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

  it("passes pictures with enough pixels, SVG, small, hidden and broken pictures", async () => {
    const big = await picture(400, 200);
    const small = await picture(100, 50);
    render(`
      <img src="${big}" alt="sharp" style="width:200px;height:100px">
      <img src="${big}" alt="scale-down" style="width:200px;height:200px;object-fit:scale-down">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E" alt="svg" style="width:200px;height:200px">
      <img src="${small}" alt="small" style="width:60px;height:30px">
      <img src="${small}" alt="hidden" hidden style="width:200px;height:100px">
      <img alt="no source yet" style="width:200px;height:100px">`);
    await decodeImages();
    expect(await findSizeIssues({ density: 2 })).toEqual([]);
  });

  it("holds the drawn width times the density to the file's width exactly, with half a pixel for rounding", async () => {
    const file = await picture(200, 100);
    render(`
      <img src="${file}" alt="at the line" style="width:100px;height:50px">
      <img src="${file}" alt="a pixel past" style="width:101px;height:50.5px">`);
    await decodeImages();
    const issues = await findSizeIssues({ density: 2, minImage: 0 });
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([['img "a pixel past"', "drawn 101×51 from 200×100; at 2x it needs 202px wide"]]);
    expect(await findSizeIssues({ density: 1, minImage: 0 })).toEqual([]);
  });

  it("gives each blurry picture's numbers for the images report: a selector, its file, its pixels, its box and what it needs", async () => {
    const small = await picture(100, 50);
    render(`<section id="art"><p>Words</p><figure><img src="${small}" alt="first" style="width:100px;height:50px"><img src="${small}" alt="second" style="width:200px;height:100px"></figure></section>`);
    host.querySelector("#art")!.removeAttribute("id");
    host.firstElementChild!.setAttribute("id", "art 1");
    await decodeImages();
    const [first, second] = await findSizeIssues({ density: 2 });
    expect(first!.image).toEqual({ selector: "#art\\ 1 > figure > img:nth-of-type(1)", src: small, naturalWidth: 100, naturalHeight: 50, renderedWidth: 100, renderedHeight: 50, density: 2, requiredWidth: 200 });
    expect(second!.image).toMatchObject({ selector: "#art\\ 1 > figure > img:nth-of-type(2)", renderedWidth: 200, requiredWidth: 400 });
    expect(document.querySelector(second!.image!.selector)).toBe(host.querySelectorAll("img")[1]);
    host.remove();
    render(`<div><img src="${small}" alt="no id above" style="width:200px;height:100px"></div>`);
    await decodeImages();
    const [issue] = await findSizeIssues({ density: 2 });
    expect(issue!.image!.selector).toMatch(/^body > div(:nth-of-type\(\d+\))? > div > img$/);
    expect(document.querySelector(issue!.image!.selector)).toBe(host.querySelector("img"));
  });

  it("cannot be waived: reports an attempt to allow it, and still finds the picture", async () => {
    const small = await picture(100, 50);
    render(`
      <span data-size-ignore="a soft backdrop on purpose"><img src="${small}" alt="alias" style="width:200px;height:100px"></span>
      <img src="${small}" alt="allowed" data-ouro-allow="blurry-image stretched-image" data-ouro-allow-why="a soft backdrop on purpose" style="width:200px;height:100px">
      <img src="${small}" alt="all" data-ouro-allow="all" data-ouro-allow-why="everything on purpose" style="width:200px;height:100px">`);
    await decodeImages();
    const issues = await findSizeIssues({ density: 2 });
    expect(issues.map(({ rule, element }) => [rule, element])).toEqual([
      ["blurry-image", 'img "allowed" [data-ouro-allow="blurry-image stretched-image"]'],
      ["blurry-image", 'img "alias"'],
      ["blurry-image", 'img "allowed"'],
      ["blurry-image", 'img "all"'],
    ]);
    expect(issues[0]!.detail).toBe(
      "blurry-image cannot be waived: remove it from data-ouro-allow and give the picture a larger source, or a srcset whose largest file covers its drawn width at 2x",
    );
    expect(issues[0]!.image).toBeUndefined();
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
    render(`<img src="${new URL("../scripts/check/fixtures/picture-160.png?v=1", import.meta.url).href}" alt="a fixture" style="width:200px;height:auto">`);
    // A picture fetched from the server can take longer than decodeImages waits on a loaded runner, and a picture not yet decoded is skipped, so this waits for it alone.
    await Promise.all([...document.images].map((img) => img.decode()));
    await decodeImages();
    expect(await findSizeIssues({ density: 2 })).toMatchObject([{ rule: "blurry-image", element: "fixtures/picture-160.png" }]);
  });
});

describe("findSizeIssues: blurry-image, for a CSS background", () => {
  const issues = async (density = 2) => (await findSizeIssues({ density })).map(({ rule, element, detail }) => [rule, element, detail]);

  it("finds a raster background drawn larger than its file at the density, by its background-size", async () => {
    const file = await picture(200, 100);
    const box = "width:400px;height:200px";
    render(`
      <div aria-label="Cover" style="${box};background:url(${file}) center/cover"></div>
      <div aria-label="Contain" style="${box};background:url(${file}) no-repeat center/contain"></div>
      <div aria-label="Natural" style="${box};background-image:url(${file})"></div>
      <div aria-label="Width" style="${box};background:url(${file}) 0 0/50% auto"></div>
      <div aria-label="Height" style="${box};background:url(${file}) 0 0/auto 100px"></div>
      <div aria-label="Both" style="${box};background:url(${file}) 0 0/300px 50px"></div>
      <span aria-label="Inline" style="background:url(${file}) 0 0/300px 50px">An inline box</span>`);
    expect(await issues()).toEqual([
      ["blurry-image", 'div "Cover" background', "a background drawn 400×200 from 200×100; at 2x it needs 800px wide"],
      ["blurry-image", 'div "Contain" background', "a background drawn 400×200 from 200×100; at 2x it needs 800px wide"],
      ["blurry-image", 'div "Natural" background', "a background drawn 200×100 from 200×100; at 2x it needs 400px wide"],
      ["blurry-image", 'div "Width" background', "a background drawn 200×100 from 200×100; at 2x it needs 400px wide"],
      ["blurry-image", 'div "Height" background', "a background drawn 200×100 from 200×100; at 2x it needs 400px wide"],
      ["blurry-image", 'div "Both" background', "a background drawn 300×50 from 200×100; at 2x it needs 600px wide"],
      ["blurry-image", 'span "Inline" background', "a background drawn 300×50 from 200×100; at 2x it needs 600px wide"],
    ]);
    expect(await issues(1)).toEqual([
      ["blurry-image", 'div "Cover" background', "a background drawn 400×200 from 200×100; at 1x it needs 400px wide"],
      ["blurry-image", 'div "Contain" background', "a background drawn 400×200 from 200×100; at 1x it needs 400px wide"],
      ["blurry-image", 'div "Both" background', "a background drawn 300×50 from 200×100; at 1x it needs 300px wide"],
      ["blurry-image", 'span "Inline" background', "a background drawn 300×50 from 200×100; at 1x it needs 300px wide"],
    ]);
  });

  it("reads an image-set's finest file at its own density, and each layer of several", async () => {
    const coarse = await picture(200, 100);
    const fine = await picture(800, 400);
    const box = "width:400px;height:200px";
    render(`
      <div aria-label="Set" style="${box};background:image-set(url(${coarse}) 1x, url(${fine}) 2x) center/cover"></div>
      <div aria-label="Thin set" style="${box};background:image-set(url(${coarse}) 1x, url(${coarse}) 2x) center/cover"></div>
      <div aria-label="Layers" style="${box};background:linear-gradient(#000,#fff), url(${fine}) center/cover, url(${coarse}) center/cover"></div>`);
    expect(await issues()).toEqual([
      ["blurry-image", 'div "Thin set" background', "a background drawn 400×200 from 200×100; at 2x it needs 800px wide"],
      ["blurry-image", 'div "Layers" background', "a background drawn 400×200 from 200×100; at 2x it needs 800px wide"],
    ]);
  });

  it("passes SVG, gradients, small, hidden and broken backgrounds, and names one with an address by its folders", async () => {
    const file = await picture(200, 100);
    const box = "width:400px;height:200px";
    const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E";
    render(`
      <div style="${box};background:url(&quot;${svg}&quot;) center/cover"></div>
      <div style="${box};background:linear-gradient(red,blue)"></div>
      <div style="width:400px;height:200px;background:url(${file}) 0 0/60px 30px"></div>
      <div hidden style="${box};background:url(${file}) center/cover"></div>
      <div style="${box};background:url(data:image/png;base64,broken) center/cover"></div>
      <div style="width:320px;height:160px;background:url(${new URL("../scripts/check/fixtures/picture-160.png", import.meta.url).href}) center/cover"></div>`);
    expect(await issues()).toEqual([["blurry-image", "fixtures/picture-160.png (background)", "a background drawn 320×180 from 160×90; at 2x it needs 640px wide"]]);
  });
});

describe("findSizeIssues: blurry-image, for a video", () => {
  // 590×330 frames, served from the repository.
  const CLIP = new URL("../site/public/apple/media/hx-press.webm", import.meta.url).href;
  const sized = (video: HTMLVideoElement) => (video.readyState >= 1 ? Promise.resolve() : new Promise((done) => video.addEventListener("loadedmetadata", done, { once: true })));
  const videos = () => [...host.querySelectorAll("video")];
  // A stream of 64×48 frames from a canvas: a video with no address at all.
  const stream = () => {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [64, 48];
    canvas.getContext("2d")!.fillRect(0, 0, 64, 48);
    return canvas.captureStream();
  };

  it("finds a video drawn larger than its frames at the density, by how it fits (contain unless the page says)", async () => {
    // Preflight holds a video to its box (max-width: 100%; height: auto), so each sets its own.
    const box = "display:block;max-width:none;width:400px;height:300px";
    render(`
      <video src="${CLIP}" muted style="${box}"></video>
      <video src="${CLIP}" muted style="${box};object-fit:cover"></video>
      <video src="${CLIP}" muted style="${box};object-fit:fill"></video>
      <video src="${CLIP}" muted style="${box};object-fit:none"></video>
      <video src="${CLIP}" muted style="${box};object-fit:scale-down"></video>`);
    await Promise.all(videos().map(sized));
    const issues = await findSizeIssues({ density: 2 });
    expect(issues.map((issue) => [issue.rule, issue.element, issue.detail])).toEqual([
      ["blurry-image", "media/hx-press.webm", "a video drawn 400×300 from 590×330 frames; at 2x it needs 800px wide"],
      ["blurry-image", "media/hx-press.webm", "a video drawn 400×300 from 590×330 frames; at 2x it needs 1073px wide"],
      ["stretched-image", "media/hx-press.webm", "a video drawn 400×300 from 590×330 frames, 34% taller than its own shape"],
      ["blurry-image", "media/hx-press.webm", "a video drawn 400×300 from 590×330 frames; at 2x it needs 1073px wide"],
      ["blurry-image", "media/hx-press.webm", "a video drawn 400×300 from 590×330 frames; at 2x it needs 1180px wide"],
      ["blurry-image", "media/hx-press.webm", "a video drawn 400×300 from 590×330 frames; at 2x it needs 800px wide"],
    ]);
    expect(videos()[0]!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    expect(rules(await findSizeIssues({ density: 1 }))).toEqual(["stretched-image"]);
  });

  it("asks a video that hasn't loaded its size (preload none) on a video of its own, by its src or its source", async () => {
    const blob = URL.createObjectURL(await (await fetch(CLIP)).blob());
    urls.push(blob);
    render(`<video src="${CLIP}" preload="none" style="display:block;width:400px;height:300px"></video>`);
    // Called at once, before the video has chosen its source, so the size comes from its src.
    expect(await findSizeIssues({ density: 2 })).toMatchObject([{ rule: "blurry-image", element: "media/hx-press.webm", detail: "a video drawn 400×300 from 590×330 frames; at 2x it needs 800px wide" }]);
    host.innerHTML = `<video preload="none" aria-label="A demo" style="display:block;width:400px;height:300px"><source src="${blob}" type="video/webm"></video>`;
    expect(await findSizeIssues({ density: 2 })).toMatchObject([{ rule: "blurry-image", element: 'video "A demo"' }]);
  });

  // Ouro check runs in Chromium. WebKit on Linux gives a canvas stream no size until it plays, and plays only from a press.
  it.skipIf(server.browser !== "chromium")("names a video playing a stream by a source it lists, or by its words when it has no address", async () => {
    render(`
      <video muted style="display:block;width:200px;height:150px"><source src="${CLIP}"></video>
      <video src="${CLIP}" muted style="display:block;width:200px;height:150px"></video>
      <video muted aria-label="A live feed" style="display:block;width:200px;height:150px"></video>
      <video muted style="display:block;width:200px;height:150px"></video>`);
    for (const video of videos()) video.srcObject = stream();
    await Promise.all(videos().map(sized));
    expect(videos().map((video) => video.currentSrc)).toEqual(["", "", "", ""]);
    expect((await findSizeIssues({ density: 1 })).map((issue) => [issue.element, issue.detail])).toEqual([
      ["media/hx-press.webm", "a video drawn 200×150 from 64×48 frames; at 1x it needs 200px wide"],
      ["media/hx-press.webm", "a video drawn 200×150 from 64×48 frames; at 1x it needs 200px wide"],
      ['video "A live feed"', "a video drawn 200×150 from 64×48 frames; at 1x it needs 200px wide"],
      ["video", "a video drawn 200×150 from 64×48 frames; at 1x it needs 200px wide"],
    ]);
  });

  it("leaves out a video that gives no size within 3 s", async () => {
    render(`<video src="${new URL("../scripts/check/fixtures/missing.webm", import.meta.url).href}" preload="none" style="display:block;width:400px;height:300px"></video>`);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const found = findSizeIssues({ density: 2 });
      await vi.advanceTimersByTimeAsync(3000);
      expect(await found).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes sharp, small, hidden and empty videos", async () => {
    const box = "display:block;width:200px;height:150px";
    render(`
      <video src="${CLIP}" muted style="${box}"></video>
      <video src="${CLIP}" muted style="display:block;width:60px;height:34px;object-fit:fill"></video>
      <video src="${CLIP}" muted hidden style="${box};object-fit:none"></video>
      <video muted style="${box}"></video>`);
    await Promise.all(videos().filter((video) => video.src).map(sized));
    expect(await findSizeIssues({ density: 2 })).toEqual([]);
  });

  it("finds a blurry video however it is allowed", async () => {
    const box = "display:block;width:200px;height:150px;object-fit:none";
    render(`
      <span data-size-ignore="a soft backdrop on purpose"><video src="${CLIP}" muted style="${box}"></video></span>
      <video src="${CLIP}" muted data-ouro-allow="blurry-image" data-ouro-allow-why="a soft backdrop on purpose" style="${box}"></video>`);
    await Promise.all(videos().map(sized));
    expect((await findSizeIssues({ density: 2 })).map(({ element }) => element)).toEqual(['video [data-ouro-allow="blurry-image"]', "media/hx-press.webm", "media/hx-press.webm"]);
  });
});

describe("findSizeIssues: stretched-image", () => {
  const stretched = async () => (await findSizeIssues({ density: 1 })).filter((issue) => issue.rule === "stretched-image");

  it("finds a picture drawn out of its own shape, taller or wider, small ones too, by how much", async () => {
    const wide = await picture(200, 100);
    const icon = await picture(40, 20);
    render(`
      <img src="${wide}" alt="squeezed" style="width:200px;height:200px">
      <img src="${wide}" alt="flattened" style="width:300px;height:100px">
      <img src="${icon}" alt="an icon" style="width:20px;height:20px">`);
    await decodeImages();
    const issues = await stretched();
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ['img "squeezed"', "drawn 200×200 from 200×100, 100% taller than its own shape"],
      ['img "flattened"', "drawn 300×100 from 200×100, 50% wider than its own shape"],
      ['img "an icon"', "drawn 20×20 from 40×20, 100% taller than its own shape"],
    ]);
    expect(host.querySelector("img")!.getAttribute("data-ouro-check-ref")!.split(" ")).toContain(issues[0]!.ref);
  });

  it("passes a picture in its shape or within a rounding, padded, framed or turned, one object-fit fits, SVG, hidden and allowed pictures", async () => {
    const wide = await picture(400, 200);
    const thin = await picture(30, 10);
    render(`
      <img src="${wide}" alt="kept" style="width:200px;height:100px">
      <img src="${wide}" alt="within 5%" style="width:400px;height:208px">
      <img src="${thin}" alt="within 2px" style="width:30px;height:11px">
      <img src="${wide}" alt="padded and framed" style="box-sizing:content-box;width:200px;height:100px;padding:4px 12px;border:3px solid">
      <img src="${wide}" alt="turned" style="width:200px;height:100px;transform:rotate(30deg)">
      <img src="${wide}" alt="cover" style="width:200px;height:200px;object-fit:cover">
      <img src="${wide}" alt="contain" style="width:200px;height:200px;object-fit:contain">
      <img src="${wide}" alt="scale-down" style="width:200px;height:200px;object-fit:scale-down">
      <img src="${wide}" alt="none" style="width:200px;height:200px;object-fit:none">
      <img srcset="${wide} 800w" sizes="400px" alt="srcset" style="width:400px;height:200px">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='20'/%3E" alt="svg" style="width:200px;height:200px">
      <img src="${wide}" alt="hidden" hidden style="width:200px;height:200px">
      <span data-size-ignore="a placeholder on purpose"><img src="${wide}" alt="alias" style="width:200px;height:200px"></span>
      <img src="${wide}" alt="allowed" data-ouro-allow="stretched-image" data-ouro-allow-why="a placeholder on purpose" style="width:200px;height:200px">`);
    await decodeImages();
    expect(await stretched()).toEqual([]);
  });

  it("finds a small video drawn out of its frames' shape, and asks no video it can't judge", async () => {
    const CLIP = new URL("../site/public/apple/media/hx-press.webm", import.meta.url).href;
    render(`
      <video src="${CLIP}" muted style="display:block;width:60px;height:60px;object-fit:fill"></video>
      <video src="${CLIP}" muted style="display:block;width:60px;height:60px"></video>
      <video src="${CLIP}" muted data-ouro-allow="stretched-image" data-ouro-allow-why="a placeholder on purpose" style="display:block;width:60px;height:60px;object-fit:fill"></video>`);
    const videos = [...host.querySelectorAll("video")];
    await Promise.all(videos.map((video) => (video.readyState >= 1 ? undefined : new Promise((done) => video.addEventListener("loadedmetadata", done, { once: true })))));
    expect((await stretched()).map(({ element, detail }) => [element, detail])).toEqual([["media/hx-press.webm", "a video drawn 60×60 from 590×330 frames, 79% taller than its own shape"]]);
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
    // decodeImages waits 3 s at most, as the check does; the missing picture's answer comes from the test server, which a
    // busy runner can hold past that (#1519), so the test waits for every picture to finish first.
    await expect.poll(() => [...document.images].every((image) => image.complete)).toBe(true);
    await decodeImages();
    expect(await findSizeIssues()).toMatchObject([
      { rule: "broken-image", element: 'img "broken"', detail: "the picture did not load" },
      { rule: "broken-image", element: "fixtures/missing.png" },
    ]);
  });
});

describe("findSizeIssues: long-lines", () => {
  const prose = (measure: string) => ({ measures: [{ selector: null, measure }] });

  it("finds nothing without a declared measure, however long the lines run", async () => {
    render(`<p style="width:2000px">${LONG} ${LONG}</p>`);
    expect(rules(await findSizeIssues())).not.toContain("long-lines");
  });

  it("with 100 chars on the prose, finds prose whose lines average more than 100 characters, as the rule always counted, and marks an element once per finding", async () => {
    render(`<p id="wide" style="width:2000px;white-space:nowrap;overflow:hidden">${LONG}</p>`);
    const issues = await findSizeIssues(prose("100 chars"));
    expect(rules(issues)).toContain("long-lines");
    const long = issues.find((issue) => issue.rule === "long-lines")!;
    expect(long.detail).toBe(`about ${LONG.length} characters a line (keep to 100)`);
    expect(document.getElementById("wide")!.getAttribute("data-ouro-check-ref")!.split(" ").length).toBe(issues.filter((i) => i.element.startsWith("p#wide")).length);
  });

  it("holds the elements a selector names to a measure in px, and leaves the rest alone", async () => {
    render(`
      <div class="chat"><p id="wide" style="width:1000px">${LONG} <b>${LONG}</b></p><p style="width:700px">${LONG} ${LONG}</p></div>
      <p style="width:1600px">${LONG} ${LONG}</p>`);
    const issues = (await findSizeIssues({ measures: [{ selector: ".chat p", measure: " 800px " }] })).filter((issue) => issue.rule === "long-lines");
    expect(issues.map((issue) => issue.element.split(" ")[0])).toEqual(["p#wide"]);
    expect(issues[0]!.detail).toMatch(/^lines up to (9\d\d|1000)px wide \(measure 800px\)$/);
    // A selector holds what it names, a container of paragraphs included.
    host.remove();
    render(`<div class="message" style="width:1000px"><p>${LONG} ${LONG}</p><p>Short.</p></div>`);
    expect(rules(await findSizeIssues({ measures: [{ selector: ".message", measure: "800px" }] })).filter((rule) => rule === "long-lines")).toEqual(["long-lines"]);
  });

  it("holds prose to a measure in ch, the width of so many zeros in its own font", async () => {
    // A font feature empties the font shorthand; the measure still reads the element's own font, not the canvas's 10px.
    render(`<p id="wide" style="width:1200px;font-size:16px">${LONG} ${LONG}</p><p style="width:300px;font-size:16px">${LONG}</p><p style="width:640px;font-size:16px;font-feature-settings:'tnum' on;font-variant-numeric:tabular-nums">${LONG} ${LONG}</p>`);
    const issues = (await findSizeIssues(prose("75ch"))).filter((issue) => issue.rule === "long-lines");
    expect(issues.map((issue) => issue.element.split(" ")[0])).toEqual(["p#wide"]);
    expect(issues[0]!.detail).toMatch(/^lines up to \d+px wide \(measure 75ch\)$/);
  });

  it("counts columns side by side as lines of their own, and a run of short items as a list, not prose", async () => {
    const items = Array.from({ length: 6 }, (_, i) => `${i + 3} customers with a note`).join(" · ");
    render(`
      <p style="width:1800px;columns:3;column-gap:48px;font-size:16px">${LONG} ${LONG} ${LONG} ${LONG} ${LONG} ${LONG}</p>
      <p style="width:2000px;white-space:nowrap">${items}</p>
      <p id="prose" style="width:2000px;white-space:nowrap">${items} · ${LONG}</p>`);
    const issues = (await findSizeIssues(prose("100 chars"))).filter((issue) => issue.rule === "long-lines");
    expect(issues.map((issue) => issue.element.split(" ")[0])).toEqual(["p#prose"]);
    host.remove();
    render(`<p style="width:1800px;columns:3;column-gap:48px;font-size:16px">${LONG} ${LONG} ${LONG} ${LONG} ${LONG} ${LONG}</p>`);
    expect((await findSizeIssues({ measures: [{ selector: null, measure: "640px" }] })).filter((issue) => issue.rule === "long-lines")).toEqual([]);
  });

  it("checks an element two measures hold against the first only", async () => {
    render(`<p id="wide" style="width:1800px">${LONG} ${LONG}</p>`);
    const issues = await findSizeIssues({ measures: [{ selector: "#wide", measure: "1900px" }, { selector: null, measure: "100 chars" }] });
    expect(issues.filter((issue) => issue.rule === "long-lines")).toEqual([]);
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
    expect(rules(await findSizeIssues(prose("100 chars")))).not.toContain("long-lines");
  });
});

describe("findSizeIssues: narrow-text", () => {
  const narrow = (issues: { rule: string; element: string; detail: string }[]) => issues.filter((issue) => issue.rule === "narrow-text");

  it("flags prose a max-width holds under three quarters of a column at least 900px wide, naming the cap and the rule that set it", async () => {
    render(`<section style="width:1200px"><style>.about p { max-width: 46rem }</style><div class="about"><p id="cap">${LONG} ${LONG}</p></div></section>`);
    const issues = narrow(await findSizeIssues());
    expect(issues.map((issue) => issue.element.split(" ")[0])).toEqual(["p#cap"]);
    const width = Math.round(document.getElementById("cap")!.getBoundingClientRect().width);
    expect(issues[0]!.detail).toMatch(new RegExp(`^This paragraph wraps at ${width}px in a 1200px column, leaving the rest empty\\. Let it use the width it has: remove \`\\.about p \\{ max-width: 46rem \\}\`\\.`));
    expect(issues[0]!.detail).toContain('declare it at 40ch or wider: read the max-width from a --measure-* token, add data-ouro-measure to the text, or set "measure" in ouro-check.json');
    expect(document.getElementById("cap")!.getAttribute("data-ouro-check-ref")).toBeTruthy();
  });

  it("finds one cap once, naming its first paragraph, and names an inline style as the cap's source", async () => {
    render(`<section style="width:1200px"><div style="max-width:46rem"><p id="first">${LONG} ${LONG}</p><p>${LONG} ${LONG}</p></div></section>`);
    const issues = narrow(await findSizeIssues());
    expect(issues.map((issue) => issue.element.split(" ")[0])).toEqual(["p#first"]);
    expect(issues[0]!.detail).toContain("leaving the rest empty");
    expect(issues[0]!.detail).toContain('`style="max-width: 46rem" on div`');
  });

  it("names a list item and other text by kind, and reads a percentage cap, a calc() cap, a content-box cap and one no max-width rule names", async () => {
    render(`<section style="width:1200px">
      <ul style="margin:0;padding:0;list-style:none"><li id="half" style="max-width:50%">${LONG} ${LONG}</li></ul>
      <blockquote id="boxed" style="margin:0;box-sizing:content-box;padding-inline:8px;max-width:40rem">${LONG} ${LONG}</blockquote>
      <dl style="margin:0"><dd id="logical" style="margin:0;max-inline-size:40rem">${LONG} ${LONG}</dd></dl>
      <p id="mixed" style="margin:0;max-width:calc(40% + 20px)">${LONG} ${LONG}</p>
    </section>`);
    const issues = narrow(await findSizeIssues());
    expect(issues.map((issue) => issue.element.split(" ")[0])).toEqual(["li#half", "blockquote#boxed", "dd#logical", "p#mixed"]);
    expect(issues[0]!.detail).toMatch(/^This list item wraps at 600px in a 1200px column/);
    expect(issues[0]!.detail).toContain('`style="max-width: 50%" on li#half`');
    expect(issues[1]!.detail).toMatch(/^This text wraps at 656px in a 1200px column/);
    expect(issues[2]!.detail).toContain("`max-width: 640px on dd#logical`");
    expect(issues[3]!.detail).toMatch(/^This paragraph wraps at 500px in a 1200px column/);
  });

  it("passes a page column that holds more than prose, capped however narrow against a wide screen", async () => {
    render(`<section style="width:2560px"><div style="max-width:1422px;margin-inline:auto"><h2>Composed UI</h2><p>${LONG} ${LONG}</p><img alt="" width="40" height="40"></div></section>`);
    expect(narrow(await findSizeIssues())).toEqual([]);
  });

  it("leaves a measure the page declares at 40ch or wider, by data-ouro-measure or a --measure-* token, and flags one declared narrower", async () => {
    const page = (lede: string, attr = "") =>
      `<section style="width:1200px"><style>:root { --measure-lede: ${lede}; } .lede { max-width: var(--measure-lede); } .note { max-width: ${lede}; }</style><p class="lede">${LONG} ${LONG}</p><div class="note"${attr}><p>${LONG} ${LONG}</p></div></section>`;
    render(page("44ch", " data-ouro-measure"));
    expect(narrow(await findSizeIssues())).toEqual([]);
    host.remove();
    render(page("30ch", " data-ouro-measure"));
    const narrower = narrow(await findSizeIssues());
    expect(narrower.map((issue) => issue.element.split(" ")[0])).toEqual(["p.lede", "p"]);
    expect(narrower[0]!.detail).toMatch(/^This paragraph's declared measure, `\.lede \{ max-width: var\(--measure-lede\) \}`, holds it to \d+px, under 40ch in its font, too narrow to read comfortably\./);
    host.remove();
    // A cap that names no measure is still the habit the rule is for, at any width.
    render(page("44ch"));
    expect(narrow(await findSizeIssues()).map((issue) => issue.element.split(" ")[0])).toEqual(["p"]);
  });

  it("leaves text a declared measure covers, a page's prose included, and text an opt-out with a reason allows", async () => {
    const html = `<section style="width:1200px"><div class="about"><p style="max-width:46rem">${LONG} ${LONG}</p></div></section>`;
    render(html);
    expect(narrow(await findSizeIssues({ measures: [{ selector: null, measure: "72ch" }] }))).toEqual([]);
    host.remove();
    render(html);
    expect(narrow(await findSizeIssues({ measures: [{ selector: ".about p", measure: "72ch" }] }))).toEqual([]);
    host.remove();
    render(`<section style="width:1200px"><p style="max-width:46rem" data-ouro-allow="narrow-text" data-ouro-allow-why="a pull quote on purpose">${LONG} ${LONG}</p></section>`);
    expect(narrow(await findSizeIssues())).toEqual([]);
    host.remove();
    render(`<section style="width:1200px"><p style="max-width:46rem" data-ouro-allow="narrow-text">${LONG} ${LONG}</p></section>`);
    expect(narrow(await findSizeIssues())).toHaveLength(1);
  });

  it("finds nothing in a column under 900px wide, however far its text is capped", async () => {
    render(`<section style="width:800px"><p style="max-width:30rem">${LONG} ${LONG}</p></section>`);
    expect(narrow(await findSizeIssues())).toEqual([]);
  });

  it("passes what is narrow by its layout or a container, not by a max-width on the text: sidebars, grids, cards, cells, centred and one-line text", async () => {
    render(`
      <section style="width:1200px">
        <div style="width:300px"><p>${LONG}</p></div>
        <div style="display:grid;grid-template-columns:300px 1fr"><p>${LONG}</p><p>${LONG}</p></div>
        <div style="max-width:46rem;width:300px"><p>${LONG}</p></div>
        <p style="text-align:center;max-width:46rem">${LONG} ${LONG}</p>
        <p style="max-width:46rem">Short.</p>
        <div data-ouro="card" style="max-width:320px"><p>${LONG}</p></div>
        <table style="width:1200px"><tr><td style="max-width:320px"><p>${LONG}</p></td></tr></table>
        <aside style="width:300px"><p>${LONG}</p></aside>
      </section>
      <div style="max-width:46rem"><div style="display:flex"><p>${LONG}</p></div></div>
      <main style="max-width:46rem"><p>${LONG} ${LONG}</p></main>`);
    expect(narrow(await findSizeIssues())).toEqual([]);
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

  it("leaves out the part of a picture a clipping box cuts away, and a label on an opaque backing of its own, but not one on a see-through backing", async () => {
    const url = await picture(100, 100);
    render(`
      <section style="position:relative"><div style="height:60px;overflow:hidden"><img src="${url}" alt="cut short" style="width:100px;height:100px;display:block"></div><p style="margin:0">See more</p></section>
      <section style="position:relative"><div style="height:0;overflow:hidden"><img src="${url}" alt="cut away" style="width:100px;height:100px;display:block"></div><p style="margin:0">Under nothing</p></section>
      <section style="position:relative"><img src="${url}" alt="under a chip" style="width:100px;height:100px;display:block"><span style="position:absolute;bottom:4px;left:4px;background:#eee;padding:2px">GIF</span><span style="position:absolute;top:4px;left:4px;background:oklch(0.9 0.02 250 / 0.95);padding:2px">New</span></section>
      <section style="position:relative"><img src="${url}" alt="under a see-through label" style="width:100px;height:100px;display:block"><span style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.5);color:white;padding:2px">Caption</span></section>`);
    await decodeImages();
    expect(findOverlaps().map((issue) => issue.element)).toEqual(['span "Caption" × img "under a see-through label"']);
  });

  it("passes text on a glass scrim of its own over a picture, around it or a layer beside it, but not on a faint fill or on glass too thin", async () => {
    const url = await picture(100, 100);
    // A grid cell holds the picture, then a band: a glass layer and the text, each a layer of its own.
    const band = (glass: string, text: string) =>
      `<section style="display:grid;width:100px"><img src="${url}" alt="${text}" style="grid-area:1/1;width:100px;height:100px;display:block"><div style="grid-area:1/1;align-self:end;display:grid"><div style="grid-area:1/1;z-index:1;${glass}"></div><span style="grid-area:1/1;z-index:2;padding:4px">${text}</span></div></section>`;
    render(
      band("background:rgba(255,255,255,0.78);backdrop-filter:blur(12px)", "Glass") +
      band("background:color(srgb 0.1 0.2 0.3 / 0.78);backdrop-filter:blur(12px)", "Profiled glass") +
        band("background:rgba(255,255,255,0.95)", "Solid") +
        band("background:rgba(255,255,255,0.78)", "Faint") +
        band("background:rgba(255,255,255,0.4);backdrop-filter:blur(12px)", "Thin") +
      band("background:color(display-p3 0.1 0.2 0.3 / 0.4);backdrop-filter:blur(12px)", "Profiled thin") +
        `<section style="position:relative"><img src="${url}" alt="Around" style="width:100px;height:100px;display:block"><span style="position:absolute;bottom:4px;left:4px;background:rgba(255,255,255,0.7);backdrop-filter:blur(8px);padding:2px">Glass chip</span></section>`,
    );
    await decodeImages();
    expect(findOverlaps().map((issue) => issue.element)).toEqual(['span "Faint" × img "Faint"', 'span "Thin" × img "Thin"', 'span "Profiled thin" × img "Profiled thin"']);
  });

  it("reads a glass band only where it covers the whole overlap on the screen, never a picture's own box or a chip on it", async () => {
    const url = await picture(100, 100);
    // A band whose line crosses the bottom of the screen at the first scroll step: backed where it shows.
    const fold = innerHeight - 100 + 20;
    render(
      `<div style="height:${fold}px"></div><section style="display:grid;width:100px"><img src="${url}" alt="At the fold" style="grid-area:1/1;width:100px;height:100px;display:block"><div style="grid-area:1/1;align-self:end;display:grid"><div style="grid-area:1/1;z-index:1;background:rgba(255,255,255,0.78);backdrop-filter:blur(12px)"></div><span style="grid-area:1/1;z-index:2;padding:4px">Folded</span></div></section>` +
        // A picture no pointer meets, on a filled box of its own: the text is on the picture.
        `<section style="position:relative;width:100px"><div style="background:#000"><img src="${url}" alt="Untouchable" style="pointer-events:none;width:100px;height:100px;display:block"></div><span style="position:absolute;bottom:4px;left:4px;color:#fff">On it</span></section>` +
        // A small disc where a caption crosses a picture: the rest of the caption is on the picture.
        `<section style="position:relative;width:100px"><img src="${url}" alt="Video" style="width:100px;height:100px;display:block"><span style="position:absolute;top:40px;left:40px;width:20px;height:20px;border-radius:50%;background:#fff;z-index:1"></span><span style="position:absolute;top:42px;left:0;z-index:2;white-space:nowrap">A caption across it</span></section>` +
        // A collision off the side of the screen, as in a carousel: no glass shows there to back it.
        `<section style="position:relative;left:-300px;width:100px"><div style="display:grid"><img src="${url}" alt="Aside" style="grid-area:1/1;width:100px;height:100px;display:block"><div style="grid-area:1/1;z-index:1;align-self:end;background:rgba(255,255,255,0.78);backdrop-filter:blur(12px);height:28px"></div><span style="grid-area:1/1;z-index:2;align-self:end;padding:4px">Off to the side</span></div></section>` +
        `<div style="height:${innerHeight}px"></div>`,
    );
    await decodeImages();
    expect(findOverlaps().map((issue) => issue.element)).toEqual(['span "On it" × img "Untouchable"', 'span "A caption across it" × img "Video"', 'span "Off to the side" × img "Aside"']);
  });

  it("passes page text under an opaque overlay: a dialog, a menu, a popover or a floating panel, on a fill of its own or a box in it", () => {
    const over = (attrs: string, style: string, inner = "Over the page") => `<div style="position:relative"><p style="margin:0">Page text under the overlay</p><div ${attrs} style="position:absolute;top:0;left:0;width:240px;height:60px;${style}"><span>${inner}</span></div></div>`;
    render(
      [
        over('role="menu"', "background:#fff"),
        over('role="dialog"', "background:rgb(30 30 30)"),
        over('data-popover=""', "", '<div style="background:#fff">On a box of its own</div>'),
        over("", "background:oklch(0.98 0 0 / 0.95)"),
        over("", "background:color(srgb 0.1 0.2 0.3 / 0.95)"),
        over("", "background:color(display-p3 0.1 0.2 0.3)"),
        over("", "background:color-mix(in srgb, rgb(24 88 164) 90%, transparent)"),
      ].join(""),
    );
    expect(findOverlaps()).toEqual([]);
  });

  it("finds page text under a see-through overlay, a small badge, or a floating box with no fill", () => {
    render(`
      <div style="position:relative"><p style="margin:0">Under a see-through menu</p><div role="menu" style="position:absolute;top:0;left:0;width:240px;height:60px;background:rgba(255,255,255,0.5)">A see-through menu</div></div>
      <div style="position:relative"><p style="margin:0">Under a profiled menu</p><div role="menu" style="position:absolute;top:0;left:0;width:240px;height:60px;background:color(srgb 0.1 0.2 0.3 / 0.5)">A profiled menu</div></div>
      <div style="position:relative"><p style="margin:0">Under a badge</p><span style="position:absolute;top:0;left:0;width:40px;height:20px;background:#fff">99+</span></div>
      <div style="position:relative"><p style="margin:0">Under a clear panel</p><div style="position:absolute;top:0;left:0;width:240px;height:60px">A clear panel</div></div>`);
    expect(findOverlaps().map((issue) => issue.element)).toEqual([
      'p "Under a see-through menu" × div "A see-through menu"',
      'p "Under a profiled menu" × div "A profiled menu"',
      'p "Under a badge" × span "99+"',
      'p "Under a clear panel" × div "A clear panel"',
    ]);
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

describe("findImageFades", () => {
  const box = "width:200px;height:100px;display:block";
  it("reads a linear mask's ramp along its line and finds only a picture in the part it fades, and any picture under a mask it can't read so", async () => {
    const url = await picture(200, 40);
    // A 200px square masked box, with one picture placed in it.
    const masked = (id: string, mask: string, place: string, extra = "") => `<div style="display:flow-root;width:200px;height:200px;mask-image:${mask};${extra}"><img id="${id}" src="${url}" alt="" style="display:block;width:${place.includes("left") ? "50px;height:200px" : "200px;height:40px"};${place}"></div>`;
    render(
      [
        masked("fold", "linear-gradient(#000 calc(100% - 3rem), transparent)", "margin-top:160px"),
        masked("fold-clear", "linear-gradient(#000 calc(100% - 3rem), transparent)", "margin-top:0"),
        masked("inert", "linear-gradient(#000 108px, transparent 108px, #000 108px)", "margin-top:90px"),
        masked("top", "linear-gradient(to top, transparent, #000 20%)", "margin-top:160px"),
        masked("top-clear", "linear-gradient(to top, transparent, #000 20%)", "margin-top:0"),
        masked("right", "linear-gradient(90deg, transparent, #000 10%)", "margin-left:0"),
        masked("right-clear", "linear-gradient(90deg, transparent, #000 10%)", "margin-left:150px"),
        masked("left", "linear-gradient(-90deg, rgba(0,0,0,0) clamp(1px, 5%, 30px), #000)", "margin-left:150px"),
        masked("minmax", "linear-gradient(transparent min(20px, 50%), #000 max(30px, 10%))", "margin-top:0"),
        masked("viewport", "linear-gradient(#000 1vh, transparent 2vh)", "margin-top:160px"),
        masked("plus", "linear-gradient(transparent calc(5% + 10px), #000 calc(5% + 20px))", "margin-top:0"),
        masked("behind-clear", "linear-gradient(transparent -10px, #000 -5px)", "margin-top:0"),
        masked("two-places", "linear-gradient(#000 0 150px, transparent 160px 200px)", "margin-top:0"),
        masked("ordered", "linear-gradient(#000 100px, #000, transparent 50px)", "margin-top:160px"),
        masked("ordered-clear", "linear-gradient(#000 100px, #000, transparent 50px)", "margin-top:0"),
        masked("sized", "linear-gradient(#000, #000 190px, transparent)", "margin-top:0", "mask-size:100% 50%"),
        masked("layers", "linear-gradient(#000, #000), linear-gradient(transparent, #000 10px)", "margin-top:0"),
        masked("diagonal", "linear-gradient(to right bottom, #000 190px, transparent)", "margin-top:0"),
        masked("angled", "linear-gradient(45deg, #000 190px, transparent)", "margin-top:0"),
        masked("see-through", "linear-gradient(oklch(0.5 0.1 200 / 0.4), #000 10px)", "margin-top:0"),
        masked("unread", "linear-gradient(#000 50vb, transparent 50vb)", "margin-top:0"),
        // A scroll area's edges, both faded while it scrolls: a picture in its middle isn't faded.
        masked("edges", "linear-gradient(transparent, #000 min(24px, 2rem), #000 calc(100% - min(24px, 2rem)), transparent)", "margin-top:0"),
        masked("edges-clear", "linear-gradient(transparent, #000 min(24px, 2rem), #000 calc(100% - min(24px, 2rem)), transparent)", "margin-top:80px"),
      ].join(""),
    );
    const found = findImageFades().map((issue) => issue.element);
    // WebKit computes a viewport length as px, which reads; Chromium keeps vb, which the rule doesn't, so it counts as
    // fading.
    expect(found).toEqual(["img#fold", "img#top", "img#right", "img#left", "img#minmax", "img#viewport", "img#plus", "img#ordered", "img#sized", "img#layers", "img#diagonal", "img#angled", "img#see-through", ...(server.browser === "chromium" ? ["img#unread"] : []), "img#edges"]);
  });


  it("finds a picture faded by a gradient mask on itself or a box around it, by either mask property", async () => {
    const url = await picture(200, 100);
    render(`
      <img id="own" src="${url}" alt="own" style="${box};mask-image:linear-gradient(#000,transparent)">
      <div class="hero frame" style="-webkit-mask-image:radial-gradient(#000,transparent)"><img src="${url}" alt="inside" style="${box}"></div>
      <div style="${box};background:url(${url}) center/cover;mask-image:linear-gradient(to top,transparent,#000)"></div>
      <svg width="200" height="100" style="display:block;mask-image:linear-gradient(#000,transparent)"><image href="${url}" width="200" height="100"></image></svg>
      <img src="${new URL("../scripts/check/fixtures/picture-160.png", import.meta.url).href}" alt="named" style="${box};mask-image:linear-gradient(#000,transparent)">`);
    const issues = findImageFades();
    expect(issues).toEqual([
      { ref: "f1", rule: "image-fade", element: "img#own", detail: "faded by a gradient mask on the picture itself" },
      { ref: "f2", rule: "image-fade", element: "img", detail: "faded by a gradient mask on div.hero.frame" },
      { ref: "f3", rule: "image-fade", element: "div", detail: "faded by a gradient mask on the picture itself" },
      { ref: "f4", rule: "image-fade", element: "image", detail: "faded by a gradient mask on svg" },
      { ref: "f5", rule: "image-fade", element: "fixtures/picture-160.png", detail: "faded by a gradient mask on the picture itself" },
    ]);
    // A second run marks each picture again, beside its first mark.
    findImageFades();
    expect(document.getElementById("own")!.getAttribute("data-ouro-check-ref")).toBe("f1 f6");
  });

  it("passes a mask that cuts a hard-edged hole out of a picture, and still finds a radial mask that fades its edge", async () => {
    const url = await picture(200, 100);
    render(`
      <div id="bite" style="${box};mask-image:radial-gradient(circle at 170px 70px, transparent 14px, #000 14.5px)"><img src="${url}" alt="bite" style="${box}"></div>
      <div id="soft-hole" style="${box};mask-image:radial-gradient(circle at 170px 70px, transparent 14px, #000 60px)"><img src="${url}" alt="soft" style="${box}"></div>
      <div id="vignette" style="${box};mask-image:radial-gradient(circle at 100px 50px, #000 14px, transparent 14.5px)"><img src="${url}" alt="vignette" style="${box}"></div>`);
    expect(findImageFades().map((issue) => issue.detail)).toEqual(["faded by a gradient mask on div#soft-hole", "faded by a gradient mask on div#vignette"]);
  });

  it("finds a picture that a gradient to transparent covers: an overlay, or a ::before or ::after of the picture or a box around it", async () => {
    const url = await picture(200, 100);
    render(`
      <style>
        .scrim { position: relative; width: 200px }
        .scrim::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, transparent, #fff) }
        .wash { position: relative; background: url(${url}) center / cover }
        .wash::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 40px; background: linear-gradient(rgba(0, 0, 0, 0), rgb(0, 0, 0)) }
        .outer { position: relative; width: 200px }
        .inner::after { content: ""; position: absolute; inset: 0; background: linear-gradient(oklch(1 0 0 / 0), oklch(1 0 0)) }
        .lid { position: relative; width: 200px }
        .lid::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 30px; background: linear-gradient(#fff, transparent) }
      </style>
      <div class="scrim"><img src="${url}" alt="scrim" style="${box}"></div>
      <div class="wash" style="${box}"></div>
      <div class="outer"><div class="inner"><img src="${url}" alt="inner" style="${box}"></div></div>
      <div style="position:relative;width:200px"><img id="under" src="${url}" alt="under" style="${box}"><div class="shade" style="position:absolute;inset:0 0 50px 0;background:linear-gradient(to top,rgba(255,255,255,0),#fff)"></div></div>
      <div style="position:relative;width:200px"><img id="vignette" src="${url}" alt="vignette" style="${box}"><div class="edge" style="position:absolute;inset:0;background:radial-gradient(circle,transparent 40%,#000)"></div></div>
      <div class="lid"><img src="${url}" alt="lid" style="${box}"></div>
      <div id="layered" style="${box};background:linear-gradient(transparent,#fff),url(${url}) center/cover"></div>
      <div style="position:relative;width:200px"><div class="late" style="position:absolute;inset:0"></div><img src="${url}" alt="after" style="${box};position:relative"><div class="cover" style="position:absolute;inset:0;background:linear-gradient(transparent,#000)"></div></div>`);
    expect(findImageFades().map(({ element, detail }) => [element, detail])).toEqual([
      ["img", "100% covered by the gradient to transparent of div.scrim::after"],
      ["div.wash", "40% covered by the gradient to transparent of div.wash::before"],
      ["img", "100% covered by the gradient to transparent of div.inner::after"],
      ["img#under", "50% covered by the gradient to transparent of div.shade"],
      ["img#vignette", "100% covered by the gradient to transparent of div.edge"],
      ["img", "30% covered by the gradient to transparent of div.lid::before"],
      ["div#layered", "faded by a gradient layered over its own background"],
      ["img", "100% covered by the gradient to transparent of div.cover"],
    ]);
  });

  it("finds a picture under a fixed ::before or ::after, placed on the screen", async () => {
    const url = await picture(200, 100);
    render(`<style>.veil::after { content: ""; position: fixed; inset: 0; background: linear-gradient(transparent, #000) }</style><div class="veil"><img src="${url}" alt="veiled" style="${box}"></div>`);
    expect(findImageFades()).toMatchObject([{ rule: "image-fade", detail: "100% covered by the gradient to transparent of div.veil::after" }]);
  });

  it("passes a picture with a hard edge, on a solid band, beside or under a gradient, hidden, or allowed with a reason", async () => {
    const url = await picture(200, 100);
    render(`
      <style>
        .flow::after { content: ""; display: block; height: 20px; background: linear-gradient(transparent, #000) }
        .sky { position: relative }
        .sky::before { content: ""; position: absolute; inset: 0; background: linear-gradient(#9cf, #fde) }
        .thin { position: relative; width: 200px }
        .backdrop { position: relative; isolation: isolate }
        .backdrop::before { content: ""; position: absolute; inset: 0; z-index: -1; background: linear-gradient(transparent, #fff) }
        .under { position: relative }
        .under::before { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent, #fff) }
        .thin::after { content: ""; position: absolute; left: 0; top: 0; width: 100%; height: 5px; background: linear-gradient(transparent, #000) }
      </style>
      <div style="background:#eee;padding:8px"><img src="${url}" alt="band" style="${box}"></div>
      <div class="flow"><img src="${url}" alt="flow" style="${box}"></div>
      <div class="sky"><img src="${url}" alt="sky" style="${box}"></div>
      <div class="thin"><img src="${url}" alt="thin" style="${box}"></div>
      <div class="backdrop"><img src="${url}" alt="backdrop" style="${box}"></div>
      <div class="under"><img src="${url}" alt="positioned" style="${box};position:relative"></div>
      <div style="${box};background:url(${url}) center/cover,linear-gradient(transparent,#fff)"></div>
      <div style="${box};background:linear-gradient(rgb(0 0 0 / 0.2),rgb(0 0 0 / 0.2)),url(${url}) center/cover"></div>
      <div style="position:relative;width:200px"><div style="position:absolute;inset:0;z-index:-1;background:linear-gradient(transparent,#000)"></div><img src="${url}" alt="behind" style="${box}"></div>
      <div style="position:relative;width:200px"><div style="position:absolute;inset:0;background:linear-gradient(transparent,#000)"></div><img src="${url}" alt="earlier" style="${box};position:relative"></div>
      <div style="position:absolute;top:0;left:400px;background:linear-gradient(transparent,#fff)"><img src="${url}" alt="inside an overlay" style="${box}"></div>
      <div style="position:relative;width:200px"><img src="${url}" alt="overlay allowed" style="${box}"><div data-image-fade-ok="a caption band over a cropped picture" style="position:absolute;inset:0;background:linear-gradient(transparent,#000)"></div></div>
      <div style="position:relative;width:200px"><img src="${url}" alt="opaque" style="${box}"><div style="position:absolute;inset:0;background:linear-gradient(#000,#fff)"></div></div>
      <div style="position:relative;width:200px"><img src="${url}" alt="glow" style="${box}"><div style="position:absolute;inset:0;background:radial-gradient(circle,rgb(255 238 196 / 0.75),transparent 70%),conic-gradient(from 90deg,rgba(255,255,255,0.4),transparent)"></div></div>
      <div style="position:relative;width:200px"><img src="${url}" alt="clear" style="${box}"><div style="position:absolute;inset:0;background:linear-gradient(transparent,rgba(0,0,0,0))"></div></div>
      <img src="${url}" alt="hidden" hidden style="${box};mask-image:linear-gradient(#000,transparent)">
      <img src="${url}" alt="invisible" style="${box};visibility:hidden;mask-image:linear-gradient(#000,transparent)">
      <img src="${url}" alt="empty" style="width:0;height:0;mask-image:linear-gradient(#000,transparent)">
      <div data-image-fade-ok="a cut-out on purpose"><img src="${url}" alt="alias" style="${box};mask-image:linear-gradient(#000,transparent)"></div>
      <img src="${url}" alt="allowed" data-ouro-allow="image-fade" data-ouro-allow-why="a cut-out on purpose" style="${box};mask-image:linear-gradient(#000,transparent)">
      <img src="${url}" alt="all" data-ouro-allow="all" data-ouro-allow-why="a cut-out on purpose" style="${box};mask-image:linear-gradient(#000,transparent)">
      <img src="${url}" alt="shape" style="${box};mask-image:url(${url})">
      <p style="mask-image:linear-gradient(to right,#000 80%,transparent)">Text may fade at its end; it is no picture.</p>
      <div style="width:200px;height:40px;background:linear-gradient(transparent,#000)"></div>
      <img id="no-reason" src="${url}" alt="no reason" data-ouro-allow="image-fade" style="${box};mask-image:linear-gradient(#000,transparent)">
      <img id="spaces" src="${url}" alt="spaces" data-image-fade-ok="  " style="${box};mask-image:linear-gradient(#000,transparent)">`);
    expect(findImageFades().map((issue) => issue.element)).toEqual(["img#no-reason", "img#spaces"]);
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

  it("lists every opt-out with a reason, and none without one, nor blurry-image, which no opt-out allows", () => {
    render(`
      <p id="ticker" data-ouro-allow="long-lines clipped-text" data-ouro-allow-why="a ticker">${LONG}</p>
      <p data-ouro-allow="overlap" data-ouro-allow-why="">No reason</p>
      <img data-ouro-allow="blurry-image stretched-image" data-ouro-allow-why="a placeholder" alt="Stretched">
      <img data-ouro-allow="blurry-image" data-ouro-allow-why="a soft backdrop" alt="Soft">
      <div class="a b c d" data-overlap-ignore="  a stamp " aria-label="Stamp"></div>
      <img data-size-ignore="a soft backdrop" alt="Backdrop">
      <span data-long-lines-ok="">No reason</span>
      <span data-clip-ok="   ">Spaces are no reason</span>
      <p data-ouro-allow="overlap" data-ouro-allow-why="  ">Spaces are no reason</p>
      <span data-clip-ok="a code"></span>
      <div data-scroll-x="a timeline"></div>
      <img data-image-fade-ok="a cut-out on purpose" alt="Cut-out">`);
    const allowances = listAllowances(ALIASES);
    // Read, never rewritten: the page keeps its own attributes.
    expect(host.querySelector("[data-overlap-ignore]")!.getAttribute("data-overlap-ignore")).toBe("  a stamp ");
    expect(allowances).toEqual([
      { rules: "long-lines clipped-text", element: `p#ticker "${LONG.slice(0, 40)}…"`, reason: "a ticker" },
      { rules: "stretched-image", element: 'img "Stretched"', reason: "a placeholder" },
      { rules: "overlap", element: 'div.a.b.c "Stamp" [data-overlap-ignore]', reason: "a stamp" },
      { rules: "clipped-text", element: "span [data-clip-ok]", reason: "a code" },
      { rules: "sideways-scroll", element: "div [data-scroll-x]", reason: "a timeline" },
      { rules: "sideways-scroll clipped-text long-lines stretched-image", element: 'img "Backdrop" [data-size-ignore]', reason: "a soft backdrop" },
      { rules: "image-fade", element: 'img "Cut-out" [data-image-fade-ok]', reason: "a cut-out on purpose" },
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
  it("reports serious and critical violations, one per rule, and leaves out allowed elements, read with their reasons trimmed", async () => {
    render(`
      <button id="unnamed"><svg width="10" height="10" aria-hidden="true"></svg></button>
      <button class="nameless"><svg width="10" height="10" aria-hidden="true"></svg></button>
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="20" height="20">
      <div data-ouro-allow="axe" data-ouro-allow-why="a third-party widget we do not own"><button><svg width="10" height="10" aria-hidden="true"></svg></button></div>
      <div data-ouro-allow=" all " data-ouro-allow-why="a vendor's frame"><button><svg width="10" height="10" aria-hidden="true"></svg></button></div>
      <div data-ouro-allow="axe"><button><svg width="10" height="10" aria-hidden="true"></svg></button></div>
      <div data-ouro-allow="all" data-ouro-allow-why="   "><button><svg width="10" height="10" aria-hidden="true"></svg></button></div>
      <div data-ouro-allow="overlap" data-ouro-allow-why="another rule"><button><svg width="10" height="10" aria-hidden="true"></svg></button></div>`);
    const issues = await runAxe();
    const button = issues.find((issue) => issue.element.startsWith("button-name"))!;
    expect(button).toMatchObject({ rule: "axe", impact: "critical", element: "button-name: #unnamed", detail: "critical: Buttons must have discernible text (5 elements)" });
    expect(document.getElementById("unnamed")!.getAttribute("data-ouro-check-ref")).toBe(button.ref);
    const image = issues.find((issue) => issue.element.startsWith("image-alt"))!;
    expect(image.detail).toBe("critical: Images must have alternative text");
    expect(issues.every((issue) => issue.impact === "serious" || issue.impact === "critical")).toBe(true);
    host.innerHTML = `<button>Named</button>`;
    expect(await runAxe()).toEqual([]);
  });

  it("leaves out Base UI's focus guards, as Ouro's axe kit does, but not another focusable element under aria-hidden", async () => {
    render(`<span data-base-ui-focus-guard="" data-type="outside" aria-hidden="true" tabindex="0" style="position:fixed;width:1px;height:1px;overflow:hidden"></span><button>Named</button>`);
    expect(await runAxe()).toEqual([]);
    host.innerHTML = `<span aria-hidden="true" tabindex="0">Hidden but focusable</span>`;
    expect((await runAxe()).map((issue) => issue.element)).toEqual([expect.stringMatching(/^aria-hidden-focus: /)]);
  });
});

describe("findFragmentFocusIssues", () => {
  const added: Element[] = [];
  const page = window as unknown as { __ouroFragmentFocus?: { parsed: boolean; script: Element | null } };
  afterEach(() => {
    for (const element of added.splice(0)) element.remove();
    delete page.__ouroFragmentFocus;
    document.body.removeAttribute("data-ouro-check-ref");
    document.documentElement.removeAttribute("data-ouro-allow");
    document.documentElement.removeAttribute("data-ouro-allow-why");
  });
  /** Adds a stylesheet link to <head>. */
  const sheet = (href = "data:text/css,i{}") => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
    document.head.append(link);
    added.push(link);
  };
  /** What fragmentFocusScript records as it runs: here, an element at the start of <body> or the end of <head>. */
  const ran = (parsed: boolean, where: "body" | "head" = "body") => {
    const script = document.createElement("script");
    if (where === "body") document.body.prepend(script);
    else document.head.append(script);
    added.push(script);
    page.__ouroFragmentFocus = { parsed, script };
    return script;
  };
  const details = () => findFragmentFocusIssues().map((issue) => issue.detail);

  it("finds a page with a stylesheet and no fragmentFocusScript, marked on the page", () => {
    sheet();
    const [issue, ...rest] = findFragmentFocusIssues();
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({ rule: "fragment-focus", element: "the page" });
    expect(issue!.detail).toMatch(/without fragmentFocusScript$/);
    expect(document.body.getAttribute("data-ouro-check-ref")).toBe(issue!.ref);
  });

  it("finds fragmentFocusScript that ran after the page was parsed, as one a script adds does", () => {
    sheet();
    ran(false);
    expect(details()).toEqual(["fragmentFocusScript ran after the page was parsed, too late to hold it: render it as a plain inline <script>, not one a script adds"]);
  });

  it("finds fragmentFocusScript before a stylesheet in <head>", () => {
    ran(true, "head");
    sheet("data:text/css,b{}");
    expect(details()).toEqual(["fragmentFocusScript comes before the stylesheet data:text/css,b{}, so Safari can still take focus as stylesheets load"]);
  });

  it("passes fragmentFocusScript run as the page was parsed after every stylesheet, or taken out since, a stylesheet link with no address, and a page allowed fragment-focus with a reason", () => {
    sheet();
    ran(true);
    expect(findFragmentFocusIssues()).toEqual([]);
    ran(true, "head").remove();
    sheet("data:text/css,b{}");
    expect(findFragmentFocusIssues()).toEqual([]);
    for (const element of added.splice(0)) element.remove();
    // A link with no address loads nothing, so a script before it in <head> is still after every stylesheet.
    sheet();
    ran(true, "head");
    const empty = Object.assign(document.createElement("link"), { rel: "stylesheet" });
    document.head.append(empty);
    added.push(empty);
    expect(findFragmentFocusIssues()).toEqual([]);
    for (const element of added.splice(0)) element.remove();
    delete page.__ouroFragmentFocus;
    sheet();
    document.documentElement.setAttribute("data-ouro-allow", "fragment-focus");
    document.documentElement.setAttribute("data-ouro-allow-why", "   ");
    expect(findFragmentFocusIssues()).toHaveLength(1);
    document.documentElement.setAttribute("data-ouro-allow-why", "a page no link points into");
    expect(findFragmentFocusIssues()).toEqual([]);
  });

  it("reads an allow of every rule on <body>, needs its reason, and judges a record with no script, or a stylesheet in <body> after the script", () => {
    // A page with no stylesheet to load has nothing for Safari to wait on.
    expect(document.querySelector('link[rel~="stylesheet"][href]')).toBeNull();
    expect(findFragmentFocusIssues()).toEqual([]);
    sheet();
    document.body.setAttribute("data-ouro-allow", "all");
    try {
      // An allow with no reason at all allows nothing.
      expect(findFragmentFocusIssues()).toHaveLength(1);
      document.body.setAttribute("data-ouro-allow-why", "a page no link points into");
      expect(findFragmentFocusIssues()).toEqual([]);
    } finally {
      document.body.removeAttribute("data-ouro-allow");
      document.body.removeAttribute("data-ouro-allow-why");
    }
    // A record that names no script: parsed, so nothing comes after it in <head>.
    page.__ouroFragmentFocus = { parsed: true, script: null };
    expect(findFragmentFocusIssues()).toEqual([]);
    // A stylesheet in <body> after the script holds no fragment jump the parser makes.
    const script = ran(true);
    const late = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "data:text/css,u{}" });
    script.after(late);
    added.push(late);
    expect(findFragmentFocusIssues()).toEqual([]);
    // Two findings on one page each add their own mark to <body>.
    document.body.removeAttribute("data-ouro-check-ref");
    page.__ouroFragmentFocus = { parsed: false, script };
    const [first] = findFragmentFocusIssues();
    const [second] = findFragmentFocusIssues();
    expect(document.body.getAttribute("data-ouro-check-ref")).toBe(`${first!.ref} ${second!.ref}`);
  });
});

describe("listPersonSignals", () => {
  it("names what the page holds that only a person can judge, and nothing for an error message", () => {
    host = render(`<div data-ouro="alert" data-tone="destructive">Could not save</div><p>Plain</p>`);
    expect(listPersonSignals()).toEqual([]);
    host.remove();
    host = render(`<button data-tone="destructive">Delete</button><form></form><div data-ouro="composer"></div>`);
    expect(listPersonSignals()).toEqual(["destructive", "form", "sends"]);
  });
});
