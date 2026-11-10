import { afterEach, describe, expect, it } from "vitest";
import {
  collectWindowBoxes,
  dragSamples,
  inTitleBand,
  judgeDrag,
  judgeSettled,
  judgeWindow,
  toWindow,
  WINDOW_RULES,
  type NativeMeasure,
  type PageBox,
  type PageBoxes,
} from "@/registry/ouro/check/window-check";

// Ouro check's window rules (window-check.ts): the in-page collector on real pages in a browser, and the rules on
// made-up snapshots of a page and a native window, each with a case that fails and one that passes.

let host: HTMLDivElement | undefined;

afterEach(() => {
  host?.remove();
  host = undefined;
  window.scrollTo(0, 0);
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

// A one-pixel PNG, drawn larger. Not one a canvas makes: under load, WebKit's canvas can answer an empty picture.
const PICTURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const find = (boxes: PageBoxes, label: string, kind?: PageBox["kind"]) => {
  const found = boxes.items.filter((b) => b.label === label && (!kind || b.kind === kind));
  expect(found, `${kind ?? "any"} ${label}`).toHaveLength(1);
  return found[0]!;
};
const none = (boxes: PageBoxes, label: string) => expect(boxes.items.filter((b) => b.label.includes(label)), label).toEqual([]);

describe("collectWindowBoxes", () => {
  it("collects text, controls and pictures, with labels, ids, the control that holds each and its opacity", async () => {
    const url = PICTURE;
    render(`
      <p>Hello   words</p>
      <button aria-label="Save">S</button>
      <a href="#x">Link <span>inner</span></a>
      <img alt="green" src="${url}" width="20" height="20">
      <img alt="no source" width="10" height="10" style="display:inline-block">
      <svg width="20" height="20" role="img"><title>a dot</title><circle cx="10" cy="10" r="5"/><svg role="img"></svg><g role="img"></g></svg>
      <canvas width="10" height="10"></canvas>
      <input title="Name">
      <div role="img" style="width:10px;height:10px"></div>
      <div style="opacity:0.5"><button>Half</button></div>
      <button style="width:0;height:0;padding:0;border:0;overflow:hidden"></button>
      <canvas width="0" height="0" style="display:block"></canvas>
      <p style="font-size:0">tiny</p>
      <svg width="40" height="20"><text x="0" y="15">svg words</text></svg>
      <div><span>one</span><span>two</span></div>`);
    await Promise.all([...document.querySelectorAll("img[src]")].map((img) => (img as HTMLImageElement).decode()));
    const boxes = collectWindowBoxes();
    expect(boxes.zoom).toBe(1);
    expect(boxes.viewport).toEqual({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });

    const words = find(boxes, 'p "Hello words"', "text");
    expect(words.id).toMatch(/^html>body>div(:\d+)?>p:1#text$/);
    expect(words).toMatchObject({ same: "text:Hello words", top: true, seen: true, opacity: 1, allow: [] });
    expect(words.control).toBeUndefined();
    expect(words.outside).toBeUndefined();
    expect(words.path[0]).toBe(words.id.replace(/>p:1#text$/, ""));
    expect(words.vis).toEqual(words.rect);

    const save = find(boxes, 'button "Save"', "control");
    expect(save.control).toBe(save.id);
    const saveText = find(boxes, 'button "S"', "text");
    // A control's own words are the control's box (its id with #text), not a part inside it.
    expect(saveText.id).toBe(`${save.id}#text`);
    expect(saveText.control).toBeUndefined();
    const inner = find(boxes, 'span "inner"', "text");
    expect(inner.control).toBe(find(boxes, 'a "Link inner"', "control").id);

    expect(find(boxes, 'img "green"').same).toBe(`IMG:${url}`);
    expect(find(boxes, 'img "no source"').same).toBeUndefined();
    expect(find(boxes, 'svg "a dot"').same).toMatch(/^svg:<title>a dot<\/title><circle/);
    expect(boxes.items.filter((b) => b.label === "svg" || b.label === "g")).toEqual([]);
    const canvases = boxes.items.filter((b) => b.label === "canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0]!.same).toBeUndefined();
    expect(find(boxes, 'input "Name"').kind).toBe("control");
    expect(find(boxes, "div").kind).toBe("image");
    expect(find(boxes, 'button "Half"', "control").opacity).toBe(0.5);
    expect(boxes.items.filter((b) => b.kind === "control" && b.label === "button")).toEqual([]);
    none(boxes, "tiny");
    expect(boxes.items.filter((b) => b.kind === "text" && b.label.includes("svg words"))).toEqual([]);
    const [one, two] = [find(boxes, 'span "one"'), find(boxes, 'span "two"')];
    expect(one.id).toMatch(/>span:1#text$/);
    expect(two.id).toMatch(/>span:2#text$/);
  });

  it("leaves out what isn't drawn: hidden, invisible, faded out, screen-reader only, an aria-hidden picture and inert", () => {
    render(`
      <p hidden>attribute hidden</p>
      <p style="visibility:hidden">visibility hidden</p>
      <p style="display:none">display none</p>
      <p style="opacity:0.04">faded out</p>
      <span class="sr-only">screen reader only</span>
      <div aria-hidden="true"><svg width="10" height="10" aria-label="hidden picture"><rect width="10" height="10"/></svg></div>
      <div inert><button>inert button</button></div>
      <p>kept</p>`);
    const boxes = collectWindowBoxes();
    find(boxes, 'p "kept"');
    for (const label of ["attribute hidden", "visibility hidden", "display none", "faded out", "screen reader only", "hidden picture", "inert button"]) none(boxes, label);
  });

  it("knows what is drawn on top, at the middle or anywhere, and the part of a box a scroller lets show", () => {
    render(`
      <div style="overflow:auto;height:100px;width:200px">
        <div style="height:400px">
          <p style="margin:0;height:20px">first</p>
          <p style="margin:70px 0 0;height:20px;line-height:20px">half shown</p>
          <p style="margin:300px 0 0;height:20px">scrolled away</p>
        </div>
      </div>
      <div style="position:relative;width:100px;height:40px">
        <p style="margin:0">under</p>
        <div style="position:absolute;inset:0;background:white"></div>
      </div>
      <div style="position:relative;width:240px;height:40px">
        <p style="margin:0;width:240px;height:40px">partly covered words</p>
        <div style="position:absolute;left:40px;top:0;width:160px;height:40px;background:white"></div>
      </div>
      <button style="position:relative"><span>Label</span><i style="position:absolute;inset:0"></i></button>
      <button><span style="pointer-events:none">Through</span></button>`);
    const boxes = collectWindowBoxes();
    expect(find(boxes, 'p "first"')).toMatchObject({ top: true, seen: true });
    const half = find(boxes, 'p "half shown"');
    expect(half.rect.height).toBeGreaterThan(half.vis.height);
    expect(half.vis.height).toBeGreaterThan(0);
    const away = find(boxes, 'p "scrolled away"');
    expect(away).toMatchObject({ top: false, seen: false });
    expect(away.vis.height).toBe(0);
    expect(find(boxes, 'p "under"')).toMatchObject({ top: false, seen: false });
    expect(find(boxes, 'p "partly covered words"')).toMatchObject({ top: false, seen: true });
    // A label under a part of its own control, and a label the press passes through to its control: the same target.
    expect(find(boxes, 'span "Label"', "text")).toMatchObject({ top: true, seen: true });
    expect(find(boxes, 'span "Through"', "text")).toMatchObject({ top: true, seen: true });
  });

  it("marks what the window's edge cuts and nothing scrolls into view, and leaves out what is wholly past it", () => {
    const w = innerWidth;
    const h = innerHeight;
    render(`
      <button style="position:fixed;right:-20px;top:10px;width:60px">cut right</button>
      <button style="position:fixed;left:10px;top:-10px;width:60px;height:30px">cut top</button>
      <div style="overflow:auto;height:20px;width:20px"><button style="position:fixed;right:-20px;top:60px;width:60px">cut in a still box</button></div>
      <button style="position:fixed;left:-200px;top:100px;width:50px">gone left</button>
      <button style="position:fixed;left:100px;top:-100px;height:50px">gone up</button>
      <button style="position:fixed;left:${w + 10}px;top:100px">gone right</button>
      <button style="position:fixed;left:100px;top:${h + 10}px">gone down</button>
      <div style="overflow:hidden;width:50px;height:50px"><button style="position:fixed;left:200px;top:200px">fixed past its clip</button><button style="position:fixed;left:10px;top:${h - 40}px">fixed below its clip</button></div>
      <div style="overflow:hidden;width:200px;height:50px"><button>inside its clip</button></div>
      <div style="overflow-x:auto;width:100%"><p style="width:${w + 200}px;margin:0;padding-left:${w - 50}px;white-space:nowrap">wide words that scroll sideways in their own box</p></div>`);
    const boxes = collectWindowBoxes();
    expect(find(boxes, 'button "cut right"', "control").outside).toBe(true);
    expect(find(boxes, 'button "cut top"', "control").outside).toBe(true);
    expect(find(boxes, 'button "cut in a still box"', "control").outside).toBe(true);
    for (const label of ["gone left", "gone up", "gone right", "gone down"]) {
      const gone = find(boxes, `button "${label}"`, "control");
      expect(gone, label).toMatchObject({ top: false, seen: false });
      expect(gone.outside, label).toBeUndefined();
    }
    expect(find(boxes, 'button "fixed past its clip"', "control").top).toBe(false);
    expect(find(boxes, 'button "fixed below its clip"', "control").top).toBe(false);
    expect(find(boxes, 'button "inside its clip"', "control").top).toBe(true);
    expect(find(boxes, 'p "wide words that scroll sideways in their own box"').outside).toBeUndefined();
  });

  it("doesn't mark an element the page itself scrolls into view, down or sideways", () => {
    const w = innerWidth;
    const h = innerHeight;
    render(`<p style="margin:0;position:absolute;left:0;top:${h - 10}px;height:40px">past the bottom</p>`);
    expect(find(collectWindowBoxes(), 'p "past the bottom"').outside).toBeUndefined();
    host!.remove();
    render(`<p style="margin:0;position:absolute;left:${w - 20}px;top:10px;width:80px;white-space:nowrap">past the right</p>`);
    expect(find(collectWindowBoxes(), 'p "past the right"').outside).toBeUndefined();
  });

  it("gives the same key to the same words and the same picture, for ghost-layer", async () => {
    const url = PICTURE;
    render(`<p>Twice</p><p>Twice</p><img alt="a" src="${url}" width="20" height="20"><img alt="b" src="${url}" width="20" height="20">`);
    await Promise.all([...document.querySelectorAll("img")].map((img) => img.decode()));
    const boxes = collectWindowBoxes();
    const twice = boxes.items.filter((b) => b.same === "text:Twice");
    expect(twice).toHaveLength(2);
    expect(twice[0]!.id).not.toBe(twice[1]!.id);
    expect(find(boxes, 'img "a"').same).toBe(find(boxes, 'img "b"').same);
  });

  it("reads allowances with a reason, from the element or a box around it, and drops one without", () => {
    render(`
      <div data-ouro-allow="chrome-overlap  ghost-layer" data-ouro-allow-why="the app's own drag handle"><p data-ouro-allow="faded" data-ouro-allow-why="fades in on purpose">allowed</p></div>
      <div data-ouro-allow="all" data-ouro-allow-why="  "><p>no reason</p></div>
      <div data-ouro-allow-why="a reason and no rule"><p>no rule</p></div>`);
    const boxes = collectWindowBoxes();
    expect(find(boxes, 'p "allowed"').allow).toEqual(["faded", "chrome-overlap", "ghost-layer"]);
    expect(find(boxes, 'p "no reason"').allow).toEqual([]);
    expect(find(boxes, 'p "no rule"').allow).toEqual([]);
  });

  it("takes the window's size from innerWidth and innerHeight when the root has none", () => {
    const root = document.documentElement;
    Object.defineProperty(root, "clientWidth", { configurable: true, get: () => 0 });
    Object.defineProperty(root, "clientHeight", { configurable: true, get: () => 0 });
    try {
      expect(collectWindowBoxes().viewport).toEqual({ width: innerWidth, height: innerHeight });
    } finally {
      delete (root as unknown as { clientWidth?: number }).clientWidth;
      delete (root as unknown as { clientHeight?: number }).clientHeight;
    }
  });
});

// A made-up Mac window, 800×600 points, with its title bar's 52-point band, traffic lights, a toolbar item and the
// toolbar itself (not a control), and its page drawn from the window's top left.
const close = { role: "AXButton", subrole: "AXCloseButton", label: "close button", control: true, frame: { x: 20, y: 18, width: 14, height: 16 } };
const share = { role: "AXButton", label: null, control: true, frame: { x: 700, y: 12, width: 28, height: 28 } };
const toolbar = { role: "AXToolbar", control: false, frame: { x: 0, y: 0, width: 800, height: 52 } };
const mac = (over: Partial<NativeMeasure> = {}): NativeMeasure => ({
  window: { width: 800, height: 600 },
  scale: 2,
  appearance: "light",
  titleBand: { x: 0, y: 0, width: 800, height: 52 },
  chrome: [close, share, toolbar],
  content: { x: 0, y: 0, width: 800, height: 600 },
  ...over,
});
const at = (x: number, y: number, width = 40, height = 20) => ({ x, y, width, height });
const item = (id: string, rect = at(100, 100), over: Partial<PageBox> = {}): PageBox => ({ id, kind: "text", label: `p "${id}"`, rect, vis: rect, top: true, seen: true, opacity: 1, path: [], allow: [], ...over });
const page = (items: PageBox[], zoom = 1): PageBoxes => ({ viewport: { width: 800, height: 600 }, zoom, items });
const noVis = (b: PageBox): PageBox => {
  const rest: Partial<PageBox> = { ...b };
  delete rest.vis;
  return rest as PageBox;
};
const noContent = (over: Partial<NativeMeasure> = {}): NativeMeasure => {
  const native = mac(over);
  delete native.content;
  return native;
};

describe("toWindow", () => {
  it("puts a page box in window points: the content view's frame plus the page's zoom", () => {
    expect(toWindow(at(10, 20, 30, 40), { x: 5, y: 52, width: 800, height: 548 }, 2)).toEqual({ x: 25, y: 92, width: 60, height: 80 });
    expect(toWindow(at(10, 20, 30, 40), { x: 5, y: 52, width: 800, height: 548 })).toEqual({ x: 15, y: 72, width: 30, height: 40 });
    expect(toWindow(at(10, 20, 30, 40), undefined)).toEqual(at(10, 20, 30, 40));
  });
});

describe("inTitleBand", () => {
  it("names each drawn element in the title bar's band, with its middle (inside the band) to hit test", () => {
    const items = [
      item("short", at(100, 10, 40, 20)),
      item("tall", at(200, 10, 40, 200)),
      noVis(item("no part drawn", at(300, 30, 20, 10))),
      item("below", at(100, 100)),
      item("under", at(400, 10), { top: false }),
      item("clear", at(500, 10), { opacity: 0.05 }),
    ];
    expect(inTitleBand(mac(), page(items))).toEqual([
      { id: "short", point: [120, 20] },
      { id: "tall", point: [220, 51] },
      { id: "no part drawn", point: [310, 35] },
    ]);
    expect(inTitleBand(noContent(), page([item("zoomless", at(100, 10))], 0))).toEqual([{ id: "zoomless", point: [120, 20] }]);
  });

  it("names nothing when the window has no title bar band", () => {
    expect(inTitleBand(mac({ titleBand: { x: 0, y: 0, width: 800, height: 0 } }), page([item("short", at(100, 10))]))).toEqual([]);
  });
});

const rulesOf = (findings: { rule: string }[]) => findings.map((f) => f.rule);

describe("WINDOW_RULES", () => {
  it("names the nine window rules", () => {
    expect([...WINDOW_RULES]).toEqual(["chrome-overlap", "under-title-bar", "outside-window", "ghost-layer", "band-not-draggable", "control-drags", "moved-after-first-frame", "popped-in", "faded"]);
  });
});

describe("judgeWindow", () => {
  it("chrome-overlap: a page element under a native control, named with the control's label, role and subrole", () => {
    const findings = judgeWindow(mac(), page([item("under the close button", at(16, 16, 20, 10)), item("under share", at(690, 20, 20, 10))]));
    expect(rulesOf(findings)).toEqual(["chrome-overlap", "chrome-overlap"]);
    expect(findings[0]).toEqual({
      rule: "chrome-overlap",
      element: 'p "under the close button"',
      detail: "text at 16,16 20×10 is under the window's close button (AXButton AXCloseButton) at 20,18 14×16: 112 pt² overlap",
      box: { x: 16, y: 16, width: 20, height: 18 },
    });
    expect(findings[1]!.detail).toBe("text at 690,20 20×10 is under the window's AXButton (AXButton) at 700,12 28×28: 100 pt² overlap");
  });

  it("chrome-overlap passes a page that keeps clear of the controls, or allows it with a reason", () => {
    const findings = judgeWindow(mac({ titleBand: { x: 0, y: 0, width: 800, height: 0 } }), page([item("clear", at(100, 16)), item("allowed", at(16, 16), { allow: ["chrome-overlap"] }), item("all", at(16, 16), { allow: ["all"] })]));
    expect(findings).toEqual([]);
  });

  it("under-title-bar: a page element in the band, and the title bar taking a click at its middle", () => {
    const findings = judgeWindow(
      mac(),
      page([
        item("in the band", at(100, 30)),
        item("the bar takes it", at(200, 30), { reach: { content: false, view: "NSTitlebarView" } }),
        item("its frame takes it", at(300, 30), { reach: { content: false } }),
        item("under the close button", at(16, 16, 20, 10)),
      ]),
    );
    expect(rulesOf(findings)).toEqual(["chrome-overlap", "under-title-bar", "under-title-bar", "under-title-bar"]);
    expect(findings[1]).toEqual({ rule: "under-title-bar", element: 'p "in the band"', detail: "text at 100,30 40×20 reaches 20 pt into the title bar's 52 pt band", box: { x: 0, y: 0, width: 800, height: 52 } });
    expect(findings[2]!.detail).toBe("text at 200,30 40×20 reaches 20 pt into the title bar's 52 pt band, and the title bar (NSTitlebarView) takes a click at its middle");
    expect(findings[3]!.detail).toMatch(/and the title bar \(its frame\) takes a click at its middle$/);
  });

  it("under-title-bar passes an element the page reaches, one allowed, one below the band, and a window with no band", () => {
    const items = [item("reached", at(100, 30), { reach: { content: true } }), item("allowed", at(200, 30), { allow: ["under-title-bar"] }), item("below", at(100, 60))];
    expect(judgeWindow(mac(), page(items))).toEqual([]);
    expect(judgeWindow(mac({ titleBand: { x: 0, y: 0, width: 800, height: 0 } }), page([item("in the band", at(100, 30))]))).toEqual([]);
  });

  it("judges only what is drawn: on top, not faded out, inside the window, and the drawn part of a box", () => {
    const items = [
      item("covered", at(16, 16), { top: false }),
      item("faded out", at(16, 16), { opacity: 0.05 }),
      item("past the window", at(900, 10)),
      // Its box is under the close button, and only its drawn part is judged, below the band.
      item("cut by a scroller", at(16, 16, 40, 80), { vis: at(16, 60, 40, 36) }),
    ];
    expect(judgeWindow(mac(), page(items))).toEqual([]);
  });

  it("uses the box when there's no drawn part, the page's zoom, and the window's origin when there's no content frame", () => {
    expect(rulesOf(judgeWindow(noContent(), page([noVis(item("no part drawn", at(16, 16, 10, 10)))])))).toEqual(["chrome-overlap"]);
    expect(rulesOf(judgeWindow(mac(), page([item("zoomed", at(9, 9, 5, 5))], 2)))).toEqual(["chrome-overlap"]);
    expect(rulesOf(judgeWindow(mac(), page([item("unzoomed", at(16, 16, 10, 10))], 0)))).toEqual(["chrome-overlap"]);
  });

  it("outside-window: an element the window's edge cuts that nothing scrolls into view, unless allowed", () => {
    const findings = judgeWindow(mac(), page([item("cut", at(780, 300), { outside: true }), item("allowed", at(780, 400), { outside: true, allow: ["outside-window"] })]));
    expect(findings).toEqual([{ rule: "outside-window", element: 'p "cut"', detail: "at 780,300 40×20, past the 800×600 window, and nothing scrolls it into view", box: at(780, 300) }]);
  });

  it("ghost-layer: the same words or picture drawn twice, one over the other", () => {
    const findings = judgeWindow(mac(), page([item("a", at(100, 100), { same: "text:Twice" }), item("b", at(105, 102), { same: "text:Twice" })]));
    expect(findings).toEqual([{ rule: "ghost-layer", element: 'p "a"', detail: "drawn twice: at 100,100 40×20 and at 105,102 40×20", box: { x: 100, y: 100, width: 45, height: 22 } }]);
  });

  it("ghost-layer passes copies apart, barely touching, held one in the other, allowed, unseen, faded out or past the window", () => {
    const twice = { same: "text:Twice" };
    const pairs: PageBox[][] = [
      [item("a", at(100, 100), twice), item("b", at(300, 100), twice)],
      [item("a", at(100, 100), twice), item("b", at(135, 100), twice)],
      [item("html>p", at(100, 100), twice), item("html>p>span", at(100, 100), { ...twice, path: ["html>p"] })],
      [item("html>p>span", at(100, 100), { ...twice, path: ["html>p"] }), item("html>p#text", at(100, 100), twice)],
      [item("html>button", at(100, 100), { ...twice, kind: "control" }), item("html>button#text", at(100, 100), twice)],
      [item("a", at(100, 100), { ...twice, allow: ["ghost-layer"] }), item("b", at(100, 100), twice)],
      [item("a", at(100, 100), twice), item("b", at(100, 100), { ...twice, allow: ["ghost-layer"] })],
      [item("a", at(100, 100), twice), item("b", at(100, 100), { ...twice, seen: false })],
      [item("a", at(100, 100), twice), item("b", at(100, 100), { ...twice, opacity: 0 })],
      [item("a", at(900, 100), twice), item("b", at(900, 100), twice)],
      [item("a", at(100, 100)), item("b", at(100, 100))],
    ];
    for (const [i, items] of pairs.entries()) expect(judgeWindow(mac(), page(items)), `pair ${i}`).toEqual([]);
  });

  it("ghost-layer counts a copy behind another that is still seen somewhere", () => {
    const findings = judgeWindow(mac(), page([item("a", at(100, 100), { same: "text:Twice" }), item("b", at(100, 100), { same: "text:Twice", top: false })]));
    expect(rulesOf(findings)).toEqual(["ghost-layer"]);
  });
});

describe("judgeSettled", () => {
  const first = page([item("still"), item("moves", at(100, 200)), item("fades", at(100, 300), { opacity: 0.4 }), item("covered", at(100, 400), { top: false }), item("faint", at(100, 450), { opacity: 0.05 })]);

  it("moved-after-first-frame, popped-in and faded: what changed between the first frame and settled", () => {
    const settled = page([
      item("still"),
      item("moves", at(100, 210)),
      item("fades", at(100, 300)),
      item("covered", at(100, 400)),
      item("faint", at(100, 450)),
      item("new", at(100, 500)),
    ]);
    const findings = judgeSettled(mac(), first, settled);
    expect(findings).toEqual([
      { rule: "moved-after-first-frame", element: 'p "moves"', detail: "from 100,200 40×20 in the first frame to 100,210 40×20 settled", box: { x: 100, y: 200, width: 40, height: 30 } },
      { rule: "faded", element: 'p "fades"', detail: "opacity 0.4 in the first frame, 1 settled", box: at(100, 300) },
      { rule: "popped-in", element: 'p "covered"', detail: "not drawn in the first frame; drawn at 100,400 40×20 once settled", box: at(100, 400) },
      { rule: "popped-in", element: 'p "faint"', detail: "not drawn in the first frame; drawn at 100,450 40×20 once settled", box: at(100, 450) },
      { rule: "popped-in", element: 'p "new"', detail: "not drawn in the first frame; drawn at 100,500 40×20 once settled", box: at(100, 500) },
    ]);
  });

  it("passes what is unchanged, within the tolerance, allowed, not drawn once settled, or past the window", () => {
    const settled = page([
      item("still", at(101, 101)),
      item("moves", at(100, 210), { allow: ["moved-after-first-frame"] }),
      item("fades", at(100, 300), { allow: ["faded"] }),
      item("covered", at(100, 400), { allow: ["popped-in"] }),
      item("gone", at(100, 500), { top: false }),
      item("clear", at(100, 520), { opacity: 0.05 }),
      item("past", at(900, 100)),
    ]);
    expect(judgeSettled(mac(), first, settled)).toEqual([]);
    expect(judgeSettled(mac(), first, page([item("still"), item("moves", at(100, 210)), item("fades", at(100, 300), { opacity: 0.4 })]), { moveTolerance: 20 })).toEqual([]);
  });

  it("puts both frames in window points with the page's zoom, or none", () => {
    const one = page([item("moves", at(100, 100))], 0);
    expect(judgeSettled(mac({ content: { x: 0, y: 52, width: 800, height: 548 } }), one, page([item("moves", at(100, 101.5))], 2))).toMatchObject([{ rule: "moved-after-first-frame", detail: "from 200,252 80×40 in the first frame to 200,255 80×40 settled" }]);
    expect(judgeSettled(mac(), one, page([item("moves", at(100, 101.5))], 0))).toEqual([]);
  });
});

describe("dragSamples", () => {
  it("samples points across a band, along its middle and 4 points inside its top and bottom", () => {
    expect(dragSamples({ x: 0, y: 0, width: 48, height: 28 })).toEqual([
      [6, 4], [18, 4], [30, 4], [42, 4],
      [6, 14], [18, 14], [30, 14], [42, 14],
      [6, 24], [18, 24], [30, 24], [42, 24],
    ]);
    expect(dragSamples({ x: 10, y: 0, width: 50, height: 30.333 }, 25)).toEqual([[22.5, 4], [47.5, 4], [22.5, 15.17], [47.5, 15.17], [22.5, 26.33], [47.5, 26.33]]);
  });
});

describe("judgeDrag", () => {
  const bar = page([
    item("back", at(100, 10, 30, 30), { kind: "control", label: 'button "Back"' }),
    item("search", at(200, 10, 30, 30), { kind: "control", label: 'button "Search"', allow: ["control-drags"] }),
    noVis(item("menu", at(300, 10, 30, 30), { kind: "control", label: 'button "Menu"' })),
    item("title", at(400, 10, 30, 30)),
    item("covered", at(500, 10, 30, 30), { kind: "control", top: false }),
    item("faint", at(560, 10, 30, 30), { kind: "control", opacity: 0.05 }),
  ]);

  it("control-drags: a press on a control that moves the window, once a control", () => {
    const findings = judgeDrag(mac(), bar, [
      { point: [110, 20], drags: true },
      { point: [120, 20], drags: true },
      { point: [310, 20], drags: true },
      { point: [210, 20], drags: true },
    ]);
    expect(findings).toEqual([
      { rule: "control-drags", element: 'button "Back"', detail: "a press at 110,20 moves the window instead of reaching the control", box: at(100, 10, 30, 30) },
      { rule: "control-drags", element: 'button "Menu"', detail: "a press at 310,20 moves the window instead of reaching the control", box: at(300, 10, 30, 30) },
    ]);
  });

  it("band-not-draggable: an empty point that doesn't move the window, once every 48 points", () => {
    const findings = judgeDrag(mac(), bar, [
      { point: [410, 20], drags: false },
      { point: [420, 20], drags: false },
      { point: [510, 20], drags: false },
      { point: [570, 20], drags: false },
      { point: [650, 20], drags: true },
    ]);
    expect(findings).toEqual([
      { rule: "band-not-draggable", element: "the title bar's empty part", detail: "a press at 410,20, on no control, doesn't move the window", box: { x: 404, y: 14, width: 12, height: 12 } },
      { rule: "band-not-draggable", element: "the title bar's empty part", detail: "a press at 510,20, on no control, doesn't move the window", box: { x: 504, y: 14, width: 12, height: 12 } },
      { rule: "band-not-draggable", element: "the title bar's empty part", detail: "a press at 570,20, on no control, doesn't move the window", box: { x: 564, y: 14, width: 12, height: 12 } },
    ]);
  });

  it("passes a band that drags where it's empty and not on a control, the window's own controls, and a full-screen window", () => {
    const fine = [
      { point: [110, 20] as [number, number], drags: false },
      { point: [650, 20] as [number, number], drags: true },
      { point: [25, 25] as [number, number], drags: false },
    ];
    expect(judgeDrag(mac(), bar, fine)).toEqual([]);
    expect(judgeDrag(mac({ fullScreen: true }), bar, [{ point: [650, 20], drags: false }])).toEqual([]);
  });

  it("puts the page's controls in window points with its zoom, or none", () => {
    const zoomed = page([item("back", at(50, 5, 15, 15), { kind: "control" })], 2);
    expect(rulesOf(judgeDrag(mac(), zoomed, [{ point: [110, 20], drags: true }]))).toEqual(["control-drags"]);
    const zoomless = page([item("back", at(100, 10, 30, 30), { kind: "control" })], 0);
    expect(rulesOf(judgeDrag(noContent(), zoomless, [{ point: [110, 20], drags: true }]))).toEqual(["control-drags"]);
  });
});
