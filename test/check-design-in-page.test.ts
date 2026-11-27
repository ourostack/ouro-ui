import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { findDesignIssues, listCornerMedia, mediaDrawn, readCorners, shownCorners, type CornerReading } from "@/registry/ouro/check/design-check";
import { findRepaints, listenForMotion, markWalkables, readMotion, resetMotion } from "@/registry/ouro/check/motion-check";

// Ouro check's design rules and its jank measures, in a real browser: for each rule a page that fails it and one that
// passes, and the opt-outs. scripts/check/check.test.mts runs the whole check on fixture pages in Chromium.

const state = window as unknown as { __ouroCheckRef?: number; __ouroMotion?: { forced: number; shift: number; armed: boolean } };
let host: HTMLDivElement;
const urls: string[] = [];

beforeAll(() => {
  // Patches layout reads for the whole page, once, as the runner's init script does.
  listenForMotion();
});
afterEach(async () => {
  host?.remove();
  for (const el of [document.body, document.documentElement]) {
    for (const name of ["data-ouro-allow", "data-ouro-allow-why", "data-ouro-check-ref", "style"]) el.removeAttribute(name);
  }
  delete state.__ouroCheckRef;
  if (state.__ouroMotion?.armed) readMotion();
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
async function picture(width: number, height: number, fill: string | null = "#3a7"): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
  }
  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), "image/png"));
  const url = URL.createObjectURL(blob);
  urls.push(url);
  return url;
}

const frames = (n = 2) => new Promise<void>((done) => {
  const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
  step(n);
});
const rules = (issues: { rule: string }[]) => issues.map((issue) => issue.rule);
const of = (rule: string, options?: Parameters<typeof findDesignIssues>[0]) => findDesignIssues(options).filter((issue) => issue.rule === rule);
// Preflight holds a picture to its box (max-width: 100%), narrower than a banner on this screen.
const BANNER = "display:block;max-width:none;width:540px;height:280px";
const CLIP = new URL("../site/public/apple/media/hx-press.webm", import.meta.url).href;

describe("findDesignIssues: giant-picture", () => {
  it("finds a banner that leads a content item and outweighs its words, named by its words, alt or tag", async () => {
    const url = await picture(540, 280);
    const svg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='5'/%3E")`;
    render(`
      <article id="card"><div role="img" aria-label="A wide view of the hills" style="width:540px;height:280px;background:#3a7"></div><h2 style="margin:0;font-size:20px;line-height:24px">Hills</h2></article>
      <article><img src="${url}" alt="A lake" style="${BANNER}"><h3 style="margin:0">Lake</h3></article>
      <article><canvas width="540" height="280" style="display:block"></canvas><div role="heading" aria-level="3">Canvas</div></article>
      <article class="entry"><div style="width:540px;height:280px;background-image:${svg}"></div><h2 style="margin:0">Backdrop</h2><p style="margin:0">A line of words under it.</p></article>`);
    const issues = of("giant-picture");
    expect(issues.map((issue) => issue.element)).toEqual(['div "A wide view of the hills" in article#card "Hills"', 'img "A lake" in article "Lake"', 'canvas in article "Canvas"', 'div in article.entry "Backdrop"']);
    expect(issues[0]!).toMatchObject({ ref: "d1", detail: "the picture is 540×280, 92% of its item's height and 11.7 times its words'" });
    expect(host.querySelector('[role="img"]')!.getAttribute("data-ouro-check-ref")).toBe("d1");
  });

  it("passes a page's own banner, squarer pictures, short ones, pictures in a control, layers out of the flow, a figure's own picture, and pictures that lead no item", async () => {
    const svg = `<svg width="540" height="280"><svg width="540" height="280"></svg></svg>`;
    render(`
      <header><img alt="Hero" style="${BANNER}"><h2>In the header</h2></header>
      <article><img alt="Above an h1" style="${BANNER}"><h1>The page</h1></article>
      <article><h2>Title first</h2><img alt="Under its title" style="${BANNER}"></article>
      <article><img alt="Square" style="display:block;width:400px;height:400px"><h2>Square</h2></article>
      <article><img alt="Short" style="${BANNER};height:200px"><h2>Short</h2></article>
      <article style="width:900px"><img alt="Narrow" style="${BANNER}"><h2>A wider item</h2></article>
      <article><img alt="Words outweigh it" style="${BANNER}"><h2 style="height:400px">Long words</h2></article>
      <article><button><img alt="In a button" style="${BANNER}"></button><h2>Button</h2></article>
      <article><a href="#x"><img alt="Only child of a link" style="${BANNER}"></a><h2>Link</h2></article>
      <article>${svg}<h2>Nested svg</h2></article>
      <figure><img alt="A panel" style="${BANNER}"><figcaption><h2>A captioned panel</h2></figcaption></figure>
      <article style="position:relative"><img alt="A layer" style="${BANNER};position:absolute;inset:0"><h2>Drawn over</h2></article>
      <article><img alt="Allowed" data-ouro-allow="giant-picture" data-ouro-allow-why="a gallery" style="${BANNER}"><h2>Gallery</h2></article>
      <main><img alt="No item" style="${BANNER}"><p>Nothing but words</p></main>
      <div><img alt="No heading at all" style="${BANNER}"></div>
      <article><h2><img alt="In its heading" style="${BANNER}"></h2></article>`);
    expect(of("giant-picture").map((issue) => issue.element)).toEqual(['svg in article "Nested svg"']);
    expect(of("giant-picture", { pictureMin: 300 })).toEqual([]);
    expect(of("giant-picture", { pictureMin: 100 }).map((issue) => issue.element.split(" in ")[0])).toEqual(['img "Short"', "svg"]);
    expect(of("giant-picture", { pictureShare: 0.95, pictureRatio: 20 })).toEqual([]);
  });
});

describe("findDesignIssues: cramped-heading", () => {
  it("finds a heading too close under a picture or a filled or framed box, by half its size, or a quarter in its own item", () => {
    render(`
      <section><div style="height:100px;background:#3a7"></div><h2 id="own" style="margin:4px 0 0;font-size:24px;line-height:30px">Close under its own box</h2></section>
      <div><h2 style="margin:0;font-size:24px">First</h2><div id="framed" style="height:60px;border:1px solid #888"></div><h2 style="margin:10px 0 0;font-size:24px">Second</h2></div>
      <section><div style="height:80px;background:#3a7"></div><div class="row" style="display:flex;gap:8px;margin-top:2px"><span style="width:20px;height:20px"></span><h3 style="margin:0;font-size:20px">With an icon</h3></div></section>`);
    const issues = of("cramped-heading");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ['h2#own "Close under its own box"', "4px below div; a 24px heading needs 8px"],
      ['h2 "Second"', "10px below div#framed; a 24px heading needs 12px"],
      ['h3 "With an icon"', "2px below div; a 20px heading needs 8px"],
    ]);
    expect(host.querySelector(".row")!.getAttribute("data-ouro-check-ref")).toBe(issues[2]!.ref);
    expect(of("cramped-heading", { headingRoom: 0.25 }).map((issue) => issue.element)).toEqual(['h2#own "Close under its own box"', 'h3 "With an icon"']);
  });

  it("skips a fixed layer that covers the window, a sheet's scrim, and still finds a heading cramped under a real box", () => {
    render(`
      <div style="position:fixed;top:0;left:0;right:0;height:95vh;background:#445"></div>
      <section style="position:fixed;top:95vh;left:100px;width:300px"><h3 style="margin:0;font-size:16px">Why</h3></section>
      <section style="position:absolute;top:0;left:500px;width:300px"><div style="height:60px;background:#3a7"></div><h3 style="margin:2px 0 0;font-size:16px">Cramped</h3></section>`);
    expect(of("cramped-heading").map((issue) => issue.element)).toEqual(['h3 "Cramped"']);
  });

  it("skips a popover floating over a heading outside it, and still judges a heading inside the popover", () => {
    render(`
      <div data-ouro="popover" style="position:absolute;top:0;left:100px;width:300px;height:80px;background:#445"></div>
      <section style="position:absolute;top:82px;left:100px;width:300px"><h3 style="margin:0;font-size:16px">Under the popover</h3></section>
      <div popover="manual" style="display:block;position:absolute;top:300px;left:500px;width:300px;margin:0"><div style="height:60px;background:#3a7"></div><h3 style="margin:2px 0 0;font-size:16px">Inside</h3></div>`);
    expect(of("cramped-heading").map((issue) => issue.element)).toEqual(['h3 "Inside"']);
  });

  it("names the closest of the boxes above a heading", () => {
    render(`<section><div style="height:80px;background:#eef"><div id="inner" style="position:relative;top:4px;height:80px;background:#3a7"></div></div><h2 style="margin:8px 0 0;font-size:40px;line-height:48px">Closest wins</h2></section>`);
    expect(of("cramped-heading").map((issue) => issue.detail)).toEqual(["4px below div#inner; a 40px heading needs 10px"]);
  });

  it("judges no fill against a page drawn with a gradient, rather than failing the whole check", () => {
    document.body.style.background = "radial-gradient(#fff, #eee)";
    try {
      render(`<div style="height:60px;background:#3a7"></div><h2 style="margin:2px 0 0">Under a box on a gradient page</h2>`);
      expect(() => of("cramped-heading")).not.toThrow();
      expect(of("cramped-heading")).toEqual([]);
    } finally {
      document.body.style.background = "";
    }
  });

  it("passes headings with room, boxes below or beside them or around them, rows that aren't one line, and allowed headings", async () => {
    const url = await picture(60, 60);
    render(`
      <section><div style="height:100px;background:#3a7"></div><h2 style="margin:16px 0 0;font-size:24px">Room to breathe</h2><div style="height:100px;background:#3a7"></div></section>
      <div style="background:#3a7;padding:4px;margin-top:40px"><h2 style="margin:0">Inside its card</h2></div>
      <section><div style="height:60px;width:100px;background:#3a7"></div><h2 style="margin:0 0 0 300px;width:100px">Beside it</h2></section>
      <section><div style="height:60px;background:#fff"></div><h2 style="margin:0">Under a box the page's colour</h2></section>
      <section style="margin-top:40px"><h2 style="margin:0"><img src="${url}" alt="" style="width:60px;height:60px">A picture in it</h2></section>
      <section><div style="height:60px;background:#3a7"></div><div style="display:flex;flex-direction:column;margin-top:30px"><h2 style="margin:0">A column</h2></div></section>
      <section><div style="height:60px;background:#3a7"></div><div style="display:flex;margin-top:30px"><span style="height:200px;width:10px"></span><h2 style="margin:0">A tall row</h2></div></section>
      <section><div style="height:60px;background:#3a7"></div><h2 data-ouro-allow="cramped-heading" data-ouro-allow-why="a caption bar on purpose" style="margin:0">Allowed</h2></section>`);
    expect(of("cramped-heading")).toEqual([]);
  });

  it("measures a box by the part of it that is drawn: cut by a clipping ancestor, or nothing at all once scrolled out", () => {
    render(`
      <section><div style="overflow:hidden;height:100px"><div style="height:300px;background:#3a7"></div></div><h2 style="margin:2px 0 0;font-size:24px">Under a clipped card</h2></section>
      <section style="margin-top:40px"><div style="contain:paint;height:100px"><div style="height:300px;background:#3a7"></div></div><h2 style="margin:3px 0 0;font-size:24px">Under a contained card</h2></section>
      <section style="margin-top:40px"><div class="wrap" style="overflow:hidden;height:200px"><div class="scope" style="overflow:auto;height:600px"><div style="height:400px"></div><div style="height:100px;background:#3a7"></div></div></div><h3 style="margin:1px 0 0;font-size:20px">Under a card scrolled out</h3></section>
      <section style="margin-top:40px"><div style="display:contents;overflow:hidden"><div style="height:100px;background:#3a7"></div><h2 style="margin:4px 0 0;font-size:24px">In a box-less wrapper</h2></div></section>
      <section style="margin-top:40px"><div style="height:100px;background:#3a7"></div><div style="display:flex;align-items:flex-start;height:0;margin-top:5px"><h2 style="margin:0;font-size:24px">On a flat row</h2></div></section>`);
    expect(of("cramped-heading").map(({ element, detail }) => [element, detail])).toEqual([
      ['h2 "Under a clipped card"', "2px below div; a 24px heading needs 8px"],
      ['h2 "Under a contained card"', "3px below div; a 24px heading needs 8px"],
      ['h2 "In a box-less wrapper"', "4px below div; a 24px heading needs 8px"],
      ['h2 "On a flat row"', "5px below div; a 24px heading needs 8px"],
    ]);
    // With html's own overflow set, body's no longer goes to the viewport, so body clips like any box (here, nothing).
    document.documentElement.style.overflow = "auto";
    expect(of("cramped-heading")).toHaveLength(4);
  });

  it("lets an absolutely positioned box escape a clip below its positioned ancestor, and a fixed one escape every clip", () => {
    render(`
      <section style="position:relative"><div style="overflow:hidden;height:4px"><div style="position:absolute;top:0;left:0;width:300px"><div style="height:100px;background:#3a7"></div></div></div><h2 style="margin:100px 0 0;font-size:24px">Under an escaping card</h2></section>
      <div style="overflow:hidden;height:0"><div style="position:fixed;top:300px;left:0;width:400px"><div style="height:100px;background:#3a7"></div><h2 style="margin:2px 0 0;font-size:24px">In a fixed layer</h2></div></div>
      <div style="overflow:hidden;height:0"><div style="position:fixed;top:500px;left:0;width:300px;height:100px;background:#3a7"></div></div>`);
    expect(of("cramped-heading").map(({ element, detail }) => [element, detail])).toEqual([
      ['h2 "Under an escaping card"', "4px below div; a 24px heading needs 8px"],
      ['h2 "In a fixed layer"', "2px below div; a 24px heading needs 8px"],
    ]);
  });

  it("counts a row's own padding as room above its heading, so a heading on a padded row is judged by where its text sits", () => {
    render(`
      <section><div style="height:100px;background:#3a7"></div><div class="row" style="display:flex;padding-top:14px">
        <!-- markup between a row's children draws nothing -->
        <h2 style="margin:0;font-size:24px">Calendar</h2>
      </div></section>
      <section style="margin-top:40px"><div style="height:100px;background:#3a7"></div><div style="display:flex;padding-top:0"><h2 style="margin:0;font-size:24px">Flush</h2></div></section>
      <section style="margin-top:40px"><div style="height:100px;background:#3a7"></div><div style="display:flex;padding-top:4px"><h2 style="margin:0;font-size:24px">Four</h2></div></section>`);
    expect(of("cramped-heading").map(({ element, detail }) => [element, detail])).toEqual([
      ['h2 "Flush"', "0px below div; a 24px heading needs 8px"],
      ['h2 "Four"', "4px below div; a 24px heading needs 8px"],
    ]);
  });

  it("counts the padding of a filled row as room too, as it does for a heading in a filled box", () => {
    render(`<section><div style="height:100px;background:#3a7"></div><div style="display:flex;background:#eef;padding:14px 8px"><h2 style="margin:0;font-size:24px">Filled row</h2></div></section>`);
    expect(of("cramped-heading")).toEqual([]);
  });

  it("takes a row's top from the topmost thing it draws, so an icon pulled up over the row's padding counts", () => {
    render(`<section><div style="height:100px;background:#3a7"></div><div style="display:flex;align-items:flex-start;gap:8px;padding-top:14px"><span style="width:20px;height:20px;margin-top:-10px;background:#222"></span><h2 style="margin:0;font-size:24px">With a pulled icon</h2></div></section>`);
    expect(of("cramped-heading").map(({ element, detail }) => [element, detail])).toEqual([['h2 "With a pulled icon"', "4px below div; a 24px heading needs 8px"]]);
  });

  it("takes a row's text, drawn beside its heading, as part of what the row draws", () => {
    render(`<section><div style="height:100px;background:#3a7"></div><div class="count-row" style="display:flex;align-items:flex-start;gap:8px">Count<h2 style="margin:12px 0 0;font-size:24px">Beside the count</h2></div></section>`);
    // The text's drawn box, not the heading's 12px margin, sets the room: its glyphs sit a little below its line's top.
    const row = host.querySelector(".count-row")!;
    const drawn = document.createRange();
    drawn.selectNodeContents(row.firstChild!);
    const gap = Math.round(drawn.getBoundingClientRect().top - row.previousElementSibling!.getBoundingClientRect().bottom);
    expect(gap).toBeLessThan(12);
    expect(of("cramped-heading").map(({ element, detail }) => [element, detail])).toEqual([['h2 "Beside the count"', `${gap}px below div; a 24px heading needs 8px`]]);
  });

  it("leaves a row's hidden child out of the room the row draws", () => {
    render(`<section><div style="height:100px;background:#3a7"></div><div style="display:flex;padding-top:14px"><span style="display:none;height:20px"></span><h2 style="margin:0;font-size:24px">Hidden child</h2></div></section>`);
    expect(of("cramped-heading")).toEqual([]);
  });

  it("leaves a closed details' hidden children out of what is drawn, and draws them once it is open", () => {
    render(`<details style="border:1px solid #888;border-radius:12px;padding:3px"><summary>Checks</summary><div style="border:1px solid #888;height:40px"></div></details>`);
    expect(of("nested-frame")).toEqual([]);
    host.querySelector("details")!.open = true;
    expect(of("nested-frame")).toHaveLength(1);
  });
});

describe("findDesignIssues: nested-frame", () => {
  it("finds a frame hugging a frame, drawn by a border, an outline or a ring, once each", () => {
    render(`
      <div id="outer" style="border:1px solid #888;padding:4px"><div id="inner" class="a b c d" style="border:1px solid #888;height:40px">Twice framed</div></div>
      <div id="a" style="border:1px solid #888;padding:2px;margin-top:20px"><div id="b" style="border:1px solid #888;padding:2px"><div id="c" style="border:1px solid #888;height:40px"></div></div></div>
      <div id="ring" style="outline:2px solid #888;margin-top:20px;padding:3px"><div id="hug" style="box-shadow:0 0 0 1px #888;height:40px"></div></div>`);
    const issues = of("nested-frame");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ["div#inner.a.b.c in div#outer", "a frame drawn 5px inside another: a double border"],
      ["div#b in div#a", "a frame drawn 3px inside another: a double border"],
      ["div#c in div#a", "a frame drawn 6px inside another: a double border"],
      ["div#hug in div#ring", "a frame drawn 3px inside another: a double border"],
    ]);
  });

  it("finds a lighter framed card inside a clipping frame even when it is inset well beyond the hug gap", () => {
    render(`
      <div id="shell" style="box-sizing:border-box;width:360px;height:220px;overflow:hidden;border:1px solid #888;background:#d8dce0;padding:24px">
        <div id="card" style="box-sizing:border-box;width:220px;height:110px;border:1px solid #999;background:#fff">A collection of notes</div>
      </div>`);
    expect(of("nested-frame")).toEqual([
      expect.objectContaining({
        element: "div#card in div#shell",
        detail: expect.stringMatching(/border|frame/i),
      }),
    ]);
  });

  it("finds lighter framed surfaces at different insets and leaves unfilled, darker, hidden and allowed ones alone", () => {
    render(`
      <div id="shell" style="position:relative;box-sizing:border-box;width:360px;height:340px;overflow:hidden;border:1px solid #888;background:#c8cdd1;padding:20px">
        <div id="near" style="width:160px;height:50px;border:1px solid #888;background:#fff">First</div>
        <div id="far" style="width:160px;height:50px;margin:60px 0 0 80px;border:1px solid #888;background:#fff">Second</div>
        <div style="width:160px;height:40px;border:1px solid #888">Unfilled</div>
        <div style="width:160px;height:40px;border:1px solid #888;background:#9ba0a4">Darker</div>
        <div data-ouro-allow="nested-frame" data-ouro-allow-why="a deliberate framed example" style="width:160px;height:40px;border:1px solid #888;background:#fff">Allowed</div>
        <div style="position:absolute;top:500px;width:160px;height:40px;border:1px solid #888;background:#fff">Clipped away</div>
      </div>`);
    expect(of("nested-frame").map((issue) => issue.element)).toEqual([
      "div#near in div#shell",
      "div#far in div#shell",
    ]);
  });

  it("does not mistake a framed surface positioned outside its ancestor for a frame inside it", () => {
    render(`
      <div style="position:relative;width:200px;height:120px;border:1px solid #888;background:#ddd">
        <div style="position:absolute;top:150px;width:120px;height:60px;border:1px solid #888;background:#fff">Outside</div>
      </div>`);
    expect(of("nested-frame")).toEqual([]);
  });

  it("passes a lighter surface whose border is the same colour as that surface", () => {
    render(`
      <div style="width:300px;height:180px;padding:20px;border:1px solid #888;background:#ddd">
        <div style="width:180px;height:80px;border:1px solid #fff;background:#fff">A collection</div>
      </div>`);
    expect(of("nested-frame")).toEqual([]);
  });

  it("passes a framed editor but still finds a framed card that contains a field", () => {
    render(`
      <div style="width:360px;padding:20px;border:1px solid #888;background:#ddd">
        <div id="editor" style="width:300px;height:110px;border:1px solid #888;background:#fff">
          <textarea aria-label="Message" style="width:90%;height:65px"></textarea><button>Send</button>
        </div>
        <div id="card" style="width:300px;height:110px;margin-top:20px;border:1px solid #888;background:#fff">
          <h2>Preferences</h2><input aria-label="Name">
        </div>
      </div>`);
    expect(of("nested-frame").map((issue) => issue.element)).toEqual(["div#card in div"]);
  });

  it("distinguishes composite colour and chip fields from a framed card", () => {
    render(`
      <div style="width:360px;padding:20px;border:1px solid #888;background:#ddd">
        <div id="colour" style="display:flex;align-items:center;width:300px;height:48px;border:1px solid #888;background:#fff">
          <input type="color" aria-label="Pick a colour" style="width:32px;height:32px">
          <input aria-label="Colour" style="width:240px;height:32px">
        </div>
        <div id="chips" style="display:flex;flex-wrap:wrap;width:300px;height:90px;border:1px solid #888;background:#fff">
          <span style="display:flex;width:100px;height:32px">One<button>Remove one</button></span>
          <span style="display:flex;width:100px;height:32px">Two<button>Remove two</button></span>
          <span style="display:flex;width:100px;height:32px">Three<button>Remove three</button></span>
          <input role="combobox" aria-label="Add a tag" style="width:64px;height:32px">
        </div>
        <div id="read-only-chips" style="display:flex;flex-wrap:wrap;width:300px;height:80px;border:1px solid #888;background:#fff">
          <div style="display:contents">
            <span style="display:inline-flex;width:120px;height:32px;border-radius:4px;background:#eee">One</span>
            <span style="display:inline-flex;width:120px;height:32px;border-radius:4px;background:#eee">Two</span>
            <input role="combobox" aria-label="Selected tags" readonly style="width:64px;height:32px">
          </div>
          <span><svg width="12" height="12"></svg></span>
        </div>
        <div id="choice" role="combobox" aria-label="Oven" style="width:300px;height:44px;border:1px solid #888;background:#fff">Fan</div>
        <div id="card" style="width:300px;height:140px;border:1px solid #888;background:#fff">
          <label>Name <input></label>
        </div>
        <div id="card-flex" style="display:flex;flex-wrap:wrap;width:300px;height:100px;border:1px solid #888;background:#fff">
          <p style="width:200px;height:40px;margin:0">Choose a collection</p>
          <input role="combobox" aria-label="Collection" style="width:64px;height:32px">
        </div>
      </div>`);
    expect(of("nested-frame").map((issue) => issue.element)).toEqual(["div#card in div", "div#card-flex in div"]);
  });

  it("finds a filled box in a rounded corner whose radius isn't the corner's less the inset", () => {
    render(`
      <div id="card" style="background:#eef;border-radius:24px;padding:4px"><div id="flat" style="background:#3a7;height:60px;border-radius:4px"></div></div>
      <div style="border:2px solid #888;border-radius:9999px;padding:2px;height:40px"><div id="square" style="height:40px;background:#3a7;margin-left:10px"></div></div>`);
    expect(of("nested-frame").map(({ element, detail }) => [element, detail])).toEqual([
      ["div#flat in div#card", "corner radius 4px, 4px inside a 24px corner: the corners nest at 20px"],
      ["div#square in div", "corner radius 0px, 4px inside a 20px corner: the corners nest at 16px"],
    ]);
  });

  it("judges a picture's corner only where the picture runs to it: a video, a canvas, a background photo, or an opaque or JPEG corner", async () => {
    const [opaque, clear] = [await picture(200, 60), await picture(200, 60, null)];
    // The same file from another loopback name the test server answers on: another site, whose pixels the page can't read.
    const away = async (path: string) => {
      for (const name of ["127.0.0.1", "[::1]", "localhost"]) {
        const there = new URL(path, location.href);
        if (there.hostname === name) continue;
        there.hostname = name;
        const probe = new Image();
        probe.src = there.href;
        if (await probe.decode().then(() => true, () => false)) return there.href;
      }
      throw new Error("The test server answers on no other loopback name");
    };
    const [JPEG, PNG] = [await away("/site/public/apple/media/hx-haptics-poster.jpg"), await away("/scripts/check/fixtures/picture-160.png")];
    const corner = (inner: string) => `<div style="background:#eef;border-radius:24px;padding:4px;margin-top:8px">${inner}</div>`;
    const sized = "display:block;width:200px;height:60px";
    render(
      [
        `<video id="clip" style="${sized}"></video>`,
        `<canvas id="board" style="${sized}"></canvas>`,
        `<div id="photo" style="${sized};background:url(${opaque})"></div>`,
        `<img id="opaque" src="${opaque}" alt="" style="${sized}">`,
        `<picture id="framed"><img src="${opaque}" alt="" style="${sized}"></picture>`,
        `<img id="poster" src="${JPEG}" alt="" style="${sized}">`,
        `<svg width="200" height="60"><circle cx="30" cy="30" r="20"/></svg>`,
        `<img src="${clear}" alt="A clear logo" style="${sized}">`,
        `<img src="${opaque}" alt="Contained" style="${sized};object-fit:contain">`,
        `<img src="data:image/png;base64,broken" alt="Broken" style="${sized}">`,
        `<img src="${PNG}" alt="Unreadable" style="${sized}">`,
        `<div style="${sized};background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>')"></div>`,
        `<div style="${sized};background:url(${opaque})">Words on a photo</div>`,
      ]
        .map(corner)
        .join(""),
    );
    await Promise.all([...host.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
    expect(of("nested-frame").map((issue) => issue.element.split(" in ")[0])).toEqual(["video#clip", "canvas#board", "div#photo", "img#opaque", "picture#framed", "img#poster"]);
  });

  it("passes frames apart, small frames, half frames, faint frames, nested corners, clipped, unfilled and allowed boxes", () => {
    render(`
      <div style="border:1px solid #888;padding:20px"><div style="border:1px solid #888;height:40px">Well inside</div></div>
      <div style="border:1px solid #888;padding:2px"><div style="border:1px solid #888;width:40px;height:20px"></div></div>
      <div style="border-bottom:1px solid #888;padding:2px"><div style="border:1px solid #888;height:40px"></div></div>
      <div style="border:0 solid #888;padding:2px"><div style="border:1px solid transparent;height:40px"></div></div>
      <div style="outline:0 solid #888;padding:2px"><div style="outline:1px solid transparent;height:40px"></div></div>
      <div style="box-shadow:0 4px 8px #0003;padding:2px"><div style="box-shadow:0 0 0 0 #888;height:40px"></div></div>
      <div data-ouro-allow="nested-frame" data-ouro-allow-why="a focus ring around a field" style="border:1px solid #888;padding:2px"><div style="border:1px solid #888;height:40px"></div></div>
      <div style="background:#eef;border-radius:24px;padding:4px"><div style="background:#3a7;height:60px;border-radius:20px"></div></div>
      <div style="background:#eef;border-radius:24px;padding:16px"><div style="background:#3a7;height:60px"></div></div>
      <div style="background:#eef;border-radius:24px;padding:4px;overflow:hidden"><div style="background:#3a7;height:60px"></div></div>
      <div style="border-radius:24px;padding:4px"><div style="background:#3a7;height:60px"></div></div>
      <div style="background:#eef;border-radius:4px;padding:1px"><div style="background:#3a7;height:60px"></div></div>
      <div style="background:#eef;border-radius:24px;padding:4px"><div style="height:60px">Unfilled</div><div style="display:none;background:#3a7"></div></div>
      <div data-ouro-allow="nested-frame" data-ouro-allow-why="a chip in a card" style="background:#eef;border-radius:24px;padding:4px"><div style="background:#3a7;height:60px"></div></div>
      <div style="border:1px solid #888;border-radius:12px;padding:2px;margin-top:20px"><div id="once" style="border:1px solid #888;height:40px"></div></div>`);
    expect(of("nested-frame").map((issue) => issue.element)).toEqual(["div#once in div"]);
  });
});

describe("findDesignIssues: cut-off-edge", () => {
  it("finds a scroll list whose rows disappear into the same surface before the window edge", () => {
    render(`
      <div style="width:360px;height:320px;background:#e6e8eb">
        <div id="list" style="width:340px;height:250px;overflow:auto;background:#e6e8eb">
          <div style="height:80px">One note</div><div style="height:80px">Two notes</div>
          <div style="height:80px">Three notes</div><div style="height:80px">Four notes</div>
        </div>
      </div>`);
    expect(of("cut-off-edge")).toEqual([
      expect.objectContaining({
        element: expect.stringContaining("div#list"),
        detail: expect.stringMatching(/surface.*(step|token)|(step|token).*surface/i),
      }),
    ]);
  });

  it("names the clipped sides after scrolling without changing the scroll position", () => {
    render(`
      <div style="width:360px;height:320px;padding-top:20px;background:#eee">
        <div id="scroller" style="width:340px;height:190px;overflow:auto;background:#eee">
          <div style="height:80px">One note</div><div style="height:80px">Two notes</div>
          <div style="height:80px">Three notes</div><div style="height:80px">Four notes</div>
        </div>
      </div>`);
    const scroller = host.querySelector<HTMLElement>("#scroller")!;
    scroller.scrollTop = 30;
    const before = scroller.scrollTop;
    const issues = of("cut-off-edge");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detail).toMatch(/top/i);
    expect(issues[0]!.detail).toMatch(/bottom/i);
    expect(scroller.scrollTop).toBe(before);
  });

  it("finds a horizontal list cut off before the window edge", () => {
    render(`
      <div style="width:360px;height:180px;background:#eee">
        <div id="strip" style="display:flex;width:240px;height:100px;overflow:auto;background:#eee">
          <button style="flex:none;width:100px">First</button><button style="flex:none;width:100px">Second</button><button style="flex:none;width:100px">Third</button>
        </div>
      </div>`);
    const issues = of("cut-off-edge");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.element).toContain("div#strip");
    expect(issues[0]!.detail).toMatch(/right/i);
  });

  it("finds direct text clipped in a scroll container without child elements", () => {
    render(`
      <div style="width:340px;height:120px;background:#eee">
        <div id="text" style="width:320px;height:45px;overflow:auto;white-space:pre-line;line-height:20px;background:#eee">First&#10;Second&#10;Third</div>
      </div>`);
    expect(of("cut-off-edge")).toEqual([
      expect.objectContaining({ element: "div#text", detail: expect.stringMatching(/bottom/) }),
    ]);
  });

  it("passes a gradient fade drawn over the clipped edge", () => {
    render(`
      <div style="position:relative;width:340px;height:120px;background:#eee">
        <div style="width:320px;height:80px;overflow:auto;background:#eee">
          <div style="height:60px">First</div><div style="height:60px">Second</div>
        </div>
        <div aria-hidden="true" style="position:absolute;top:60px;left:0;width:320px;height:20px;pointer-events:none;background:linear-gradient(transparent,#eee)"></div>
      </div>`);
    expect(of("cut-off-edge")).toEqual([]);
  });

  it("finds a cut-off edge under an opaque gradient or an opaque mask", () => {
    render(`
      <div style="position:relative;width:340px;height:120px;background:#eee">
        <div id="overlay-list" style="width:320px;height:80px;overflow:auto;background:#eee">
          <div style="height:60px">First</div><div style="height:60px">Second</div>
        </div>
        <div style="position:absolute;top:60px;left:0;width:320px;height:20px;pointer-events:none;background:linear-gradient(#eee,#eee)"></div>
      </div>
      <div style="width:340px;height:120px;background:#eee">
        <div id="masked-list" style="width:320px;height:80px;overflow:auto;background:#eee;mask-image:linear-gradient(#000,#000)">
          <div style="height:60px">First</div><div style="height:60px">Second</div>
        </div>
      </div>`);
    expect(of("cut-off-edge").map((issue) => issue.element)).toEqual(["div#overlay-list", "div#masked-list"]);
  });

  it("passes an outline or an enclosing border at the clipped edge", () => {
    render(`
      <div style="width:340px;height:120px;background:#eee">
        <div style="width:320px;height:80px;overflow:auto;outline:1px solid #888;background:#eee">
          <div style="height:60px">First</div><div style="height:60px">Second</div>
        </div>
      </div>
      <div style="width:340px;height:120px;background:#eee">
        <div style="box-sizing:content-box;width:320px;height:80px;border:1px solid #888">
          <div style="width:320px;height:80px;overflow:auto;background:#eee">
            <div style="height:60px">First</div><div style="height:60px">Second</div>
          </div>
        </div>
      </div>`);
    expect(of("cut-off-edge")).toEqual([]);
  });

  it("passes a surface step, a visible edge, a fade, content that fits, a viewport edge and an opted-out scroller", () => {
    const rows = `<div style="height:80px">One</div><div style="height:80px">Two</div><div style="height:80px">Three</div>`;
    render(`
      <div style="width:360px;height:100px;background:#fff"><div style="width:340px;height:80px;overflow:auto;background:#e6e8eb">${rows}</div></div>
      <div style="width:360px;height:100px;background:#eee"><div style="box-sizing:border-box;width:340px;height:80px;overflow:auto;background:#eee;border-bottom:1px solid #888">${rows}</div></div>
      <div style="width:360px;height:100px;background:#eee"><div style="width:340px;height:80px;overflow:auto;background:#eee;mask-image:linear-gradient(to bottom,#000 70%,transparent)">${rows}</div></div>
      <div style="width:360px;height:100px;background:#eee"><div style="width:340px;height:80px;overflow:auto;background:#eee">Fits</div></div>
      <div style="width:360px;height:100px;background:#eee"><div data-ouro-allow="cut-off-edge" data-ouro-allow-why="a deliberate example" style="width:340px;height:80px;overflow:auto;background:#eee">${rows}</div></div>
      <div style="position:fixed;bottom:0;left:0;width:300px;height:80px;overflow:auto;background:#fff">${rows}</div>`);
    expect(of("cut-off-edge")).toEqual([]);
  });
});

describe("findDesignIssues: pane-edge", () => {
  it("finds adjoining large panes split by a line or by no surface step", () => {
    render(`
      <div style="display:flex;width:360px;height:200px;background:#eee">
        <aside id="same-side" style="width:170px;background:#eee">Folders</aside>
        <main id="same-main" style="width:190px;background:#eee">Notes</main>
      </div>
      <div style="display:flex;width:360px;height:200px;margin-top:24px">
        <aside id="lined-side" style="box-sizing:border-box;width:170px;border-right:1px solid #aaa;background:#e5e5e5">Collections</aside>
        <main id="lined-main" style="width:190px;background:#fff">Details</main>
      </div>`);
    expect(of("pane-edge")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        element: expect.stringMatching(/same-side.*same-main/),
        detail: expect.stringMatching(/surface.*(step|token)|(step|token).*surface/i),
      }),
      expect.objectContaining({
        element: expect.stringMatching(/lined-side.*lined-main/),
        detail: expect.stringMatching(/border|line/i),
      }),
    ]));
    expect(of("pane-edge")).toHaveLength(2);
  });

  it("finds a horizontal pane boundary and a hairline between differently coloured panes", () => {
    render(`
      <div style="display:flex;flex-direction:column;width:340px;height:340px">
        <section id="upper" style="height:170px;background:#eee">Overview</section>
        <section id="lower" style="height:170px;background:#eee">Details</section>
      </div>
      <div style="display:flex;width:360px;height:200px;margin-top:24px">
        <aside id="left" style="width:170px;background:#e5e5e5">Collections</aside>
        <div style="width:1px;background:#888"></div>
        <main id="right" style="width:189px;background:#fff">Details</main>
      </div>`);
    expect(of("pane-edge").map((issue) => issue.element)).toEqual([
      expect.stringMatching(/upper.*lower/),
      expect.stringMatching(/left.*right/),
    ]);
  });

  it("finds painted panes in ordinary block layout, with and without a dividing line", () => {
    render(`
      <div style="width:340px">
        <div id="upper" style="height:120px;background:#eee">Overview</div>
        <div id="lower" style="height:120px;background:#eee">Details</div>
      </div>
      <div style="width:340px;margin-top:20px">
        <div id="lined" style="box-sizing:border-box;height:120px;border-bottom:1px solid #888;background:#eee">History</div>
        <div id="next" style="height:120px;background:#fff">Activity</div>
      </div>`);
    expect(of("pane-edge").map((issue) => issue.element)).toEqual([
      "div#upper and div#lower",
      "div#lined and div#next",
    ]);
  });

  it("finds a narrow notch in a pane boundary without mistaking a full-width row for one", () => {
    render(`
      <div style="display:flex;width:360px;height:180px">
        <div id="light-side" style="position:relative;width:170px;background:#ddd">
          <div style="position:absolute;right:0;top:60px;width:12px;height:24px;background:#fff"></div>
        </div><div id="light-main" style="width:190px;background:#fff"></div>
      </div>
      <div style="display:flex;width:360px;height:180px;margin-top:12px">
        <div id="dark-side" style="position:relative;width:170px;background:#333">
          <div style="position:absolute;right:0;top:60px;width:12px;height:24px;background:#111"></div>
        </div><div id="dark-main" style="width:190px;background:#111"></div>
      </div>
      <div style="display:flex;width:360px;height:180px;margin-top:12px">
        <div style="position:relative;width:170px;background:#ddd">
          <div style="position:absolute;left:0;right:0;top:60px;height:24px;background:#fff"></div>
        </div><div style="width:190px;background:#fff"></div>
      </div>`);
    expect(of("pane-edge")).toEqual([
      expect.objectContaining({ element: "div#light-side and div#light-main", detail: expect.stringMatching(/surface.*(step|token)/i) }),
      expect.objectContaining({ element: "div#dark-side and div#dark-main", detail: expect.stringMatching(/surface.*(step|token)/i) }),
    ]);
  });

  it("compares the surfaces actually painted through translucent panes", () => {
    render(`
      <div style="display:flex;width:360px;height:200px;background:#fff">
        <aside id="translucent" style="width:170px;background:#000;opacity:.5">Folders</aside>
        <main id="mixed" style="width:190px;background:#808080">Notes</main>
      </div>`);
    expect(of("pane-edge")).toEqual([
      expect.objectContaining({ element: expect.stringMatching(/translucent.*mixed/) }),
    ]);
  });

  it("reads panes painted by wrappers' children, including a line drawn by a child", () => {
    render(`
      <div style="display:flex;width:360px;height:180px">
        <div style="width:170px;height:180px"><aside style="height:100%;background:#eee">Folders</aside></div>
        <div style="width:190px;height:180px"><main style="height:100%;background:#fff">Notes</main></div>
      </div>
      <div style="display:flex;width:360px;height:180px;margin-top:20px">
        <div id="left-wrap" style="width:170px;height:180px"><aside style="box-sizing:border-box;height:100%;background:#eee;border-right:1px solid #888">Folders</aside></div>
        <div id="right-wrap" style="width:190px;height:180px"><main style="height:100%;background:#fff">Notes</main></div>
      </div>`);
    expect(of("pane-edge")).toEqual([
      expect.objectContaining({ element: expect.stringMatching(/left-wrap.*right-wrap/), detail: expect.stringMatching(/line|border/i) }),
    ]);
  });

  it("finds an outline or ring drawn between otherwise distinct panes", () => {
    render(`
      <div style="display:flex;width:360px;height:180px">
        <aside id="outline" style="position:relative;z-index:1;width:170px;background:#eee;outline:1px solid #888">Folders</aside>
        <main style="width:190px;background:#fff">Notes</main>
      </div>
      <div style="display:flex;width:360px;height:180px;margin-top:20px">
        <aside id="ring" style="position:relative;z-index:1;width:170px;background:#eee;box-shadow:0 0 0 1px #888">Folders</aside>
        <main style="width:190px;background:#fff">Notes</main>
      </div>`);
    expect(of("pane-edge").map((issue) => issue.element)).toEqual([
      "aside#outline and main",
      "aside#ring and main",
    ]);
  });

  it("passes a surface step with no line, a gap, small regions and a pane opted out with a reason", () => {
    render(`
      <div style="display:flex;width:360px;height:180px">
        <aside style="width:170px;background:#f5f5f7">Folders</aside><main style="width:190px;background:#fff">Notes</main>
      </div>
      <div style="display:flex;gap:8px;width:360px;height:180px;margin-top:12px">
        <aside style="width:170px;background:#eee">Folders</aside><main style="width:180px;background:#eee">Notes</main>
      </div>
      <div style="display:flex;width:300px;height:80px;margin-top:12px">
        <div style="width:150px;background:#eee">One</div><div style="width:150px;background:#eee">Two</div>
      </div>
      <div style="display:flex;width:360px;height:180px;margin-top:12px">
        <aside data-ouro-allow="pane-edge" data-ouro-allow-why="a deliberate example" style="width:170px;background:#eee">Folders</aside>
        <main style="width:190px;background:#eee">Notes</main>
      </div>`);
    expect(of("pane-edge")).toEqual([]);
  });
});

describe("findDesignIssues: type-scale and shadow-scale", () => {
  it("finds more text sizes or weights than a type scale holds, marking the rarest", () => {
    render(`<p style="font-size:12px">Small</p><p id="body" style="font-size:16px">Body</p><p style="font-size:16px">Body again</p><p id="bold" style="font-size:20px;font-weight:700">Bold</p>`);
    const issues = of("type-scale", { maxSizes: 2, maxWeights: 1 });
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ["the page's text sizes", "3 sizes (12, 16, 20 px); a type scale holds 2 or fewer"],
      ["the page's font weights", "2 weights (400, 700); keep to 1"],
    ]);
    expect(host.querySelector("p")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    expect(document.getElementById("bold")!.getAttribute("data-ouro-check-ref")).toBe(issues[1]!.ref);
    expect(of("type-scale")).toEqual([]);
    document.body.setAttribute("data-ouro-allow", "type-scale");
    document.body.setAttribute("data-ouro-allow-why", "a specimen of every size");
    expect(of("type-scale", { maxSizes: 2, maxWeights: 1 })).toEqual([]);
  });

  it("leaves out text an element opts out of with a reason, nested text included, and holds the page's own text to the scale", () => {
    render(`<div data-ouro-allow="type-scale" data-ouro-allow-why="comic lettering is art"><h2 style="font-size:41px;font-weight:700">BANG</h2><p style="font-size:23px;font-weight:700">Hmm <span style="font-size:19px">nested</span></p></div><p style="font-size:12px">Chrome</p><p style="font-size:16px;font-weight:600">Body</p><p style="font-size:14px;font-weight:500">Caption</p>`);
    expect(of("type-scale")).toEqual([]);
    const [sizes, weights] = of("type-scale", { maxSizes: 2, maxWeights: 2 });
    expect(sizes!.detail).toBe("3 sizes (12, 14, 16 px); a type scale holds 2 or fewer");
    expect(weights!.detail).toBe("3 weights (400, 500, 600); keep to 2");
  });

  it("still finds the page's own text over the scale beside an opted-out lettering block", () => {
    const chrome = Array.from({ length: 11 }, (_, i) => `<p style="font-size:${10 + i}px;font-weight:${[300, 400, 500, 600][i % 4]}">Size ${10 + i}</p>`).join("");
    render(`<div data-ouro-allow="type-scale" data-ouro-allow-why="comic lettering is art"><h2 style="font-size:41px;font-weight:700">BANG</h2></div>${chrome}`);
    expect(of("type-scale").map(({ detail }) => detail)).toEqual([
      "11 sizes (10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20 px); a type scale holds 10 or fewer",
      "4 weights (300, 400, 500, 600); keep to 3",
    ]);
  });

  it("counts text whose opt-out has a blank reason, since a reason of spaces is none", () => {
    render(`<div data-ouro-allow="type-scale" data-ouro-allow-why="   "><h2 style="font-size:41px;font-weight:700">BANG</h2></div><p style="font-size:12px">Chrome</p><p style="font-size:16px">Body</p>`);
    expect(of("type-scale", { maxSizes: 2, maxWeights: 1 }).map(({ detail }) => detail)).toEqual(["3 sizes (12, 16, 41 px); a type scale holds 2 or fewer"]);
  });

  it("counts weights within a role: a heading's weight leaves the running text its regular, medium and bold", () => {
    render(`<p style="font-weight:500">Recipes</p><h1 style="font-weight:600">Dinner</h1><p>Plan the week, <b>shop once</b>.</p><button type="button" style="font-weight:500">Start</button>`);
    expect(of("type-scale")).toEqual([]);
    host.remove();
    render(`<p style="font-weight:300">Light</p><p>Regular</p><p style="font-weight:500">Medium</p><p id="rarest"><b>Bold</b> once</p><p><b>Bold</b> twice</p><p style="font-weight:300">Light again</p><p style="font-weight:500">Medium again</p><p>Regular again</p><h2 style="font-weight:600">Heading</h2>`);
    expect(of("type-scale").map(({ element, detail }) => [element, detail])).toEqual([["the page's font weights", "4 weights (300, 400, 500, 700); keep to 3"]]);
    host.remove();
    render(`<h1 style="font-weight:300">One</h1><h2 style="font-weight:400">Two</h2><h3 id="rare" style="font-weight:500">Three</h3><h4 style="font-weight:700">Four</h4><h4 style="font-weight:700">Four again</h4><h2 style="font-weight:400">Two again</h2><h1 style="font-weight:300">One again</h1><div role="heading" aria-level="5" style="font-weight:700">Five</div><p>Body</p>`);
    const [headings] = of("type-scale");
    expect([headings!.element, headings!.detail]).toEqual(["the page's heading weights", "4 weights (300, 400, 500, 700); keep to 3"]);
    expect(document.getElementById("rare")!.getAttribute("data-ouro-check-ref")).toBe(headings!.ref);
  });

  it("holds the page to ten sizes and three weights unless told another", () => {
    render([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((size, i) => `<p style="font-size:${size}px;font-weight:${[300, 400, 500, 700][i % 4]}">Size ${size}</p>`).join(""));
    expect(rules(findDesignIssues())).toEqual(["type-scale", "type-scale"]);
  });

  it("finds more distinct shadows than an elevation scale holds, leaving rings out", () => {
    render([1, 2, 3, 4, 5, 6].map((y) => `<div id="s${y}" style="height:10px;box-shadow:0 ${y}px ${y * 2}px #0003"></div><div style="height:10px;box-shadow:0 ${y}px ${y * 2}px #0003"></div>`).join("") + `<div style="height:10px;box-shadow:0 0 0 1px #888"></div>`);
    const [issue] = of("shadow-scale");
    expect(issue).toMatchObject({ element: "the page's shadows", detail: "6 different shadows; an elevation scale holds 5 or fewer" });
    expect(document.getElementById("s1")!.getAttribute("data-ouro-check-ref")).toBe(issue!.ref);
    expect(of("shadow-scale", { maxShadows: 6 })).toEqual([]);
    document.body.setAttribute("data-ouro-allow", "all");
    document.body.setAttribute("data-ouro-allow-why", "a gallery of elevations");
    expect(of("shadow-scale")).toEqual([]);
  });
});

describe("findDesignIssues: giant-text", () => {
  const words = "The running text a person reads, long enough to have a reading size, and drawn at one size down the column.";

  it("finds running text drawn over 24px, by the size that carries most of its characters, and leaves headings and an opted-out poster line out", () => {
    render(`<h1 style="font-size:64px">Selected work</h1><p id="body" style="font-size:27px">${words}</p><p style="font-size:27px">${words}</p><p style="font-size:14px">A caption.</p>`);
    const [found] = of("giant-text");
    expect([found!.element, found!.detail]).toEqual(["the page's running text", "most of it is drawn at 27px (214 characters); keep reading text to 24px or under at every screen size"]);
    expect(document.getElementById("body")!.getAttribute("data-ouro-check-ref")).toBe(found!.ref);
    host.remove();
    render(`<h1 style="font-size:64px">${words}</h1><p style="font-size:18px">${words}</p><p style="font-size:18px">${words}</p><p style="font-size:40px" data-ouro-allow="giant-text" data-ouro-allow-why="a poster line">${words} ${words} ${words}</p>`);
    expect(of("giant-text")).toEqual([]);
  });

  it("judges no reading size on a page with little running text, and takes another cap when told", () => {
    render(`<p style="font-size:30px">Sign in to go on.</p>`);
    expect(of("giant-text")).toEqual([]);
    host.remove();
    render(`<p style="font-size:20px">${words}</p><p style="font-size:20px">${words}</p>`);
    expect(of("giant-text", { readingPx: 18 }).map(({ detail }) => detail)).toEqual(["most of it is drawn at 20px (214 characters); keep reading text to 18px or under at every screen size"]);
  });
});

describe("findDesignIssues: grey-on-colour", () => {
  it("finds grey text on a saturated fill, through a fill too faint to count", () => {
    render(`<div style="background:#2563eb"><p id="grey" style="color:#888">Grey on blue</p><div style="background:#fff3"><span style="color:#777">Grey through a veil</span></div></div>`);
    expect(of("grey-on-colour").map(({ element, detail }) => [element, detail])).toEqual([
      ['p#grey "Grey on blue"', "grey text (rgb 136 136 136) on a coloured background (rgb 37 99 235): use a shade of the background's hue"],
      ['span "Grey through a veil"', "grey text (rgb 119 119 119) on a coloured background (rgb 37 99 235): use a shade of the background's hue"],
    ]);
  });

  it("passes white or tinted text on colour, grey on grey, text over a picture or gradient, and allowed text", () => {
    render(`
      <div style="background:#2563eb"><p style="color:#fff">White on blue</p><p style="color:#bfdbfe">Tinted on blue</p><p style="color:#222">Near black on blue</p>
        <p data-ouro-allow="grey-on-colour" data-ouro-allow-why="a disabled label" style="color:#888">Allowed</p></div>
      <div style="background:#eee"><p style="color:#888">Grey on grey</p></div>
      <div style="background:#0a1a40"><p style="color:#888">Grey on navy</p></div>
      <div style="background:linear-gradient(#2563eb,#1d4ed8)"><p style="color:#888">Grey on a gradient</p></div>`);
    expect(of("grey-on-colour")).toEqual([]);
  });

  it("takes the page's colour from its scheme when nothing fills the page", async () => {
    document.body.style.background = "transparent";
    render(`<div style="height:60px;background:#121212"></div><h2 style="margin:2px 0 0">Under a dark box</h2>`);
    expect(of("cramped-heading")).toHaveLength(1);
    await commands.emulateMedia({ colorScheme: "dark" });
    try {
      document.documentElement.style.colorScheme = "dark";
      expect(of("cramped-heading")).toEqual([]);
      document.documentElement.style.colorScheme = "light";
      expect(of("cramped-heading")).toHaveLength(1);
    } finally {
      await commands.emulateMedia({ colorScheme: "light" });
    }
  });
});

describe("findDesignIssues: heading-hierarchy", () => {
  it("finds a heading drawn larger than the heading of a higher rank it sits under", () => {
    render(`
      <h1 style="font-size:32px">Page</h1>
      <h2 id="section" style="font-size:20px">Section</h2><h3 style="font-size:28px">Bigger than its section</h3>
      <div role="heading" aria-level="4" style="font-size:24px">Fine under the h3</div>
      <div role="heading" style="font-size:36px">A level 2 bigger than the page</div>
      <h3 data-ouro-allow="heading-hierarchy" data-ouro-allow-why="a display number" style="font-size:40px">Allowed</h3>`);
    expect(of("heading-hierarchy").map(({ element, detail }) => [element, detail])).toEqual([
      ['h3 "Bigger than its section"', '28px, larger than the h2#section "Section" it sits under at 20px'],
      ['div "A level 2 bigger than the page"', '36px, larger than the h1 "Page" it sits under at 32px'],
    ]);
  });

  it("measures each heading at the largest size its shown text is drawn at, a title's span included", () => {
    render(`
      <h1 style="font-size:20px"><span style="font-size:12px">Captain and Stoker</span> <span style="font-size:80px">The Long Way</span></h1>
      <h2 style="font-size:48px">Under a large title</h2>
      <h3 style="font-size:16px"><span style="font-size:60px">A span outgrows its section</span><span style="display:none;font-size:90px">Hidden</span></h3>
      <h3 style="font-size:16px">Plain<span style="font-size:90px;display:none">Hidden</span></h3>`);
    expect(of("heading-hierarchy").map(({ element, detail }) => [element, detail])).toEqual([['h3 "A span outgrows its sectionHidden"', '60px, larger than the h2 "Under a large title" it sits under at 48px']]);
  });
});

describe("findDesignIssues: squircle-missing", () => {
  it("finds a drawn surface rounded by a plain radius where the engine lacks corner-shape, and nothing where it has it", () => {
    render(`
      <div id="card" style="background:#e8eefc;border-radius:16px;width:200px;height:100px">Card</div>
      <div id="percent" style="background:#e8eefc;border-radius:10%;width:200px;height:100px">Percent</div>
      <div style="border:1px solid #888;border-radius:12px;width:200px;height:100px">Frame</div>
      <div style="background:#e8eefc;border-radius:2px;width:200px;height:100px">Tight corner</div>
      <div style="background:#e8eefc;border-radius:999px;width:200px;height:40px">Capsule</div>
      <div style="background:#e8eefc;border-radius:50%;width:60px;height:60px">Disc</div>
      <div style="border-radius:16px;width:200px;height:100px">Unpainted</div>
      <div style="background:#e8eefc;border-radius:16px;width:200px;height:100px;clip-path:inset(0 round 16px)">Clipped</div>
      <div data-ouro-allow="squircle-missing" data-ouro-allow-why="a deliberate circle arc" style="background:#e8eefc;border-radius:16px;width:200px;height:100px">Allowed</div>`);
    expect(of("squircle-missing", { cornerShape: false }).map(({ element, detail }) => [element, detail])).toEqual([
      ['div#card "Card"', "16px plain circular radius on a 200x100 surface, in an engine without corner-shape: add squircleCorners() to your build's PostCSS plugins, or clip the surface to a squircle with clip-path"],
      ['div#percent "Percent"', "10px plain circular radius on a 200x100 surface, in an engine without corner-shape: add squircleCorners() to your build's PostCSS plugins, or clip the surface to a squircle with clip-path"],
      ['div "Frame"', "12px plain circular radius on a 200x100 surface, in an engine without corner-shape: add squircleCorners() to your build's PostCSS plugins, or clip the surface to a squircle with clip-path"],
    ]);
    expect(of("squircle-missing", { cornerShape: true })).toEqual([]);
  });
});

describe("findDesignIssues: the whole page", () => {
  it("names nothing on a quiet page, skipping script, style and svg innards, and marks an element once per finding", () => {
    render(`<h1>Quiet</h1><p>Words.</p><svg width="20" height="20"><text y="10">svg text</text></svg><style>.x{}</style><script type="text/x-none">x</script>
      <div style="background:#2563eb"><p hidden style="color:#888">Hidden</p><p style="visibility:hidden;color:#888">Invisible</p><p style="opacity:0;color:#888">Faded</p></div>`);
    expect(findDesignIssues()).toEqual([]);
    host.innerHTML = `<div style="background:#2563eb"><p data-ouro-allow="grey-on-colour" style="color:#888">An allow without a reason does not count, however long its words run</p></div>`;
    expect(findDesignIssues().map((issue) => issue.element)).toEqual(['p "An allow without a reason does not count…"']);
    host.innerHTML = `<h2 data-ouro-check-ref="s1" style="font-size:20px">Section</h2><h3 style="font-size:28px" data-ouro-check-ref="o2">Bigger</h3>`;
    const [issue] = findDesignIssues();
    expect(host.querySelector("h3")!.getAttribute("data-ouro-check-ref")).toBe(`o2 ${issue!.ref}`);
  });
});

describe("listCornerMedia", () => {
  it("lists pictures, videos and canvases, with the radius of the frame they fill (past a wrapper that draws no box) and the colour behind it", async () => {
    const url = await picture(200, 150);
    render(`
      <div style="background:#f0e8d8;padding:8px"><div style="border-radius:14px;overflow:hidden;width:200px"><div style="border-radius:20px;width:200px"><img src="${url}" alt="framed" style="display:block;width:200px;height:150px"></div></div></div>
      <canvas width="120" height="120" style="display:block"></canvas>
      <img src="${new URL("../scripts/check/fixtures/picture-160.png", import.meta.url).href}" alt="by address" style="display:block;width:160px;height:160px;border-radius:8px">
      <div style="border-radius:30px;overflow:hidden;width:300px"><img src="${url}" alt="smaller than its box" style="display:block;width:200px;height:150px"></div>
      <div style="border-radius:4px;overflow:hidden;width:200px"><img src="${url}" alt="rounder than its box" style="display:block;width:200px;height:150px;border-radius:10px"></div>
      <img src="${url}" alt="allowed without a reason" data-ouro-allow="baked-corner" style="display:block;width:100px;height:100px">
      <img src="${url}" alt="small" style="width:50px;height:50px">
      <div hidden><img src="${url}" alt="hidden" style="width:200px;height:150px"></div>
      <img src="${url}" alt="aria-hidden" aria-hidden="true" style="display:block;width:200px;height:150px">
      <img src="${url}" alt="allowed" data-ouro-allow="baked-corner" data-ouro-allow-why="a screenshot with its window" style="display:block;width:200px;height:150px">
      <div data-ouro-allow="all" data-ouro-allow-why="a gallery"><img src="${url}" alt="all" style="display:block;width:200px;height:150px"></div>
      <img src="${url}" alt="invisible" style="display:block;width:200px;height:150px;visibility:hidden">
      <img src="${url}" alt="faded" style="display:block;width:200px;height:150px;opacity:0">
      <img src="${url}" alt="avatar" style="display:block;width:120px;height:120px;border-radius:50%">
      <div style="overflow:hidden;width:200px"><img src="${url}" alt="square crop" style="display:block;width:200px;height:150px;border-radius:6px"></div>
      <div style="background:#f0e8d8;padding:8px"><div style="border-radius:14px;overflow:hidden;background:#051024;width:200px"><span style="display:block;overflow:hidden;background:#051024"><picture style="display:contents"><img src="${url}" alt="in a picture with no box" style="display:block;width:200px;height:150px"></picture></span></div></div>`);
    const found = listCornerMedia();
    expect(found.map(({ element, radius, behind }) => ({ element, radius, behind }))).toEqual([
      { element: "img", radius: 14, behind: [240, 232, 216] },
      { element: "canvas", radius: 0, behind: [255, 255, 255] },
      { element: "fixtures/picture-160.png", radius: 8, behind: [255, 255, 255] },
      { element: "img", radius: 0, behind: [255, 255, 255] },
      { element: "img", radius: 10, behind: [255, 255, 255] },
      { element: "img", radius: 0, behind: [255, 255, 255] },
      { element: "img", radius: 6, behind: [255, 255, 255] },
      { element: "img", radius: 14, behind: [240, 232, 216] },
    ]);
    const img = host.querySelector("img")!.getBoundingClientRect();
    expect(found[0]!).toMatchObject({ ref: "c1", box: { x: img.left + scrollX, y: img.top + scrollY, width: 200, height: 150 } });
    expect(host.querySelector("img")!.getAttribute("data-ouro-check-ref")).toBe("c1");
    expect(listCornerMedia(2)).toHaveLength(2);
  });

  it("lists the colours the media and its frame draw at their edges: borders and outlines, never fills or a clear border", async () => {
    const url = await picture(200, 150);
    render(`<div style="border-radius:14px;overflow:hidden;width:200px;outline:2px solid rgb(40, 50, 60);outline-offset:3px;background:rgb(1, 2, 3)"><img src="${url}" alt="framed" style="display:block;width:200px;height:150px;border:1px solid rgb(10, 20, 30);border-left-color:transparent;background:rgb(4, 5, 6)"></div>`);
    const [media] = listCornerMedia();
    expect(media!.own).toEqual([[10, 20, 30], [10, 20, 30], [10, 20, 30], [40, 50, 60]]);
  });

  it("takes a video's address before it loads, and white behind a page nothing fills", () => {
    document.body.style.background = "transparent";
    render(`<video src="${CLIP}" preload="none" style="display:block;width:200px;height:150px"></video>`);
    expect(listCornerMedia()).toMatchObject([{ element: "media/hx-press.webm", radius: 0, behind: [255, 255, 255] }]);
  });
});

describe("mediaDrawn", () => {
  it("waits for a picture to decode, or to fail, and for a canvas to draw", async () => {
    const url = await picture(200, 150);
    render(`<img data-ouro-check-ref="c1" src="${url}" alt=""><img data-ouro-check-ref="c2" src="data:image/png;base64,broken" alt=""><canvas data-ouro-check-ref="c3"></canvas>`);
    await mediaDrawn("c1");
    expect(host.querySelector("img")!.complete).toBe(true);
    await mediaDrawn("c2");
    await mediaDrawn("c3");
  });

  it("loads a video that waits for a play, and holds a playing one still on its first frame", async () => {
    render(`<video data-ouro-check-ref="c1" src="${CLIP}" preload="none" muted></video><video data-ouro-check-ref="c2" src="${CLIP}" preload="auto" muted></video>`);
    const [waiting, played] = [...host.querySelectorAll("video")] as [HTMLVideoElement, HTMLVideoElement];
    await mediaDrawn("c1");
    expect(waiting.readyState).toBeGreaterThanOrEqual(2);
    expect(waiting.currentTime).toBe(0);
    if (played.readyState < 1) await new Promise((done) => played.addEventListener("loadedmetadata", done, { once: true }));
    played.currentTime = 1;
    await new Promise((done) => played.addEventListener("seeked", done, { once: true }));
    // WebKit plays only from a person's press, so a click starts it.
    const playing = new Promise((done) => played.addEventListener("playing", done, { once: true }));
    played.addEventListener("click", () => void played.play(), { once: true });
    await userEvent.click(played);
    await playing;
    await mediaDrawn("c2");
    expect(played.paused).toBe(true);
    expect(played.currentTime).toBe(0);
  });

  it("seeks a video to its first frame again when the stopped position replaces the first seek", async () => {
    render(`<video data-ouro-check-ref="c1" src="${CLIP}" preload="auto" muted></video>`);
    const video = host.querySelector("video")!;
    if (video.readyState < 2) await new Promise((done) => video.addEventListener("loadeddata", done, { once: true }));
    // As in WebKit: the position playback stopped at arrives after the first seek has landed.
    let position = 1.008;
    let seeks = 0;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => position,
      set: (time: number) => {
        seeks++;
        position = seeks === 1 ? 1.008 : time;
        queueMicrotask(() => video.dispatchEvent(new Event("seeked")));
      },
    });
    await mediaDrawn("c1");
    expect(seeks).toBe(2);
    expect(video.currentTime).toBe(0);
  });
});

describe("shownCorners", () => {
  it("lists the corners that hit-test to the media or the frame it fills, and clips to the screen", () => {
    render(`
      <img data-ouro-check-ref="c1" alt="" style="display:block;width:200px;height:150px">
      <div style="width:200px;height:150px"><img data-ouro-check-ref="c2" alt="" style="display:block;width:200px;height:150px;pointer-events:none"></div>
      <div style="width:300px;height:150px"><img data-ouro-check-ref="c3" alt="" style="display:block;width:200px;height:150px;pointer-events:none"></div>
      <div style="height:${innerHeight}px"></div>
      <img data-ouro-check-ref="c4" alt="" style="display:block;width:200px;height:150px">`);
    expect(shownCorners("c1")).toEqual({ corners: ["top left", "top right", "bottom left", "bottom right"], clip: { x: 0, y: 0, width: 200, height: 150 } });
    expect(shownCorners("c2").corners).toEqual(["top left", "top right", "bottom left", "bottom right"]);
    expect(shownCorners("c3").corners).toEqual([]);
    // The last picture's top 75px on the screen.
    window.scrollTo(0, 525);
    expect(shownCorners("c4")).toEqual({ corners: ["top left", "top right"], clip: { x: 0, y: innerHeight - 75, width: 200, height: 75 } });
  });

  it("leaves out corners under a fixed bar", () => {
    render(`<div style="position:fixed;top:0;left:0;right:0;height:40px;background:#fff;z-index:1"></div><img data-ouro-check-ref="c1" alt="" style="display:block;width:200px;height:150px">`);
    expect(shownCorners("c1").corners).toEqual(["bottom left", "bottom right"]);
  });
});

describe("readCorners", () => {
  // A picture of a media as drawn, pixel by pixel: `colour` gives each pixel's colour.
  const shot = (colour: (x: number, y: number) => number[], width = 200, height = 150) => {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [width, height];
    const context = canvas.getContext("2d")!;
    const data = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = colour(x, y);
        data.data.set([r!, g!, b!, 255], (y * width + x) * 4);
      }
    }
    context.putImageData(data, 0, 0);
    return canvas.toDataURL();
  };
  // Whether a pixel is outside a corner's curve of radius `r`, in a `width`×`height` box; `only` limits it to some corners.
  const outside = (x: number, y: number, r: number, only = ["top left", "top right", "bottom left", "bottom right"], width = 200, height = 150) => {
    const cx = x < r ? r : x > width - 1 - r ? width - 1 - r : x;
    const cy = y < r ? r : y > height - 1 - r ? height - 1 - r : y;
    const name = `${y < height / 2 ? "top" : "bottom"} ${x < width / 2 ? "left" : "right"}`;
    return only.includes(name) && Math.hypot(x - cx, y - cy) > r;
  };
  const [WHITE, LIGHT, BLACK, RED, BLUE] = [[255, 255, 255], [244, 244, 244], [0, 0, 0], [200, 30, 30], [40, 80, 220]];
  const ALL = ["top left", "top right", "bottom left", "bottom right"];
  // A recording of a window, with its own dark corners at radius 28, inside the page's 14px frame.
  const window_ = (corners = ALL, band = (x: number, y: number) => (x < 0 && y < 0 ? RED : BLACK)) => shot((x, y) => (outside(x, y, 14) ? WHITE : outside(x, y, 28, corners) ? band(x, y) : LIGHT));
  const reading = (picture: string, corners = ALL, own: number[][] = []): CornerReading => ({ ref: "c1", element: "media/window.webm", shot: picture, radius: 14, behind: WHITE, own, corners });

  it("finds a media whose own pixels draw a corner of one colour inside its frame, on two corners or more", async () => {
    expect(await readCorners([reading(window_())])).toEqual([
      { ref: "c1", rule: "baked-corner", element: "media/window.webm", detail: "the top left, top right, bottom left, bottom right corners draw a colour neither edge beside them has: the media's own corners show inside its frame" },
    ]);
    expect(await readCorners([reading(window_(), ["top right", "bottom right"])])).toMatchObject([{ detail: expect.stringMatching(/^the top right, bottom right corners/) }]);
    // A frame curved less than 3 px shows no page at its tip: the tip is the media's own pixel, so the fill behind stands in.
    const square = shot((x, y) => (outside(x, y, 2) ? WHITE : outside(x, y, 16) ? BLACK : LIGHT));
    expect(await readCorners([{ ...reading(square), radius: 2 }])).toMatchObject([{ rule: "baked-corner" }]);
  });

  it("passes plain corners, one corner, corners the screen doesn't show, corners of different colours, and edges that disagree", async () => {
    const plain = shot((x, y) => (outside(x, y, 14) ? WHITE : LIGHT));
    const one = window_(["top left"]);
    const mixed = window_(["top left", "top right"], (x) => (x < 100 ? BLACK : RED));
    const striped = shot((x, y) => (outside(x, y, 14) ? WHITE : outside(x, y, 28) ? BLACK : y < 30 ? BLUE : LIGHT));
    expect(await readCorners([reading(plain), reading(one), reading(window_(), ["top left"]), reading(mixed), reading(striped, ["top left", "top right"])])).toEqual([]);
    expect(await readCorners([reading(striped)])).toMatchObject([{ detail: expect.stringMatching(/^the bottom left, bottom right corners/) }]);
  });

  it("passes a single odd pixel on the diagonal that the next sample leaves", async () => {
    const speck = shot((x, y) => (x === 5 && y === 5 ? RED : LIGHT));
    expect(await readCorners([reading(speck, ["top left"])])).toEqual([]);
  });

  it("passes a picture whose own glow lies near its corners", async () => {
    // The CI crop of a scene in a 30.6px squircle frame: a blue-violet glow about 30px in, which is the picture, not a bake.
    const shotUrl = new URL("./fixtures/glowing-scene-corner.png", import.meta.url).href;
    const scene: CornerReading = { ref: "c1", element: "scenes/built-for-one.avif", shot: shotUrl, radius: 30.6, behind: [5, 16, 36], own: [], corners: ["top left", "top right"] };
    expect(await readCorners([scene])).toEqual([]);
  });

  it("passes a corner that shows the page as drawn at its tip, or a colour the frame draws itself, such as its outline or border", async () => {
    // The page behind is green where the styles say white: the gap before an outline, say.
    const GREEN = [30, 160, 90];
    const gap = shot((x, y) => (outside(x, y, 14) ? GREEN : LIGHT));
    // A rounded outline that cuts across the box's corner, in the frame's own blue.
    const outlined = window_(ALL, () => BLUE);
    expect(await readCorners([reading(gap), reading(outlined, ALL, [BLUE])])).toEqual([]);
    expect(await readCorners([reading(outlined)])).toHaveLength(1);
  });
});

describe("listenForMotion", () => {
  it("counts a layout read while a change waits to be laid out, by every getter and method it patches, only once armed", async () => {
    render(`<div id="box" tabindex="-1" style="width:10px;height:10px"></div>`);
    const box = document.getElementById("box")!;
    const reads: (() => unknown)[] = [
      () => box.offsetTop, () => box.offsetLeft, () => box.offsetWidth, () => box.offsetHeight, () => box.offsetParent, () => box.innerText,
      () => box.clientTop, () => box.clientLeft, () => box.clientWidth, () => box.clientHeight, () => box.scrollTop, () => box.scrollLeft,
      () => box.scrollWidth, () => box.scrollHeight, () => box.getBoundingClientRect(), () => box.getClientRects(), () => document.elementFromPoint(1, 1),
      () => box.scrollIntoView(), () => box.focus(),
    ];
    resetMotion();
    for (const [n, read] of reads.entries()) {
      box.style.width = `${11 + n}px`;
      read();
      read();
    }
    expect(readMotion().forcedLayouts).toBe(reads.length);
    // A change the observer has already heard of, read before the next frame.
    resetMotion();
    box.style.width = "40px";
    await Promise.resolve();
    expect(box.offsetWidth).toBe(40);
    expect(readMotion().forcedLayouts).toBe(1);
    box.style.width = "50px";
    expect(box.offsetWidth).toBe(50);
    resetMotion();
    expect(readMotion().forcedLayouts).toBe(0);
  });

  it("times the frames once armed, and reads the longest gap between them", async () => {
    resetMotion();
    expect(readMotion().longestFrameMs).toBe(0);
    resetMotion();
    await frames(3);
    const { longestFrameMs } = readMotion();
    expect(longestFrameMs).toBeGreaterThan(0);
    await frames(2);
    expect(readMotion().longestFrameMs).toBe(longestFrameMs);
  });

  // Ouro check runs in Chromium; WebKit has no Layout Instability API, so it reports no shifts to add up.
  it.skipIf(!PerformanceObserver.supportedEntryTypes.includes("layout-shift"))("adds up the layout shifts once armed, and none while unarmed", async () => {
    render(`<div id="top"></div><p style="margin:0">Moves down</p>`);
    const top = document.getElementById("top")!;
    await frames(2);
    resetMotion();
    top.style.height = "100px";
    await expect.poll(() => state.__ouroMotion!.shift).toBeGreaterThan(0);
    expect(readMotion().shift).toBeGreaterThan(0);
    const seen: number[] = [];
    const observer = new PerformanceObserver((list) => seen.push(...list.getEntries().map((entry) => (entry as unknown as { value: number }).value)));
    observer.observe({ type: "layout-shift" });
    top.style.height = "200px";
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    observer.disconnect();
    resetMotion();
    expect(readMotion().shift).toBe(0);
  });
});

describe("findRepaints", () => {
  const STYLE = `<style>
    @keyframes ouro-dash { to { stroke-dashoffset: 0 } }
    @keyframes ouro-shimmer { to { background-position: 200px 0 } }
    @keyframes ouro-spin { to { transform: rotate(1turn) } }
    @keyframes ouro-fade { to { opacity: 0.5; translate: 2px; scale: 1.1; rotate: 4deg } }
    @keyframes ouro-colour { to { color: red } }
    .dash { stroke-dasharray: 10; stroke-dashoffset: 20; animation: ouro-dash 1s linear infinite }
    .shimmer { animation: ouro-shimmer 1s linear infinite }
    .spin { animation: ouro-spin 1s linear infinite }
    .both { animation: ouro-shimmer 1s infinite, ouro-colour 1s infinite }
    .pseudo::before { content: ""; display: block; width: 10px; height: 10px; animation: ouro-shimmer 1s infinite }
  </style>`;

  it("finds endless animations that repaint, or that run inside an SVG drawing, once per target and pseudo-element", () => {
    render(`${STYLE}
      <svg width="40" height="40"><path class="dash" d="M0 0 L40 40" stroke="#000"/><circle id="dot" class="spin" cx="20" cy="20" r="4"/></svg>
      <div id="bar" class="shimmer a b c d" data-ouro-check-ref="s1" style="width:100px;height:10px"></div>
      <div class="both" style="width:100px;height:10px"></div>
      <div class="pseudo"></div>
      <div style="width:100px;height:10px;animation:ouro-shimmer 1s infinite"></div>`);
    const issues = findRepaints();
    expect(issues.map(({ element, detail }) => [element, detail.split(",")[0]])).toEqual([
      ["path.dash", "an endless animation that animates stroke-dashoffset"],
      ["circle#dot.spin", "an endless animation that animates inside an SVG drawing"],
      ["div#bar.shimmer.a.b", "an endless animation that animates background-position-x"],
      ["div.both", "an endless animation that animates background-position-x"],
      ["div.pseudo::before", "an endless animation that animates background-position-x"],
      ["div", "an endless animation that animates background-position-x"],
    ]);
    expect(issues[0]!).toMatchObject({ ref: "r1", rule: "repaint" });
    expect(issues[0]!.detail).toBe("an endless animation that animates stroke-dashoffset, so the page repaints every frame at rest: animate transform or opacity on an HTML element, or stop it once it has said what it says");
    expect(document.getElementById("bar")!.getAttribute("data-ouro-check-ref")).toBe(`s1 ${issues[2]!.ref}`);
  });

  it("passes transform and opacity spinners, finite and paused animations, a spinning svg, and allowed ones", () => {
    render(`${STYLE}
      <div class="spin" style="width:10px;height:10px"></div>
      <div style="width:10px;height:10px;animation:ouro-fade 1s infinite alternate"></div>
      <svg class="spin" width="40" height="40"></svg>
      <div style="animation:ouro-colour 1s 3">Finite</div>
      <div class="shimmer" style="animation-play-state:paused">Paused</div>
      <div class="shimmer" data-ouro-allow="repaint" data-ouro-allow-why="a loading bar shown for a moment">Allowed</div>
      <div data-ouro-allow="all" data-ouro-allow-why="a demo"><div class="shimmer">Allowed by all</div></div>`);
    const script = new Animation(new KeyframeEffect(null, [{ color: "red" }, { color: "blue" }], { duration: 1000, iterations: Infinity }), document.timeline);
    script.play();
    try {
      expect(findRepaints()).toEqual([]);
      host.lastElementChild!.removeAttribute("data-ouro-allow-why");
      expect(findRepaints().map((issue) => issue.element)).toEqual(["div.shimmer"]);
    } finally {
      script.cancel();
    }
  });
});

describe("markWalkables", () => {
  const never = "a[href^='http'], .danger";

  it("marks cards to hover, popups to open, regions to scroll or pan, and the page when it scrolls", () => {
    render(`
      <button id="menu" aria-haspopup="menu">Menu</button>
      <button aria-expanded="false" style="width:200px;height:80px">A big disclosure</button>
      <button popovertarget="tip">Tip</button><div popover id="tip">A tip</div>
      <details><summary>Details</summary>More</details>
      <a href="#here" aria-expanded="false" aria-label="  Jump   here ">Here</a>
      <a href="https://elsewhere.example/" aria-haspopup="true">Away</a>
      <a href="/away" aria-haspopup="true">Away</a>
      <button aria-haspopup="false">Not a popup</button>
      <button class="danger" aria-expanded="false">Delete</button>
      <button aria-expanded="false" hidden>Hidden</button>
      <button aria-expanded="false" disabled>Disabled</button>
      <div inert><button aria-expanded="false">Inert</button></div>
      <button aria-expanded="false" aria-hidden="true">Aria-hidden</button>
      <button aria-expanded="false" style="visibility:hidden">Invisible</button>
      <button aria-expanded="false" style="width:4px;height:4px;padding:0;overflow:hidden">Tiny</button>
      <button aria-expanded="false" data-ouro-allow="jank" data-ouro-allow-why="a heavy chart on purpose">Allowed</button>
      <button aria-expanded="false" data-ouro-allow="jank">No reason</button>
      <a href="/card" style="display:block;width:200px;height:80px">A card</a>
      <div tabindex="0" style="width:200px;height:80px"></div>
      <a href="/small">Small</a>
      <div id="list" style="width:250px;height:160px;overflow:auto"><div style="height:400px">Long list</div></div>
      <div style="width:250px;height:160px;overflow-x:auto;overflow-y:hidden"><div style="width:600px;height:10px"></div></div>
      <div style="width:250px;height:160px;overflow:auto"><div style="height:100px">Fits</div></div>
      <div style="width:250px;height:160px;cursor:grab"></div>
      <div style="width:100px;height:100px;overflow:auto"><div style="height:400px">Too small to scroll</div></div>
      <div style="height:${innerHeight * 2}px"></div>`);
    const walkables = markWalkables({ limit: 8, never });
    expect(walkables).toEqual([
      { ref: "w1", element: 'button#menu "Menu"', kind: "open" },
      { ref: "w2", element: 'button "A big disclosure"', kind: "open" },
      { ref: "w3", element: 'button "Tip"', kind: "open" },
      { ref: "w4", element: 'summary "Details"', kind: "open" },
      { ref: "w5", element: 'a "Jump here"', kind: "open" },
      { ref: "w6", element: 'button "No reason"', kind: "open" },
      { ref: "w7", element: 'button "A big disclosure"', kind: "hover" },
      { ref: "w8", element: 'a "A card"', kind: "hover" },
      { ref: "w9", element: "div", kind: "hover" },
      { ref: "w10", element: "the page", kind: "scroll", axis: "y", page: true },
      { ref: "w11", element: 'div#list "Long list"', kind: "scroll", axis: "y" },
      { ref: "w12", element: "div", kind: "scroll", axis: "x" },
      { ref: "w13", element: "div", kind: "pan" },
    ]);
    expect(host.querySelector("[aria-expanded]")!.getAttribute("data-ouro-check-ref")).toBe("w2 w7");
    expect(document.scrollingElement!.getAttribute("data-ouro-check-ref")).toBe("w10");
    document.scrollingElement!.removeAttribute("data-ouro-check-ref");
  });

  it("marks at most `limit` of each kind, and no page scroll when the page fits", () => {
    render(`
      <button aria-expanded="false">One</button><button aria-expanded="false">Two</button>
      <a href="/a" style="display:block;width:200px;height:80px">A</a><a href="/b" style="display:block;width:200px;height:80px">B</a>`);
    expect(markWalkables({ limit: 1, never }).map((w) => w.element)).toEqual(['button "One"', 'a "A"']);
  });
});

describe("findDesignIssues: doubled-line", () => {
  const line = (gap: number, across = "horizontal") => `two ${across} lines ${gap}px apart where one separates: keep one, or space them apart`;

  it("finds a divider drawn against a frame's edge or another line, across and down, naming both and marking the later", () => {
    render(`<section id="card" style="border:1px solid #bbb;border-radius:12px;overflow:hidden;width:320px"><ul style="margin:0;padding:0;list-style:none"><li style="padding:12px">Rye</li><li id="last" style="padding:12px;border-bottom:2px solid #bbb">Bun</li></ul></section>
<header id="head" style="border-bottom:1px solid #bbb;width:320px;margin-top:24px;padding:8px">Orders</header><hr id="rule" style="margin:2px 0 0;width:320px"><hr style="margin:2px 0 0;width:320px">
<div style="display:flex;height:120px;margin-top:24px"><nav id="side" style="width:120px;border-inline-end:1px solid #bbb">Side</nav><div id="split" style="width:1px;background:#bbb"></div><div style="flex:1">Main</div></div>
<div style="display:flex;flex-direction:column-reverse;width:320px;margin-top:24px;background:linear-gradient(#fff,#eee)"><div id="low" style="height:1px;background:#bbb"></div><div id="up" style="border-bottom:1px solid #bbb;padding:8px">Above</div></div>`);
    const issues = of("doubled-line");
    expect(issues.map(({ element, detail }) => [element, detail])).toEqual([
      ["section#card and li#last", line(0)],
      ["header#head and hr#rule", line(2)],
      ["div#low and div#up", line(0)],
      ["nav#side and div#split", line(0, "vertical")],
    ]);
    expect(document.getElementById("last")!.getAttribute("data-ouro-check-ref")).toBe(issues[0]!.ref);
    expect(document.getElementById("up")!.getAttribute("data-ouro-check-ref")).toBe(issues[2]!.ref);
  });

  it("passes frames side by side, lines that share pixels, collapsed tables, accents, lines apart or short, and the opted out", () => {
    render(`<p style="display:flex;gap:4px"><span style="border:1px solid #bbb;border-radius:999px;padding:2px 8px">Bread</span><span style="border:1px solid #bbb;border-radius:999px;padding:2px 8px">Bakery</span></p>
<div style="border:1px solid #bbb;height:40px;width:300px"></div><div style="border:1px solid #bbb;height:40px;width:300px;margin-top:4px"></div>
<div role="tablist" style="display:flex;border-bottom:1px solid #bbb;width:320px"><span style="padding:8px;border-bottom:2px solid #bbb;margin-bottom:-1px">One</span><span style="padding:8px">Two</span></div>
<table style="border-collapse:collapse"><tr><td style="border:1px solid #bbb">a</td></tr><tr><td style="border:1px solid #bbb">b</td></tr></table>
<table style="border-spacing:12px"><tr><td style="border:1px solid #bbb">a</td></tr><tr><td style="border:1px solid #bbb">b</td></tr></table>
<p style="border-inline-start:3px solid #c2410c;border-top:1px solid #bbb;padding:8px;width:300px">Bake at 7</p>
<div style="border-bottom:1px solid #bbb;width:300px;height:20px"></div><div style="border-top:1px solid #bbb;width:300px;margin-top:12px;height:20px"></div>
<div style="border-bottom:1px solid #bbb;width:20px;height:20px"></div><div style="border-top:1px solid #bbb;width:20px;height:20px"></div>
<div data-ouro-allow="doubled-line" data-ouro-allow-why="a ruled form" style="border-bottom:1px solid #bbb;width:300px;height:20px"></div><div style="border-top:1px solid #bbb;width:300px;height:20px"></div>
<div style="height:4px;width:300px;border-top:1px solid #bbb;border-bottom:1px solid #bbb;margin-top:24px"></div>
<div style="border-bottom:1px solid #fff;width:300px;height:20px;margin-top:24px"></div><div style="border-top:0px solid #bbb;height:2px;width:300px"></div><div style="border-top:1px solid #bbb;width:300px;height:20px"></div>
<div style="height:30px;overflow:hidden;width:300px;margin-top:24px"><div style="height:40px;border-bottom:1px solid #bbb"></div></div><div style="border-top:1px solid #bbb;width:300px;height:20px"></div>
<div style="position:relative;width:300px;margin-top:24px;isolation:isolate;border-top:1px solid #bbb"><span data-ouro-surface="" style="position:absolute;inset:0;border-bottom:1px solid #bbb"></span><p style="margin:0;height:20px">Surface</p></div><div style="border-top:1px solid #bbb;width:300px;height:20px"></div>`);
    expect(of("doubled-line")).toEqual([]);
  });

  it("passes a line a sticky bar covers, and finds a pair off the screen, where nothing can be hit", () => {
    render(`<div id="scroller" style="height:200px;overflow:auto;width:320px"><div style="position:sticky;top:0;background:#fff;border-bottom:1px solid #bbb;height:30px;z-index:1">Monday</div><div style="height:400px;position:relative"><button style="position:absolute;top:-10px;left:0;width:300px;height:40px;border:1px solid #bbb;background:#fff">Event</button></div></div>`);
    expect(of("doubled-line")).toEqual([]);
    host.remove();
    render(`<div style="position:absolute;top:3000px;left:0;width:320px"><div style="border-bottom:1px solid #bbb;height:20px"></div><div style="border-top:1px solid #bbb;height:20px"></div></div>`);
    expect(of("doubled-line").map(({ detail }) => detail)).toEqual([line(0)]);
  });

  it("passes a pair of lines a fixed opaque layer hides, not just the one under a sticky bar", () => {
    render(`<div style="position:fixed;top:0;left:0;width:320px;height:60px;background:#fff;z-index:5"></div><div style="border-bottom:1px solid #bbb;width:300px;height:20px"></div><div style="border-top:1px solid #bbb;width:300px;height:20px"></div>`);
    expect(of("doubled-line")).toEqual([]);
  });

  it("passes a pair of lines an opaque sheet covers, but still finds the same pair under a glass sheet", () => {
    const grid = `<div id="grid" style="border-bottom:1px solid #bbb;width:300px;height:20px"></div><div style="border-top:1px solid #bbb;width:300px;height:20px"></div>`;
    render(`${grid}<div style="position:fixed;inset:0;background:#fff;z-index:5"></div>`);
    expect(of("doubled-line")).toEqual([]);
    host.remove();
    render(`${grid}<div style="position:fixed;inset:0;background:rgb(255 255 255 / 0.6);backdrop-filter:blur(12px);z-index:5"></div>`);
    expect(of("doubled-line").map(({ detail }) => detail)).toEqual([line(0)]);
    host.remove();
    render(`${grid}<div style="position:fixed;inset:0;background:rgb(255 255 255 / 0.6);z-index:5"></div>`);
    expect(of("doubled-line").map(({ detail }) => detail)).toEqual([line(0)]);
  });

  it("passes a pair of hairline fills a scrollable ancestor clips away, even where an unrelated translucent box paints over their on-paper position", () => {
    render(`<div style="height:40px;overflow-y:auto;width:320px"><div style="position:relative;height:400px"><span style="position:absolute;inset-inline:0;top:200px;height:1px;background:#bbb"></span><span style="position:absolute;inset-inline:0;top:205px;height:1px;background:#bbb"></span></div></div><div style="width:320px;height:300px;background:rgb(255 255 255 / 0.6)"></div>`);
    expect(of("doubled-line")).toEqual([]);
  });

  it("treats a cover with no fill of its own as resting on the page's own opaque background", () => {
    render(`<div style="border-bottom:1px solid #bbb;width:300px;height:20px"></div><div style="border-top:1px solid #bbb;width:300px;height:20px"></div><div style="position:fixed;inset:0;z-index:5"></div>`);
    expect(of("doubled-line")).toEqual([]);
  });

  it("reads lines further apart as one drawn twice when told a wider gap", () => {
    render(`<div style="border-bottom:1px solid #bbb;width:300px;height:20px"></div><div style="border-top:1px solid #bbb;width:300px;margin-top:10px;height:20px"></div>`);
    expect(of("doubled-line")).toEqual([]);
    expect(of("doubled-line", { lineGapPx: 12 }).map(({ detail }) => detail)).toEqual([line(10)]);
  });
});

describe("findDesignIssues: count-badge", () => {
  // A host's fonts place a centred count's numerals a fraction of a pixel apart, so these cases, whose faults are 4px or
  // more, judge centring at 1.5px.
  const slack = { badgeSlackPx: 1.5 };
  it("finds a count off its middle, high, low, right or left, a clipped one, and one at another offset from its icon", () => {
    render(`<style>.b{position:relative;display:inline-block;margin:24px}.b svg{display:block}.c{position:absolute;top:-6px;inset-inline-end:-8px;box-sizing:border-box;height:16px;min-width:16px;border-radius:999px;background:#b91c1c;color:#fff;font:600 10px/16px sans-serif;text-align:center}</style>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span id="high" class="c" style="line-height:6px">3</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span id="right" class="c" style="line-height:26px;padding-inline-start:8px;min-width:24px">4</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span id="left" class="c" style="padding-inline-end:8px;min-width:24px"> <b>5</b></span></span>
<span class="b" style="overflow:hidden"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span id="cut" class="c">6</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span id="odd" class="c" style="top:-2px;inset-inline-end:-3px">7</span></span>
<span class="b" dir="rtl"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c">8</span></span>
<span class="b" style="padding:0"><span class="c" style="position:absolute">9</span>Inbox</span>`);
    const issues = of("count-badge", slack);
    expect(issues.map(({ element }) => element)).toEqual(['span#high.c "3"', 'span#right.c "4"', 'span#left.c "5"', 'span#cut.c "6"', 'span#odd.c "7"']);
    const [high, right, left, cut, odd] = issues.map(({ detail }) => detail);
    expect(high).toMatch(/^its numerals sit [\d.]+px high of the badge's middle: centre their ink, not their line box$/);
    expect(right).toMatch(/^its numerals sit [\d.]+px low and [\d.]+px to the right of the badge's middle/);
    expect(left).toMatch(/^its numerals sit [\d.]+px to the left of the badge's middle/);
    expect(cut).toBe("clipped: 8×10 of its 16×16 is drawn; let it overflow the box around it, or move it inside");
    expect(odd).toBe("set 3px past its 24px icon's side and 2px above its top, where the page's other badges sit 8px and 6px: give every badge one offset");
    expect(document.getElementById("odd")!.getAttribute("data-ouro-check-ref")).toBe(issues[4]!.ref);
  });

  it("passes centred counts at one offset, either side of their icons, and what is no count badge or is opted out", () => {
    render(`<style>.b{position:relative;display:inline-block;margin:24px}.b svg{display:block}.c{position:absolute;top:-6px;inset-inline-end:-8px;box-sizing:border-box;height:16px;min-width:16px;padding:0 4px;border-radius:999px;background:#b91c1c;color:#fff;font:600 10px/16px sans-serif;text-align:center}</style>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c">3</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c">12</span></span>
<span class="b" dir="rtl"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c">99+</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c" style="line-height:6px" data-ouro-allow="count-badge" data-ouro-allow-why="a deliberate dot">4</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c">New</span></span>
<span class="c" style="position:static;display:inline-block;line-height:6px">5</span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c" style="height:32px;line-height:6px">6</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c" style="background:transparent;color:#111;line-height:6px">7</span></span>
<span class="b"><svg width="24" height="24"><rect width="24" height="24" fill="#555"/></svg><span class="c" style="display:flex;align-items:center;justify-content:center;text-box:trim-both cap alphabetic">8</span></span>`);
    expect(of("count-badge", slack)).toEqual([]);
    // With no slack, a centred count still reads a fraction of a pixel off: its ink is measured finer than the whole
    // pixels a Linux host rounds a font's metrics to at a badge's size (WebKit read every one as exactly centred, Chromium
    // as 1px high).
    const exact = of("count-badge", { badgeSlackPx: 0 });
    expect(exact.length).toBeGreaterThan(0);
    for (const { detail } of exact) expect(detail).toMatch(/^its numerals sit 0\.\dpx (high|low|to the (left|right))( and 0\.\dpx to the (left|right))? of/);
  });
});

describe("findDesignIssues: off-centre-text", () => {
  const way = (what: string, side: string) => new RegExp(`^its ${what} sits [\\d.]+px ${side}, by its cap height: even the padding above and below it, and centre it on its cap height, not its line box$`);

  it("finds one line of words off its control's middle by its cap height: a field's placeholder and value, a writing area, a button, an editor, and a bare text area in its frame", () => {
    render(`<p><input id="low" placeholder="Search" style="font:16px/24px system-ui, sans-serif;padding:14px 12px 2px;border:1px solid #999"></p>
<p><input id="high" value="Rye loaf" style="font:16px/24px system-ui, sans-serif;padding:2px 12px 14px;border:1px solid #999"></p>
<p><textarea id="area" rows="1" placeholder="Write" style="font:16px/24px system-ui, sans-serif;padding:14px 12px 4px;border:1px solid #999;resize:none;height:44px;box-sizing:border-box"></textarea></p>
<p><button id="btn" style="font:16px/24px system-ui, sans-serif;padding:14px 16px 2px;border:1px solid #999;background:#fff;color:#000">Save</button></p>
<p><button id="trim" style="font:16px/24px system-ui, sans-serif;padding:14px 16px 2px;border:1px solid #999;background:#fff;color:#000;text-box:trim-both cap alphabetic">Trim</button></p>
<div id="ed" contenteditable="true" style="font:16px/24px system-ui, sans-serif;padding:14px 12px 2px;border:1px solid #999;width:240px"></div><style>#ed:empty::before{content:"Write a note"}</style>
<div id="typed" contenteditable="true" style="font:16px/24px system-ui, sans-serif;padding:2px 12px 14px;border:1px solid #999;width:240px">Hello</div>
<div style="display:flex;align-items:flex-end;gap:8px;border:1px solid #999;border-radius:22px;padding:6px 6px 6px 16px;width:360px;box-sizing:border-box;margin-top:16px"><textarea id="bare" rows="1" placeholder="Write a message" style="flex:1;border:0;outline:0;resize:none;background:transparent;font:16px/24px system-ui, sans-serif;padding:0 0 2px;height:26px;box-sizing:border-box"></textarea><button aria-label="Send" style="width:44px;height:44px;border-radius:22px;border:0;background:#06c"></button></div>`);
    const issues = of("off-centre-text");
    expect(issues.map(({ element }) => element)).toEqual(["input#low", "input#high", "textarea#area", 'button#btn "Save"', 'button#trim "Trim"', "div#ed", 'div#typed "Hello"', "textarea#bare"]);
    const [low, high, area, button, trim, editor, typed, bare] = issues.map(({ detail }) => detail);
    expect(low).toMatch(way("placeholder", "low"));
    expect(high).toMatch(way("text", "high"));
    expect(area).toMatch(way("placeholder", "low"));
    expect(button).toMatch(way("text", "low"));
    expect(trim).toMatch(way("text", "low"));
    expect(editor).toMatch(way("placeholder", "low"));
    expect(typed).toMatch(way("text", "high"));
    expect(bare).toMatch(way("placeholder", "low"));
    expect(document.getElementById("bare")!.getAttribute("data-ouro-check-ref")).toBe(issues[7]!.ref);
  });

  it("passes centred words, a box of two lines or more, words on two lines, an icon over or under its label, hidden or trimmed words, the opted out and a scaled thumbnail", () => {
    render(`<p><input placeholder="Search" style="font:16px/24px system-ui, sans-serif;padding:8px 12px;border:1px solid #999"></p>
<p><input value="" style="font:16px/24px system-ui, sans-serif;padding:8px 12px;border:1px solid #999"></p>
<p><input type="checkbox"></p>
<p><textarea rows="4" placeholder="A long note" style="font:16px/24px system-ui, sans-serif;padding:8px"></textarea></p>
<p><button style="font:16px/24px system-ui, sans-serif;padding:8px 16px;border:1px solid #999;background:#fff;display:inline-flex;align-items:center;gap:8px"><svg width="16" height="16" aria-hidden="true"><rect width="16" height="16"/></svg><svg width="0" height="0" aria-hidden="true"></svg>Save</button></p>
<p><button style="display:flex;flex-direction:column;align-items:center;height:56px;box-sizing:border-box;padding:20px 8px 8px;border:0;background:#eee;font:12px/16px system-ui, sans-serif"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12"/></svg>Chat</button></p>
<p><button style="display:flex;flex-direction:column;align-items:center;height:56px;box-sizing:border-box;padding:8px 8px 20px;border:0;background:#eee;font:12px/16px system-ui, sans-serif">Files<svg width="12" height="12" aria-hidden="true"><rect width="12" height="12"/></svg></button></p>
<p><button style="font:16px system-ui, sans-serif;padding:8px 16px;border:1px solid #999;background:#fff">Normal line</button></p>
<p><button aria-label="Close" style="width:32px;height:32px"><svg width="16" height="16" aria-hidden="true"></svg></button></p>
<p><button style="font:16px/24px system-ui, sans-serif;padding:8px 16px">Save <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">changes now</span></button></p>
<p><button style="font:16px/24px system-ui, sans-serif;padding:8px 16px;max-width:90px">Two words wrap</button></p>
<p><button style="font:16px/24px system-ui, sans-serif;height:120px;padding:4px">Tall</button></p>
<p><button style="font:16px/24px system-ui, sans-serif;padding:8px 16px;text-box:trim-both cap alphabetic">Trimmed</button></p>
<p><button style="font:16px/24px system-ui, sans-serif;padding:2px 16px 14px" data-ouro-allow="off-centre-text" data-ouro-allow-why="a deliberate baseline">Opted</button></p>
<div contenteditable="true" style="font:16px/24px system-ui, sans-serif;padding:8px 12px;border:1px solid #999;width:240px"></div>
<div style="transform:scale(0.5);transform-origin:0 0"><button style="font:16px/24px system-ui, sans-serif;padding:8px 16px;border:1px solid #999;background:#fff">Small</button></div>
<div style="display:flex;align-items:center;gap:8px;border:1px solid #999;border-radius:22px;padding:6px 6px 6px 16px;width:360px;box-sizing:border-box"><textarea rows="1" placeholder="Write a message" style="flex:1;border:0;outline:0;resize:none;background:transparent;font:16px/24px system-ui, sans-serif;padding:0;height:24px;box-sizing:border-box"></textarea><button aria-label="Send" style="width:44px;height:44px;border-radius:22px;border:0;background:#06c"></button></div>`);
    expect(of("off-centre-text")).toEqual([]);
  });

  it("reads a capLabel-trimmed word by its own trimmed box, not a canvas-measured ascent stacked on top of it", () => {
    render(`<p><button style="font:16px/24px system-ui, sans-serif;padding:8px 16px;border:1px solid #999;background:#fff"><span style="text-box:trim-both cap alphabetic">Save</span></button></p>`);
    expect(of("off-centre-text")).toEqual([]);
  });

  it("lets words sit further off when told a wider slack", () => {
    render(`<p><input placeholder="Search" style="font:16px/24px system-ui, sans-serif;padding:14px 12px 2px;border:1px solid #999"></p>`);
    expect(of("off-centre-text", { fieldSlackPx: 8 })).toEqual([]);
    expect(of("off-centre-text")).toHaveLength(1);
    document.body.innerHTML = "";
    render(`<p><button style="font:16px/24px system-ui, sans-serif;padding:14px 16px 2px;border:1px solid #999;background:#fff">Save</button></p>`);
    expect(of("off-centre-text", { textSlackPx: 8 })).toEqual([]);
    expect(of("off-centre-text")).toHaveLength(1);
  });
});
