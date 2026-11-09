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

  it("names the closest of the boxes above a heading", () => {
    render(`<section><div style="height:80px;background:#eef"><div id="inner" style="position:relative;top:4px;height:80px;background:#3a7"></div></div><h2 style="margin:8px 0 0;font-size:40px;line-height:48px">Closest wins</h2></section>`);
    expect(of("cramped-heading").map((issue) => issue.detail)).toEqual(["4px below div#inner; a 40px heading needs 10px"]);
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
  const reading = (picture: string, corners = ALL): CornerReading => ({ ref: "c1", element: "media/window.webm", shot: picture, radius: 14, behind: WHITE, corners });

  it("finds a media whose own pixels draw a corner of one colour inside its frame, on two corners or more", async () => {
    expect(await readCorners([reading(window_())])).toEqual([
      { ref: "c1", rule: "baked-corner", element: "media/window.webm", detail: "the top left, top right, bottom left, bottom right corners draw a colour neither edge beside them has: the media's own corners show inside its frame" },
    ]);
    expect(await readCorners([reading(window_(), ["top right", "bottom right"])])).toMatchObject([{ detail: expect.stringMatching(/^the top right, bottom right corners/) }]);
  });

  it("passes plain corners, one corner, corners the screen doesn't show, corners of different colours, and edges that disagree", async () => {
    const plain = shot((x, y) => (outside(x, y, 14) ? WHITE : LIGHT));
    const one = window_(["top left"]);
    const mixed = window_(["top left", "top right"], (x) => (x < 100 ? BLACK : RED));
    const striped = shot((x, y) => (outside(x, y, 14) ? WHITE : outside(x, y, 28) ? BLACK : y < 30 ? BLUE : LIGHT));
    expect(await readCorners([reading(plain), reading(one), reading(window_(), ["top left"]), reading(mixed), reading(striped, ["top left", "top right"])])).toEqual([]);
    expect(await readCorners([reading(striped)])).toMatchObject([{ detail: expect.stringMatching(/^the bottom left, bottom right corners/) }]);
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
