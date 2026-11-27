import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
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

it("compares painted corners against the actual browser pixels", async () => {
  render('<div id="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
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
  const image = (painted: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    if (painted) canvas.getContext("2d")!.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  const captures = [image(true), image(false), image(false)];
  state.__ouroPaintCapture = async () => captures.shift()!;
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

it("detects a protruding sibling without reporting an inset one", async () => {
  const root = render('<div style="position:relative;width:160px;height:120px"><div class="surface" style="position:absolute;inset:0;background:#fff;border-radius:28px;corner-shape:squircle"></div><div class="control" style="position:absolute;top:24px;right:24px;width:24px;height:24px;background:#f40"></div></div>');
  const control = root.querySelector<HTMLElement>(".control")!;
  expect(await findSquirclePaint()).toEqual([]);
  control.style.top = "-6px";
  control.style.right = "-6px";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
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
  const image = (size: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return canvas.toDataURL("image/png");
  };
  const captures = [image(2), image(2), image(1)];
  state.__ouroPaintCapture = async () => captures.shift()!;
  try {
    await expect(findSquirclePaint()).rejects.toThrow("screenshots changed size");
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("restores the native-shadow probe when its capture fails or changes size", async () => {
  const root = render('<div style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;box-shadow:0 4px 12px #0008"></div>');
  const surface = root.firstElementChild as HTMLElement;
  const original = surface.getAttribute("style");
  const image = (size: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return canvas.toDataURL("image/png");
  };
  try {
    let captures = [image(2), image(2), image(2), image(1)];
    state.__ouroPaintCapture = async () => captures.shift()!;
    await expect(findSquirclePaint()).rejects.toThrow("screenshots changed size");
    expect(surface.getAttribute("style")).toBe(original);
    expect(surface.hasAttribute("data-ouro-paint-solo")).toBe(false);
    captures = [image(2), image(2), image(2)];
    state.__ouroPaintCapture = async () => {
      if (captures.length === 0) throw new Error("probe failed");
      return captures.shift()!;
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
  const image = (color: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  const captures = [image("red"), image("blue"), image("green")];
  state.__ouroPaintCapture = async () => captures.shift()!;
  try {
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});
