import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { findCornerIssues } from "@/registry/ouro/check/corner-check";
import { findSquirclePaint, type PaintClip } from "@/registry/ouro/check/squircle-paint";
import { forceSquircleFallback } from "./squircle-fallback";

const state = window as unknown as { __ouroPaintCapture?: (clip: PaintClip) => Promise<string>; __ouroCheckRef?: number };
const paintTimeout = 30_000;
let host: HTMLDivElement;

beforeAll(() => {
  state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
});

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
});

afterAll(() => {
  delete state.__ouroPaintCapture;
});

function render(content: string): HTMLDivElement {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:40px;top:40px";
  host.innerHTML = content;
  document.body.append(host);
  return host;
}

it("finds mismatched nested corners in the browser", () => {
  render('<div id="outer" style="width:160px;height:120px;padding:4px;box-sizing:border-box;background:#345;border-radius:24px;corner-shape:squircle"><div id="inner" style="width:100%;height:100%;background:#789;border-radius:6px;corner-shape:squircle"></div></div>');
  expect(findCornerIssues().map((issue) => issue.element)).toContain("div#inner in div#outer");
});

it("checks a marked surface when it is inset from its parent", () => {
  for (const marker of ["data-ouro-surface", "data-ouro-avatar-surface"]) {
    const root = render(`<div id="outer" style="position:relative;width:160px;height:120px;background:#345;border-radius:24px;corner-shape:squircle"><div id="inner" ${marker} style="position:absolute;inset:4px;background:#789;border-radius:6px;corner-shape:squircle"></div></div>`);
    const inner = root.querySelector<HTMLElement>("#inner")!;
    expect(findCornerIssues().map((issue) => issue.element)).toContain("div#inner in div#outer");
    inner.style.borderRadius = "20px";
    expect(findCornerIssues()).toEqual([]);
    root.remove();
  }
});

it("compares painted corners against the actual browser pixels", async () => {
  render('<div id="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  const issues = await findSquirclePaint();
  expect(issues.map((issue) => issue.element)).toContain("div#surface");
  expect(issues.find((issue) => issue.element === "div#surface")?.detail).toContain("top left");
}, paintTimeout);

it("accepts a percent-encoded PNG capture as well as base64", async () => {
  const capture = state.__ouroPaintCapture!;
  state.__ouroPaintCapture = async (clip) => {
    const data = await capture(clip);
    const binary = atob(data.slice(data.indexOf(",") + 1));
    return `data:image/png,${[...binary].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")}`;
  };
  try {
    render('<div id="surface" style="position:relative;width:120px;height:80px;background:#fff;border-radius:20px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
  } finally {
    state.__ouroPaintCapture = capture;
  }
}, paintTimeout);

it("judges each nested corner and honors explained allowances", () => {
  const root = render('<div id="outer" style="position:relative;width:160px;height:120px;background:#345;border-radius:24px;corner-shape:squircle"><div id="inner" style="position:absolute;inset:4px;background:#789;border-radius:20px;corner-shape:squircle"></div></div>');
  const outer = root.querySelector<HTMLElement>("#outer")!;
  const inner = root.querySelector<HTMLElement>("#inner")!;
  expect(findCornerIssues()).toEqual([]);
  for (const [property, name] of [
    ["border-top-left-radius", "top left"],
    ["border-top-right-radius", "top right"],
    ["border-bottom-right-radius", "bottom right"],
    ["border-bottom-left-radius", "bottom left"],
  ]) {
    inner.style.setProperty(property!, "8px");
    expect(findCornerIssues()[0]?.detail).toContain(name);
    inner.style.removeProperty(property!);
  }
  inner.style.setProperty("corner-shape", "round");
  expect(findCornerIssues()[0]?.detail).toContain("both corners must be squircles");
  inner.setAttribute("data-ouro-allow", "corners-nest");
  expect(findCornerIssues()).toHaveLength(1);
  inner.setAttribute("data-ouro-allow-why", "a deliberate inset");
  expect(findCornerIssues()).toEqual([]);
  inner.removeAttribute("data-ouro-allow");
  outer.hidden = true;
  expect(findCornerIssues()).toEqual([]);
  outer.hidden = false;
  outer.style.opacity = "0.01";
  expect(findCornerIssues()).toEqual([]);
});

it("treats a clipped full-size fill as the outer paint and checks a native window edge", () => {
  const root = render('<div id="outer" style="position:relative;width:160px;height:120px;overflow:hidden;background:#345;border-radius:24px;corner-shape:squircle"><div id="fill" style="position:absolute;inset:0;background:#789"></div></div>');
  expect(findCornerIssues()).toEqual([]);
  root.innerHTML = '<div id="window-panel" style="position:fixed;inset:4px;background:#789;border-radius:8px;corner-shape:squircle"></div>';
  expect(findCornerIssues()).toEqual([]);
  expect(findCornerIssues({ windowRadius: 32 })[0]?.element).toContain("native window");
});

it("treats a picture clipped at the top corners as the frame's paint", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  canvas.getContext("2d")!.fillRect(0, 0, 1, 1);
  const root = render(`<div style="position:relative;width:180px;height:160px;overflow:hidden;background:#345;border-radius:24px;corner-shape:squircle"><img alt="" src="${canvas.toDataURL()}" style="position:absolute;top:0;left:0;width:180px;height:80px"></div>`);
  await root.querySelector("img")!.decode();
  expect(findCornerIssues()).toEqual([]);
});

it("judges only the corners an image actually paints", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 40;
  const pen = canvas.getContext("2d")!;
  pen.fillStyle = "#789";
  pen.fillRect(10, 10, 20, 20);
  const transparent = canvas.toDataURL();
  pen.fillRect(0, 0, 40, 40);
  const opaque = canvas.toDataURL();
  const root = render(`<div id="frame" style="position:relative;width:160px;height:120px;background:#345;border-radius:24px;corner-shape:squircle"><img id="image" alt="" src="${transparent}" style="position:absolute;inset:4px;width:152px;height:112px"></div>`);
  const image = root.querySelector<HTMLImageElement>("#image")!;
  await image.decode();
  expect(findCornerIssues()).toEqual([]);
  image.src = opaque;
  await image.decode();
  expect(findCornerIssues()[0]?.detail).toContain("top left");
  image.style.objectFit = "contain";
  expect(findCornerIssues()).toEqual([]);
  image.style.objectPosition = "left top";
  expect(findCornerIssues()[0]?.detail).toContain("top left");
  expect(findCornerIssues()[0]?.detail).not.toContain("top right");
  image.style.objectPosition = "right top";
  expect(findCornerIssues()[0]?.detail).toContain("top right");
  expect(findCornerIssues()[0]?.detail).not.toContain("top left");
  image.style.objectPosition = "calc(100% - 5px) center";
  expect(findCornerIssues()).toEqual([]);
  image.style.objectPosition = "right 5px bottom 5px";
  expect(findCornerIssues()).toEqual([]);
  image.style.objectFit = "none";
  image.style.objectPosition = "left top";
  expect(findCornerIssues()[0]?.detail).toContain("top left");
  expect(findCornerIssues()[0]?.detail).not.toContain("bottom right");
  image.style.objectFit = "scale-down";
  expect(findCornerIssues()[0]?.detail).toContain("top left");
  image.style.objectFit = "cover";
  expect(findCornerIssues()[0]?.detail).toContain("top left");
  canvas.width = 80;
  canvas.height = 40;
  canvas.getContext("2d")!.fillRect(0, 0, 80, 40);
  image.src = canvas.toDataURL();
  await image.decode();
  image.style.objectFit = "contain";
  image.style.objectPosition = "center top";
  expect(findCornerIssues()[0]?.detail).toContain("top left");
  expect(findCornerIssues()[0]?.detail).not.toContain("bottom left");
  image.style.objectPosition = "center bottom";
  expect(findCornerIssues()[0]?.detail).toContain("bottom left");
  expect(findCornerIssues()[0]?.detail).not.toContain("top left");
  image.src = opaque;
  await image.decode();
  image.style.objectFit = "cover";
  image.style.padding = "2px";
  expect(findCornerIssues()).toEqual([]);
  image.style.padding = "";
  const drawing = vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage").mockImplementation(() => { throw new Error("image decode failed"); });
  try {
    expect(() => findCornerIssues()).toThrow("image decode failed");
  } finally {
    drawing.mockRestore();
  }
  image.src = transparent;
  await image.decode();
  image.style.border = "1px solid red";
  expect(findCornerIssues()[0]?.detail).toContain("top right");
  await commands.cornerImageRoute({ data: opaque });
  try {
    image.style.border = "";
    image.style.objectFit = "fill";
    image.src = "https://images.invalid/picture.png";
    await image.decode();
    expect(findCornerIssues()[0]?.detail).toContain("cannot inspect");
    image.style.border = "1px solid red";
    expect(findCornerIssues()[0]?.detail).toContain("expected 20px");
    root.innerHTML = `<div style="position:relative;width:160px;height:120px">
      <img alt="" src="https://images.invalid/picture.png" style="position:absolute;inset:0;width:160px;height:120px;border-radius:24px;corner-shape:squircle">
      <div style="position:absolute;inset:4px;background:#789;border-radius:6px;corner-shape:squircle"></div>
    </div>`;
    await root.querySelector("img")!.decode();
    expect(findCornerIssues()[0]?.detail).toContain("cannot inspect");
  } finally {
    await commands.cornerImageRoute({ data: null });
  }
});

it("reports an image position the browser cannot resolve", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 20;
  canvas.getContext("2d")!.fillRect(0, 0, 20, 20);
  const root = render(`<div style="position:relative;width:160px;height:120px;background:#345;border-radius:24px;corner-shape:squircle"><img alt="" src="${canvas.toDataURL()}" style="position:absolute;inset:4px;width:152px;height:112px;object-fit:contain"></div>`);
  const image = root.querySelector("img")!;
  await image.decode();
  const computed = window.getComputedStyle.bind(window);
  let position = "left top";
  const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    return element === image ? new Proxy(style, {
      get(target, property) {
        if (property === "objectPosition") return position;
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) : style;
  });
  try {
    image.style.objectPosition = position;
    expect(findCornerIssues()[0]?.detail).toContain("top left");
    position = "right bottom";
    image.style.objectPosition = position;
    expect(findCornerIssues()[0]?.detail).toContain("bottom right");
    position = "center center";
    image.style.objectPosition = position;
    expect(findCornerIssues()).toEqual([]);
    position = "right 5px bottom 5px";
    image.style.objectPosition = position;
    expect(findCornerIssues()).toEqual([]);
    position = "unresolved-position";
    expect(findCornerIssues()[0]?.detail).toContain("cannot resolve the image's object-position");
  } finally {
    spy.mockRestore();
  }
});

it("does not nest against a transparent corner of an outer picture", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 40;
  canvas.getContext("2d")!.fillRect(10, 10, 20, 20);
  const root = render(`<div style="position:relative;width:160px;height:120px">
    <img alt="" src="${canvas.toDataURL()}" style="position:absolute;inset:0;width:160px;height:120px;border-radius:24px;corner-shape:squircle">
    <div style="position:absolute;inset:4px;background:#789;border-radius:6px;corner-shape:squircle"></div>
  </div>`);
  const image = root.querySelector("img")!;
  await image.decode();
  expect(findCornerIssues()).toEqual([]);
  image.style.background = "#345";
  expect(findCornerIssues().map((issue) => issue.detail)).toContainEqual(expect.stringContaining("expected 20px"));
});

it("reads elliptical, percentage, scaled and fallback radii on painted geometric siblings", () => {
  const root = render('<div id="area" style="position:relative;width:200px;height:160px;transform:scale(.8);transform-origin:top left"><div class="shell" style="position:absolute;inset:0;background:linear-gradient(red,blue);border-radius:32px / 24px;corner-shape:squircle"></div><div class="panel" style="position:absolute;inset:4px;background:rgba(255,255,255,.5);border-radius:28px / 20px;corner-shape:squircle"></div></div>');
  const panel = root.querySelector<HTMLElement>(".panel")!;
  expect(findCornerIssues()).toEqual([]);
  panel.style.borderTopLeftRadius = "20% 10%";
  expect(findCornerIssues()[0]?.detail).toContain("top left");
  panel.style.borderTopLeftRadius = "28px 20px";
  const shell = root.querySelector<HTMLElement>(".shell")!;
  for (const element of [shell, panel]) {
    element.style.setProperty("corner-shape", "round");
    element.style.borderRadius = element === shell ? "32px" : "28px";
    element.style.clipPath = "inset(0 round 2px)";
    for (const corner of ["tl", "tr", "br", "bl"]) {
      element.style.setProperty(`--sq-${corner}`, element === shell ? "32px" : "28px");
    }
  }
  expect(findCornerIssues()).toEqual([]);
});

it("recognizes visible fills and edges without treating hidden or identical surfaces as corners", () => {
  const root = render('<div style="width:160px;height:120px;position:relative;background:#345;border-radius:24px;corner-shape:squircle"><div id="inner" style="position:absolute;inset:4px;border-radius:8px;corner-shape:squircle"></div></div>');
  const inner = root.querySelector<HTMLElement>("#inner")!;
  expect(findCornerIssues()).toEqual([]);
  for (const style of [
    "background-image:linear-gradient(red,blue)",
    "background-color:rgba(255,255,255,.5)",
    "border:1px solid red",
    "outline:1px solid red",
    "box-shadow:0 0 1px red",
  ]) {
    inner.style.cssText = `position:absolute;inset:4px;border-radius:8px;corner-shape:squircle;${style}`;
    expect(findCornerIssues()).toHaveLength(1);
  }
  inner.style.cssText = "position:absolute;inset:4px;border-radius:8px;corner-shape:squircle;background:#345";
  expect(findCornerIssues()).toEqual([]);
  inner.style.background = "red";
  inner.className = "sr-only";
  expect(findCornerIssues()).toEqual([]);
});

it("handles filled ancestors, unclipped overlays, pills and very small scaled boxes", () => {
  const root = render('<div style="width:160px;height:120px;position:relative;background:linear-gradient(red,blue);border-radius:24px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#fff"></div></div>');
  expect(findCornerIssues()).toHaveLength(1);
  const outer = root.firstElementChild as HTMLElement;
  const inner = outer.firstElementChild as HTMLElement;
  outer.style.overflow = "hidden";
  inner.style.outline = "0px solid red";
  expect(findCornerIssues()).toEqual([]);
  root.innerHTML = '<div style="width:120px;height:120px;position:relative;background:#345;border-radius:50%;corner-shape:squircle"><div style="position:absolute;inset:4px;background:red"></div></div>';
  expect(findCornerIssues()).toEqual([]);
  root.innerHTML = '<div style="width:160px;height:120px;position:relative;background:#345;border-radius:80px / 20px;corner-shape:squircle"><div style="position:absolute;left:40px;top:40px;width:40px;height:40px;background:red"></div></div><div style="width:.4px;height:.4px;transform:scale(10);background:red"></div>';
  expect(findCornerIssues()).toEqual([]);
});

it("validates and resolves native window geometry at the current viewport size", () => {
  render('<div class="panel" style="position:fixed;inset:8px;background:#789;border-radius:12px;corner-shape:squircle"></div>');
  const insets = { top: 13, right: 7, bottom: 5, left: 3 };
  const bounds = { x: -insets.left, y: -insets.top, width: innerWidth + insets.left + insets.right, height: innerHeight + insets.top + insets.bottom };
  const describe = ({ element, detail }: { element: string; detail: string }) => ({ element, detail });
  expect(findCornerIssues({ windowRadius: 48, windowInsets: insets }).map(describe)).toEqual(findCornerIssues({ windowRadius: 48, windowBounds: bounds }).map(describe));
  expect(() => findCornerIssues({ windowRadius: -1 })).toThrow("windowRadius takes a non-negative number");
  expect(() => findCornerIssues({ windowInsets: insets })).toThrow("require windowRadius");
  expect(() => findCornerIssues({ windowRadius: 48, windowBounds: bounds, windowInsets: insets })).toThrow("not both");
  expect(() => findCornerIssues({ windowRadius: 48, windowBounds: { ...bounds, width: 0 } })).toThrow("positive width and height");
  expect(() => findCornerIssues({ windowRadius: 48, windowInsets: { ...insets, right: -1 } })).toThrow("non-negative top, right, bottom and left");
  expect(() => findCornerIssues({ windowRadius: 48, windowBounds: { ...bounds, width: 20 } })).toThrow("must contain the viewport");
});

it("reads the visible corner of an independently painted inverse cutout", () => {
  const root = render(`<div style="position:relative;width:160px;height:120px;background:#eef4fa;border-radius:17.376px 0 0 0;--sq-tl:32px;clip-path:inset(0 round 17.376px 0 0 0)">
    <div style="position:absolute;inset:4px;background:#789">
      <div class="cutout" style="position:absolute;inset:0;background:#eef4fa;pointer-events:none;--sq-tl:28px"></div>
    </div>
  </div>`);
  const cutout = root.querySelector<HTMLElement>(".cutout")!;
  const box = "M 0 0 H 152 V 112 H 0 Z";
  const squircle = "M 0 28 C 0 17.164 -.2576 9.1672 4.4548 4.4548 C 9.1672 -.2576 17.164 0 28 0 H 152 V 112 H 0 Z";
  cutout.style.clipPath = `path(evenodd, "${box} ${squircle}")`;
  expect(findCornerIssues()).toEqual([]);
  cutout.style.clipPath = `path(evenodd, "${box} M 0 28 A 28 28 0 0 1 28 0 H 152 V 112 H 0 Z")`;
  expect(findCornerIssues().map((issue) => issue.detail)).toContainEqual(expect.stringContaining("cutout does not match"));
});

it("reads an inverse cutout at each physical corner", () => {
  for (const [key, side, left, top] of [
    ["tl", "top-left", true, true], ["tr", "top-right", false, true],
    ["br", "bottom-right", false, false], ["bl", "bottom-left", true, false],
  ] as const) {
    const root = render(`<div style="position:relative;width:160px;height:120px;background:#eef4fa;border-${side}-radius:17.376px;--sq-${key}:32px;clip-path:inset(0)">
      <div style="position:absolute;inset:4px;background:#789">
        <div class="cutout" style="position:absolute;inset:0;background:#eef4fa;--sq-${key}:28px"></div>
      </div>
    </div>`);
    const x = (n: number) => left ? n : 152 - n;
    const y = (n: number) => top ? n : 112 - n;
    root.querySelector<HTMLElement>(".cutout")!.style.clipPath = `path("M ${x(0)} ${y(0)} L ${x(0)} ${y(28)} C ${x(0)} ${y(17.164)} ${x(-0.2576)} ${y(9.1672)} ${x(4.4548)} ${y(4.4548)} C ${x(9.1672)} ${y(-0.2576)} ${x(17.164)} ${y(0)} ${x(28)} ${y(0)} Z")`;
    expect(findCornerIssues(), side).toEqual([]);
    root.remove();
  }
});

it("leaves an inverse cutout's inline styles alone and does not treat covered paint as its opening", () => {
  const root = render(`<style>
    .cut-outer { position:relative; width:160px; height:120px; background:#eef4fa; border-top-left-radius:17.376px; --sq-tl:32px; clip-path:inset(0); }
    .cut-inner { position:absolute; inset:4px; background:#789; }
    .cut-layer { position:absolute; inset:0; background:#eef4fa; --sq-tl:28px; clip-path:path(evenodd, "M 0 0 H 152 V 112 H 0 Z M 0 28 C 0 17.164 -.2576 9.1672 4.4548 4.4548 C 9.1672 -.2576 17.164 0 28 0 H 152 V 112 H 0 Z"); }
    .cut-cover { display:none; position:absolute; left:12px; top:12px; width:5px; height:5px; background:#c65; }
    .cut-cover.shown { display:block; }
  </style><div class="cut-outer"><div class="cut-inner"><div class="cut-layer"></div><div class="cut-cover"></div></div></div>`);
  const inner = root.querySelector(".cut-inner")!;
  const layer = root.querySelector(".cut-layer")!;
  expect(findCornerIssues()).toEqual([]);
  expect(inner.hasAttribute("style")).toBe(false);
  expect(layer.hasAttribute("style")).toBe(false);
  root.querySelector(".cut-cover")!.classList.add("shown");
  expect(findCornerIssues().map((issue) => issue.element)).toContain("div.cut-inner in div.cut-outer");
  expect(inner.hasAttribute("style")).toBe(false);
  expect(layer.hasAttribute("style")).toBe(false);
});

it("does not mistake a switch's round thumb inside a capsule for nested frames", () => {
  render('<div style="position:relative;width:36px;height:20px;background:#345;border-radius:9999px"><div style="position:absolute;left:2px;top:2px;width:16px;height:16px;background:white;border-radius:50%"></div></div><div style="position:relative;width:20px;height:36px;background:#345;border-radius:9999px"><div style="position:absolute;left:2px;top:2px;width:16px;height:16px;background:white;border-radius:50%"></div></div>');
  expect(findCornerIssues()).toEqual([]);
});

it("does not mistake a fractional edge's antialiasing for paint outside a fallback corner", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div class="rounded-ouro-xl" style="position:relative;width:145.890625px;height:44px;background:#2685c0"></div>');
    const surface = root.firstElementChild!;
    expect(getComputedStyle(surface).clipPath).not.toBe("none");
    expect(await findSquirclePaint()).toEqual([]);
    surface.innerHTML = '<div style="position:absolute;right:-2px;top:4px;width:4px;height:5px;background:red"></div>';
    expect(await findSquirclePaint()).toHaveLength(1);
  } finally {
    restore();
  }
}, paintTimeout);

it("passes clipped paint, explained allowances, and a surface hidden by another layer", async () => {
  const root = render('<div id="surface" style="position:relative;width:160px;height:120px;overflow:hidden;background:#fff;border-radius:28px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  const surface = root.querySelector<HTMLElement>("#surface")!;
  expect(await findSquirclePaint()).toEqual([]);
  surface.style.overflow = "visible";
  surface.setAttribute("data-ouro-allow", "squircle-paint");
  surface.setAttribute("data-ouro-allow-why", "a deliberate layer");
  expect(await findSquirclePaint()).toEqual([]);
  surface.removeAttribute("data-ouro-allow");
  root.insertAdjacentHTML("beforeend", '<div style="position:absolute;inset:0;background:#eee"></div>');
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("distinguishes a transparent hit area from its full-size painted surface", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div id="hit" class="rounded-ouro-xl" style="position:relative;width:160px;height:120px"><div class="badge" style="position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:#b44939"><span style="position:absolute;inset:3px;background:white"></span></div></div>');
    expect(await findSquirclePaint()).toEqual([]);
    const badge = root.querySelector<HTMLElement>(".badge")!;
    badge.insertAdjacentHTML("beforeend", '<span style="position:absolute;left:-4px;top:-4px;width:6px;height:6px;background:#b44939"></span>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#hit.rounded-ouro-xl");
    badge.lastElementChild!.remove();
    root.querySelector("#hit")!.insertAdjacentHTML("beforeend", '<div style="position:absolute;right:-4px;top:-4px;width:10px;height:10px;background:#b44939"></div>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#hit.rounded-ouro-xl");
    const hit = root.querySelector<HTMLElement>("#hit")!;
    hit.innerHTML = '<div style="position:absolute;inset:0;background:#b44939"></div>';
    hit.style.clipPath = "none";
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#hit.rounded-ouro-xl");
  } finally {
    restore();
  }
}, paintTimeout);

it("does not treat a painted border, outline, or pseudo-element as an empty hit area", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render(`<style>.painted-hit::before { content:""; position:absolute; inset:0; background:#ddd; }</style>
      <div id="hit" class="rounded-ouro-xl" style="position:relative;width:160px;height:120px">
        <div style="position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:#b44939"></div>
      </div>`);
    const hit = root.querySelector<HTMLElement>("#hit")!;
    const found = async () => (await findSquirclePaint()).some((issue) => issue.element.startsWith("div#hit.rounded-ouro-xl"));
    hit.style.border = "2px solid transparent";
    expect(await found()).toBe(false);
    hit.style.borderColor = "#345";
    expect(await found()).toBe(true);
    hit.style.border = "";
    hit.style.outline = "2px solid #345";
    expect(await found()).toBe(true);
    hit.style.outline = "";
    hit.classList.add("painted-hit");
    expect(await found()).toBe(true);
  } finally {
    restore();
  }
}, paintTimeout);

it("keeps absent inline styles absent when an opaque sibling hides the surface", async () => {
  const root = render(`<style>
    .cover-stage { position:relative; width:160px; height:120px; }
    .covered-surface, .opaque-cover { position:absolute; inset:0; }
    .covered-surface { background:white; border-radius:28px; corner-shape:squircle; }
    .opaque-cover { background:#eee; pointer-events:none; }
  </style><div class="cover-stage"><div class="covered-surface"><div style="position:absolute;inset:0;background:#f40"></div></div><div class="opaque-cover"></div></div>`);
  const surface = root.querySelector(".covered-surface")!;
  const cover = root.querySelector(".opaque-cover")!;
  expect(await findSquirclePaint()).toEqual([]);
  expect(surface.getAttribute("style")).toBeNull();
  expect(cover.getAttribute("style")).toBeNull();
}, paintTimeout);

it("ignores unrelated sibling geometry and passes a clipped single corner", async () => {
  render(`<div style="position:relative;width:160px;height:120px">
    <svg width="10" height="10"></svg>
    <div style="position:absolute;inset:0;overflow:hidden;background:white;border-radius:28px 0 0 0;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>
    <div hidden></div>
    <div style="position:absolute;width:0;height:10px"></div>
    <div style="position:absolute;width:10px;height:0"></div>
    <div style="position:absolute;width:20px;height:20px;transform:translateX(1px)"></div>
    <div style="position:absolute;width:20.3px;height:20px"></div>
    <div style="position:absolute;width:20px;height:20.3px"></div>
    <div style="position:absolute;width:300px;height:200px"></div>
    <div style="position:absolute;left:80px;top:50px;width:20px;height:20px"></div>
  </div>`);
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("skips invisible layers and an all-rule allowance, and names a class-only surface", async () => {
  const root = render('<div class="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:20%;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  surface.setAttribute("data-ouro-allow", "all");
  expect(await findSquirclePaint()).toHaveLength(1);
  surface.setAttribute("data-ouro-allow-why", "a deliberate layer");
  expect(await findSquirclePaint()).toEqual([]);
  surface.removeAttribute("data-ouro-allow");
  surface.style.visibility = "hidden";
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("detects a low-contrast square and a descendant outline beyond the surface", async () => {
  const root = render('<div class="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"><div class="layer" style="position:absolute;inset:0;background:#fdfdfd"></div></div>');
  root.style.background = "#fff";
  expect(await findSquirclePaint()).toHaveLength(1);
  const layer = root.querySelector<HTMLElement>(".layer")!;
  layer.style.background = "transparent";
  layer.style.outline = "6px solid #222";
  expect(await findSquirclePaint()).toHaveLength(1);
}, paintTimeout);

it("detects alpha-only paint against a transparent background", async () => {
  render('<div style="width:160px;height:120px;border-radius:28px;corner-shape:squircle"></div>');
  const image = (painted: boolean, clip: PaintClip) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width;
    canvas.height = clip.height;
    if (painted) canvas.getContext("2d")!.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  const captures = [true, false, false];
  state.__ouroPaintCapture = async (clip) => image(captures.shift()!, clip);
  try {
    expect(await findSquirclePaint()).toHaveLength(1);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("samples a leaking layer at each of the four corners", async () => {
  const root = render('<div class="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"><div class="layer" style="position:absolute;width:16px;height:16px;background:#f40"></div></div>');
  const layer = root.querySelector<HTMLElement>(".layer")!;
  for (const [horizontal, vertical] of [["left", "top"], ["right", "top"], ["right", "bottom"], ["left", "bottom"]]) {
    layer.style.cssText = `position:absolute;width:16px;height:16px;background:#f40;${horizontal}:0;${vertical}:0`;
    expect(await findSquirclePaint(), `${vertical} ${horizontal}`).toHaveLength(1);
  }
}, paintTimeout);

it("ignores hidden and distant round decorations while finding a one-corner leak", async () => {
  render(`<div id="surface" style="position:relative;width:160px;height:120px;background:white;border-top-left-radius:15px;--sq-tl:28px">
    <div style="position:absolute;left:0;top:0;width:10px;height:10px;border-radius:50%;background:#c65;visibility:hidden"></div>
    <div style="position:absolute;right:0;bottom:0;width:10px;height:10px;border-radius:50%;background:#c65"></div>
    <svg style="position:absolute;right:0;bottom:0;width:10px;height:10px"></svg>
    <div style="position:absolute;left:-4px;top:-4px;width:8px;height:8px;background:#b44939"></div>
  </div>`);
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
}, paintTimeout);

it("detects a protruding sibling without reporting an inset one", async () => {
  const root = render('<div style="position:relative;width:160px;height:120px"><div class="surface" style="position:absolute;inset:0;background:#fff;border-radius:28px;corner-shape:squircle"></div><div class="control" style="position:absolute;top:24px;right:24px;width:24px;height:24px;background:#f40"></div></div>');
  const control = root.querySelector<HTMLElement>(".control")!;
  expect(await findSquirclePaint()).toEqual([]);
  control.style.top = "-6px";
  control.style.right = "-6px";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
}, paintTimeout);

it("keeps a round badge in a cut-out distinct from leaking square paint", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render(`<style>
      .cut-frame, .cut-surface { width:80px; height:80px; }
      .cut-frame { position:relative; }
      .cut-surface { position:absolute; inset:0; background:#dce5ef; --sq-notch:move to calc(100% + 8px) calc(100% - 5px), arc to calc(100% - 18px) calc(100% - 5px) of 13px, arc to calc(100% + 8px) calc(100% - 5px) of 13px, close; }
      .cut-badge { position:absolute; right:-5px; bottom:-5px; width:20px; height:20px; border-radius:50%; corner-shape:round; background:#149b55; }
      .cut-leak { position:absolute; left:-6px; top:-6px; width:8px; height:8px; background:#b44939; }
    </style><div class="cut-frame rounded-[44%]"><div class="cut-surface rounded-[44%]"></div><div class="cut-badge"></div></div>`);
    const frame = root.querySelector<HTMLElement>(".cut-frame")!;
    const surface = root.querySelector<HTMLElement>(".cut-surface")!;
    const badge = root.querySelector<HTMLElement>(".cut-badge")!;
    expect(await findSquirclePaint()).toEqual([]);
    expect(surface.hasAttribute("style")).toBe(false);
    expect(badge.hasAttribute("style")).toBe(false);
    surface.setAttribute("style", "pointer-events : none !important; ");
    const surfaceStyle = surface.getAttribute("style");
    expect(await findSquirclePaint()).toEqual([]);
    expect(surface.getAttribute("style")).toBe(surfaceStyle);
    for (const element of [frame, surface]) {
      element.style.setProperty("--sq-tl", "0px");
      element.style.borderTopLeftRadius = "0";
    }
    expect(await findSquirclePaint()).toEqual([]);
    frame.insertAdjacentHTML("beforeend", '<div class="cut-leak"></div>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.cut-frame.rounded-[44%]");
    frame.lastElementChild!.remove();
    surface.style.setProperty("--sq-notch", "move to 0 0, close");
    expect(await findSquirclePaint()).not.toEqual([]);
  } finally {
    restore();
  }
}, paintTimeout);

it("keeps a native shadow and its probe separate from a descendant's external paint", async () => {
  const root = render('<div style="position:relative;width:160px;height:120px"><div style="position:absolute;inset:0"></div><div class="surface" data-ouro-paint-solo="original" style="position:absolute;inset:0;background:#fff;border-radius:28px;corner-shape:squircle;box-shadow:0 4px 12px #0008"></div></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  expect(await findSquirclePaint()).toEqual([]);
  expect(surface.getAttribute("data-ouro-paint-solo")).toBe("original");
  surface.innerHTML = '<div style="position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#f40"></div>';
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  expect(surface.getAttribute("data-ouro-paint-solo")).toBe("original");
}, paintTimeout);

it("keeps a fallback popup's curved shadow separate from its content", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render(`<button style="position:absolute;left:0;top:0;width:100px;height:44px;background:#eaf2fa">Open</button>
      <div class="surface rounded-ouro-lg" style="position:absolute;left:0;top:52px;width:288px;height:156px;background:white;box-shadow:0 0 0 1px #9999,0 10px 15px -3px #0002,0 4px 6px -4px #0002">
        <div style="padding:16px"><strong>Notes</strong><p>A short description.</p><input value="Example"></div>
      </div>`);
    const surface = root.querySelector<HTMLElement>(".surface")!;
    expect(await findSquirclePaint()).toEqual([]);
    surface.insertAdjacentHTML("beforeend", '<div style="position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#f40"></div>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-lg");
  } finally {
    restore();
  }
}, paintTimeout);

function outlinedSurface() {
  const root = render(`<div style="position:relative;width:160px;height:120px">
    <div class="surface rounded-ouro-xl" style="position:absolute;inset:0;background:white"></div>
    <svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
      <path fill="none" stroke="#b44939" stroke-width="6"></path>
    </svg>
  </div>`);
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const path = root.querySelector("path")!;
  const radius = parseFloat(getComputedStyle(surface).getPropertyValue("--sq-tl"));
  path.setAttribute("d", `M 0 ${radius} C 0 ${.613 * radius} ${-.0092 * radius} ${.3274 * radius} ${.1591 * radius} ${.1591 * radius} C ${.3274 * radius} ${-.0092 * radius} ${.613 * radius} 0 ${radius} 0`);
  return { surface, path, radius };
}

it("distinguishes a curved independent SVG stroke from a square one", async () => {
  const restore = forceSquircleFallback();
  try {
    const { path, radius } = outlinedSurface();
    path.setAttribute("style", "vector-effect: non-scaling-stroke ;");
    const original = path.getAttribute("style");
    expect(await findSquirclePaint()).toEqual([]);
    expect(path.getAttribute("style")).toBe(original);
    path.setAttribute("d", `M 0 ${radius} V 0 H ${radius}`);
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-xl");
    expect(path.getAttribute("style")).toBe(original);
  } finally {
    restore();
  }
}, paintTimeout);

it("does not excuse a filled SVG shape beside a curved independent stroke", async () => {
  const restore = forceSquircleFallback();
  try {
    const { path } = outlinedSurface();
    path.parentElement!.insertAdjacentHTML("beforeend", '<rect x="-8" y="-8" width="8" height="8" fill="#b44939"></rect><rect fill="none" stroke="none" width="1" height="1"></rect>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-xl");
  } finally {
    restore();
  }
}, paintTimeout);

it("finds separate paint beside a curved independent SVG stroke", async () => {
  const restore = forceSquircleFallback();
  try {
    const { surface } = outlinedSurface();
    surface.insertAdjacentHTML("beforeend", '<div style="position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#b44939"></div>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-xl");
  } finally {
    restore();
  }
}, paintTimeout);

it("finds an SVG fill that escapes its rounded parent", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div id="surface" class="rounded-ouro-xl" style="position:relative;width:160px;height:120px;background:white;clip-path:none"><svg style="position:absolute;inset:0;width:100%;height:100%"><rect width="100%" height="100%" fill="#b44939"></rect></svg></div>');
    const surface = root.querySelector<HTMLElement>("#surface")!;
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface.rounded-ouro-xl");
    surface.style.removeProperty("clip-path");
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    restore();
  }
}, paintTimeout);

it("finds paint on a forced fallback and skips invisible or offscreen surfaces", async () => {
  const root = render('<div id="surface" style="position:relative;width:160px;height:120px;border-radius:15px;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px;background:#fff"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
  root.innerHTML = '<div hidden style="width:160px;height:120px;border-radius:28px;corner-shape:squircle"></div><div style="width:1px;height:1px;border-radius:28px;corner-shape:squircle"></div><div style="position:fixed;left:-600px;top:-600px;width:160px;height:120px;border-radius:28px;corner-shape:squircle"></div>';
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("keeps a clipped fallback outline but finds a protruding sibling beside it", async () => {
  const clip = `path(evenodd, "M -1000 -1000 H 1000 V 1000 H -1000 Z M 0 0 H 160 V 120 H 0 Z M 0 28 A 28 28 0 0 1 28 0 H 132 A 28 28 0 0 1 160 28 V 92 A 28 28 0 0 1 132 120 H 28 A 28 28 0 0 1 0 92 Z")`;
  const root = render(`<div style="position:relative;width:160px;height:120px"><div class="surface" style='position:absolute;inset:0;border-radius:15px;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px;background:#fff;outline:6px solid #c65;clip-path:${clip}'></div><div class="control" style="display:none;position:absolute;left:-8px;top:-8px;width:16px;height:16px;background:#0a5"></div></div>`);
  expect(await findSquirclePaint()).toEqual([]);
  root.querySelector<HTMLElement>(".control")!.style.display = "block";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
}, paintTimeout);

it("activates the compiled fallback in both browser engines", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div class="surface rounded-ouro-xl" style="width:160px;height:120px;background:#fff"></div>');
    const style = getComputedStyle(root.firstElementChild!);
    expect(parseFloat(style.getPropertyValue("--sq-tl"))).toBeGreaterThan(0);
    expect(style.clipPath).not.toBe("none");
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    restore();
  }
}, paintTimeout);

it("keeps overlapping fallback surfaces separate while checking each one's paint", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div style="display:flex"><div class="surface rounded-ouro-xl" style="position:relative;width:48px;height:48px;background:#579"></div><div class="surface rounded-ouro-xl" style="position:relative;width:48px;height:48px;margin-left:-8px;background:#c65"></div></div>');
    expect(await findSquirclePaint()).toEqual([]);
    const second = root.querySelectorAll<HTMLElement>(".surface")[1]!;
    second.style.clipPath = "none";
    second.innerHTML = '<div style="position:absolute;inset:0;background:#0a5"></div>';
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-xl");
  } finally {
    restore();
  }
}, paintTimeout);

it("finds a fallback surface's own square outline and shadow without changing its inline style", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div class="surface rounded-ouro-xl" style="width:160px;height:120px"></div>');
    const surface = root.querySelector<HTMLElement>(".surface")!;
    for (const effect of ["outline:6px solid #c65", "box-shadow:0 0 0 6px #c65"]) {
      surface.style.cssText = `width:160px;height:120px;border-radius:0;clip-path:none;${effect}`;
      const original = surface.getAttribute("style");
      expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-xl");
      expect(surface.getAttribute("style")).toBe(original);
    }
  } finally {
    restore();
  }
}, paintTimeout);

it("checks a single squircle corner, accepts raw PNG data, and restores existing effects", async () => {
  const root = render('<div class="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px 0 0 0;corner-shape:squircle;opacity:.9;outline:2px solid red;box-shadow:0 2px 3px #000;transition:opacity 1s;clip-path:inset(0)"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const original = surface.getAttribute("style");
  state.__ouroPaintCapture = async (clip) => (await commands.squircleCapture(clip)).replace(/^data:image\/png;base64,/, "");
  try {
    expect(await findSquirclePaint()).toHaveLength(1);
    expect(surface.getAttribute("style")).toBe(original);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
}, paintTimeout);

it("checks surfaces larger than the viewport and leaves no temporary style attribute", async () => {
  const root = render(`<style>.surface { width:${innerWidth + 100}px; height:${innerHeight + 100}px; background:#fff; border-radius:28px; corner-shape:squircle; }</style><div class="surface"></div>`);
  const surface = root.querySelector(".surface")!;
  expect(await findSquirclePaint()).toEqual([]);
  expect(surface.hasAttribute("style")).toBe(false);
}, paintTimeout);

it("preserves an inline style removed while the painted layer is captured", async () => {
  const restore = forceSquircleFallback();
  const root = render('<style>.surface { width:160px; height:120px; background:#fff; box-shadow:0 2px 6px #0004; }</style><div class="surface rounded-ouro-xl"></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const capture = state.__ouroPaintCapture!;
  let removed = false;
  state.__ouroPaintCapture = async (clip) => {
    const image = await capture(clip);
    surface.removeAttribute("style");
    removed = true;
    state.__ouroPaintCapture = capture;
    return image;
  };
  try {
    expect(await findSquirclePaint()).toEqual([]);
    expect(removed).toBe(true);
    expect(surface.hasAttribute("style")).toBe(false);
  } finally {
    state.__ouroPaintCapture = capture;
    restore();
  }
}, paintTimeout);

it("checks a clipped squircle partly outside the viewport", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div class="surface rounded-ouro-xl" style="width:160px;height:120px;background:#fff"></div>');
    root.style.left = "-8px";
    root.style.top = "-8px";
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    restore();
  }
}, paintTimeout);

it("captures paint at the bottom edge of the test viewport", async () => {
  const root = render('<div id="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  root.style.top = "auto";
  root.style.bottom = "0";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
}, paintTimeout);

it("restores the surface when its screenshot capture fails", async () => {
  const root = render('<div id="surface" style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"></div>');
  const surface = root.querySelector<HTMLElement>("#surface")!;
  const original = surface.getAttribute("style");
  state.__ouroPaintCapture = async () => { throw new Error("capture failed"); };
  try {
    await expect(findSquirclePaint()).rejects.toThrow("capture failed");
    expect(surface.getAttribute("style")).toBe(original);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("reports a missing capture and a screenshot whose size changed", async () => {
  delete state.__ouroPaintCapture;
  await expect(findSquirclePaint()).rejects.toThrow("needs a screenshot capture");
  render('<div style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"></div>');
  const image = (clip: PaintClip, offset: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width + offset;
    canvas.height = clip.height;
    return canvas.toDataURL("image/png");
  };
  const captures = [0, 0, -1];
  state.__ouroPaintCapture = async (clip) => image(clip, captures.shift()!);
  try {
    await expect(findSquirclePaint()).rejects.toThrow("screenshots changed size");
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("rejects a capture that does not cover the requested clip at CSS or device scale", async () => {
  render('<div style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"></div>');
  const image = (clip: PaintClip, width: number, height: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width * width;
    canvas.height = clip.height * height;
    return canvas.toDataURL("image/png");
  };
  const ratio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  try {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    state.__ouroPaintCapture = async (clip) => image(clip, 2, 2);
    expect(await findSquirclePaint()).toEqual([]);
    state.__ouroPaintCapture = async (clip) => image(clip, 2, 1);
    await expect(findSquirclePaint()).rejects.toThrow("squircle-paint capture must cover the requested clip");
  } finally {
    if (ratio) Object.defineProperty(window, "devicePixelRatio", ratio);
    else Reflect.deleteProperty(window, "devicePixelRatio");
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("restores the native-shadow probe when its capture fails or changes size", async () => {
  const root = render('<div style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;box-shadow:0 4px 12px #0008"></div>');
  const surface = root.firstElementChild as HTMLElement;
  const original = surface.getAttribute("style");
  const image = (clip: PaintClip, offset: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width + offset;
    canvas.height = clip.height;
    return canvas.toDataURL("image/png");
  };
  try {
    let captures = [0, 0, 0, -1];
    state.__ouroPaintCapture = async (clip) => image(clip, captures.shift()!);
    await expect(findSquirclePaint()).rejects.toThrow("screenshots changed size");
    expect(surface.getAttribute("style")).toBe(original);
    expect(surface.hasAttribute("data-ouro-paint-solo")).toBe(false);
    captures = [0, 0, 0];
    state.__ouroPaintCapture = async (clip) => {
      if (captures.length === 0) throw new Error("probe failed");
      return image(clip, captures.shift()!);
    };
    await expect(findSquirclePaint()).rejects.toThrow("probe failed");
    expect(surface.getAttribute("style")).toBe(original);
    expect(surface.hasAttribute("data-ouro-paint-solo")).toBe(false);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("does not attribute changing background pixels outside the box to a surface", async () => {
  render('<div style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"></div>');
  const image = (color: string, clip: PaintClip) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width;
    canvas.height = clip.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  const captures = ["red", "blue", "green"];
  state.__ouroPaintCapture = async (clip) => image(captures.shift()!, clip);
  try {
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("does not attribute a shadow probe's background difference to the surface", async () => {
  render('<div style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px;box-shadow:0 4px 12px #0008"></div>');
  const image = (clip: PaintClip, outside: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width;
    canvas.height = clip.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = outside;
    context.fillRect(2, 2, 8, 8);
    return canvas.toDataURL("image/png");
  };
  const captures = ["red", "blue", "red", "red"];
  state.__ouroPaintCapture = async (clip) => image(clip, captures.shift()!);
  try {
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});
