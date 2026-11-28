import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { findCornerIssues } from "@/registry/ouro/check/corner-check";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { findSquirclePaint, type PaintClip } from "@/registry/ouro/check/squircle-paint";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
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

it("replaces the legacy corner finding without removing other frame checks", () => {
  render('<div id="outer" style="width:160px;height:120px;padding:4px;box-sizing:border-box;background:#345;border-radius:24px;corner-shape:squircle"><div id="inner" style="width:100%;height:100%;box-sizing:border-box;border:1px solid #789;border-radius:6px;corner-shape:squircle"></div></div><div style="border:1px solid #888;padding:4px"><div id="frame" style="border:1px solid #888;height:40px"></div></div>');
  const legacy = findDesignIssues().filter((issue) => issue.rule === "nested-frame");
  const current = findDesignIssues({ legacyCorners: false }).filter((issue) => issue.rule === "nested-frame");
  expect(legacy.map((issue) => issue.element)).toContain("div#inner in div#outer");
  expect(current.map((issue) => issue.element)).not.toContain("div#inner in div#outer");
  expect(current.map((issue) => issue.element)).toContain("div#frame in div");
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

it("distinguishes a clipped table row fill from an exposed painted corner", () => {
  const root = render('<div style="width:160px;height:120px;background:#eef4fa;border-radius:24px;corner-shape:squircle;overflow:hidden"><table style="border-collapse:collapse;width:100%"><tbody><tr style="border-bottom:1px solid #789"><td style="height:28px">Example</td></tr></tbody></table></div>');
  const row = root.querySelector<HTMLElement>("tr")!;
  const outer = root.querySelector<HTMLElement>("div")!;
  expect(findCornerIssues().map((issue) => issue.element)).not.toContain("tr in div");
  row.style.background = "#789";
  expect(findCornerIssues().map((issue) => issue.element)).not.toContain("tr in div");
  outer.style.overflow = "visible";
  expect(findCornerIssues().map((issue) => issue.element)).toContain("tr in div");
});

it("judges a one-sided border only at its adjacent corners", () => {
  const root = render('<div id="outer" style="position:relative;width:160px;height:120px;background:#eef4fa;border-radius:24px;corner-shape:squircle"><div id="inner" style="position:absolute;inset:4px;border-radius:8px;corner-shape:squircle"></div></div>');
  const inner = root.querySelector<HTMLElement>("#inner")!;
  for (const [side, expected] of [
    ["top", ["top left", "top right"]],
    ["right", ["top right", "bottom right"]],
    ["bottom", ["bottom right", "bottom left"]],
    ["left", ["bottom left", "top left"]],
  ] as const) {
    inner.style.setProperty(`border-${side}`, "1px solid #789");
    const detail = findCornerIssues().find((issue) => issue.element === "div#inner in div#outer")?.detail ?? "";
    const expectedCorners: readonly string[] = expected;
    for (const corner of ["top left", "top right", "bottom right", "bottom left"]) {
      expect(detail.includes(corner)).toBe(expectedCorners.includes(corner));
    }
    inner.style.removeProperty(`border-${side}`);
  }
});

it("compares painted corners against the actual browser pixels", async () => {
  render('<div id="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  const issues = await findSquirclePaint();
  expect(issues.map((issue) => issue.element)).toContain("div#surface");
  expect(issues.find((issue) => issue.element === "div#surface")?.detail).toContain("top left");
}, paintTimeout);

it("keeps explicitly declared fallback corners equal to a parent's tokens", async () => {
  const root = render('<div id="parent" style="--sq-tl: 28px !important; color: red"><div id="surface" style="position:relative;width:160px;height:120px;background:white;border-radius:15.204px;--sq-tl:28px"><div style="position:absolute;inset:0;background:#f40"></div></div></div>');
  const parent = root.querySelector("#parent")!;
  const original = parent.getAttribute("style");
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
  expect(parent.getAttribute("style")).toBe(original);
}, paintTimeout);

it("distinguishes inherited from declared nested corner tokens without changing the parent", () => {
  const root = render(`<style>
    @property --sq-tl { syntax:"<length-percentage>"; inherits:true; initial-value:0px; }
    @property --sq-tr { syntax:"<length-percentage>"; inherits:true; initial-value:0px; }
    @property --sq-br { syntax:"<length-percentage>"; inherits:true; initial-value:0px; }
    @property --sq-bl { syntax:"<length-percentage>"; inherits:true; initial-value:0px; }
    .outer { position:relative; width:200px; height:160px; background:#ddd;
      border-radius:17.376px; clip-path:inset(0); --sq-tl:32px; --sq-tr:32px; --sq-br:32px; --sq-bl:32px; }
    .wrapper { position:absolute; left:8px; top:8px; width:100px; height:100px;
      --sq-tl:24px; --sq-tr:24px; --sq-br:24px; --sq-bl:24px; }
    .inner { position:absolute; inset:0; background:#579; clip-path:inset(0); }
  </style><div class="outer"><div class="wrapper"><div class="inner"></div></div></div>`);
  const wrapper = root.querySelector<HTMLElement>(".wrapper")!;
  const inner = root.querySelector<HTMLElement>(".inner")!;
  expect(findCornerIssues()[0]?.detail).toContain("0px, expected 24px");
  expect(wrapper.hasAttribute("style")).toBe(false);
  wrapper.setAttribute("style", "color: red;");
  expect(findCornerIssues()[0]?.detail).toContain("0px, expected 24px");
  expect(wrapper.getAttribute("style")).toBe("color: red;");
  wrapper.setAttribute("style", "color : red ; --sq-tl:24px !important;");
  const original = wrapper.getAttribute("style");
  expect(findCornerIssues()[0]?.detail).toContain("0px, expected 24px");
  expect(wrapper.getAttribute("style")).toBe(original);
  inner.style.borderRadius = "13.032px";
  for (const corner of ["tl", "tr", "br", "bl"]) inner.style.setProperty(`--sq-${corner}`, "24px");
  expect(findCornerIssues()).toEqual([]);
  expect(wrapper.getAttribute("style")).toBe(original);
});

it("ignores an inherited paint token on a square descendant", async () => {
  const root = render(`<style>
    @property --sq-tl { syntax:"<length-percentage>"; inherits:true; initial-value:0px; }
    .parent { position:relative; width:160px; height:120px; --sq-tl:28px; }
    .child { position:absolute; inset:0; background:#c65; }
  </style><div class="parent"><div class="child"></div></div>`);
  const parent = root.querySelector(".parent")!;
  expect((await findSquirclePaint()).map((issue) => issue.element)).toEqual(["div.parent"]);
  expect(parent.hasAttribute("style")).toBe(false);
}, paintTimeout);

it("keeps a neighbor in the gap between wrapped inline fragments", async () => {
  const root = render(`<style>
    .line { position:relative; width:350px; font:16px/21px sans-serif; }
    .neighbor { position:absolute; left:0; top:0; width:30px; height:18px; background:#b44939; }
    .prefix { display:inline-block; width:39px; }
    code { font:14px/20px monospace; background:#f5f5f7; border-radius:16px; corner-shape:squircle;
      --sq-tl:16px; --sq-tr:16px; --sq-br:16px; --sq-bl:16px; padding:.1em .3em; }
  </style><div class="line"><span class="neighbor"></span><span class="prefix"></span><code>one two three four five six seven eight nine ten eleven twelve</code></div>`);
  const line = root.querySelector(".line")!;
  const code = root.querySelector<HTMLElement>("code")!;
  const neighbor = root.querySelector<HTMLElement>(".neighbor")!;
  const fragments = code.getClientRects();
  expect(fragments.length).toBe(2);
  expect(await findSquirclePaint()).toEqual([]);
  const bounds = line.getBoundingClientRect();
  neighbor.style.cssText = `left:${fragments[0]!.left - bounds.left}px;top:${fragments[0]!.top - bounds.top}px;width:8px;height:8px`;
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("code");
}, paintTimeout);

it("keeps an independent pill and a hairline inside an unpainted squircle", async () => {
  render(`<div style="position:relative;width:160px;height:120px;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px">
    <div style="position:absolute;left:30px;top:40px;width:100px;height:20px;border-radius:50%"><div style="width:100%;height:100%;border-radius:inherit;background:#c65"></div></div>
    <div style="position:absolute;left:30px;top:70px;width:40px;height:0;border-top:1px solid #c65"></div>
  </div>`);
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("finds a square child beside an independently shadowed rounded layer", async () => {
  const root = render(`<div style="position:relative;width:160px;height:120px">
    <div class="surface" style="position:absolute;inset:0;background:#fff;border-radius:15.204px;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px">
      <div style="position:absolute;left:0;top:0;width:12px;height:12px;background:#c65"></div>
    </div>
    <div class="ring" style="position:absolute;inset:0;border-radius:15.204px;corner-shape:round;box-shadow:0 2px 6px #0005"></div>
  </div>`);
  const ring = root.querySelector<HTMLElement>(".ring")!;
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  ring.style.right = "auto";
  ring.style.bottom = "auto";
  ring.style.width = "80px";
  ring.style.height = "60px";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
}, paintTimeout);

it("attributes protruding pseudo-elements without changing hit-test styles", async () => {
  const root = render(`<style>
    .surface::before { content:""; position:absolute; left:-12px; top:-12px; width:8px; height:8px; background:#c65; }
    .shadow::before { box-shadow:0 0 3px #000; }
  </style><div class="surface" data-ouro-paint-hit="existing" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px;pointer-events:none !important"></div>`);
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const original = surface.getAttribute("style");
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  expect(surface.getAttribute("style")).toBe(original);
  expect(surface.getAttribute("data-ouro-paint-hit")).toBe("existing");
  surface.classList.add("shadow");
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.shadow");
  expect(surface.getAttribute("style")).toBe(original);
  const computed = window.getComputedStyle.bind(window);
  const styles = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    return element !== surface || pseudo ? style : new Proxy(style, {
      get(target, property) {
        if (property === "filter" || property === "textShadow" || property === "outlineWidth") return "";
        if (property === "boxShadow") return "unresolved";
        if (property === "outlineStyle") return "solid";
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
  try {
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.shadow");
  } finally {
    styles.mockRestore();
  }
  surface.style.filter = "blur(1px)";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.shadow");
}, paintTimeout);

it("detects protruding pseudo paint beside an SVG shadow", async () => {
  const root = render(`<style>.surface::before { content:""; position:absolute; left:-12px; top:-12px; width:8px; height:8px; background:#c65; }</style>
    <div style="position:relative;width:160px;height:120px">
      <div class="surface" style="position:absolute;inset:0;background:#fff;border-radius:15.204px;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px"></div>
      <svg class="shadow" style="position:absolute;inset:0;width:160px;height:120px;border-radius:15.204px;box-shadow:0 2px 6px #0005"></svg>
    </div>`);
  const svg = root.querySelector("svg")!;
  const original = svg.getAttribute("style");
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  expect(svg.getAttribute("style")).toBe(original);
  const capture = state.__ouroPaintCapture!;
  const computed = window.getComputedStyle.bind(window);
  let captures = 0;
  state.__ouroPaintCapture = async (clip) => {
    const image = await capture(clip);
    captures++;
    return image;
  };
  const styles = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    return element !== svg || captures < 3 ? style : new Proxy(style, {
      get(target, property) {
        if (property === "width") return "0px";
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
  try {
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  } finally {
    styles.mockRestore();
    state.__ouroPaintCapture = capture;
  }
}, paintTimeout);

it("separates an unrelated changing overlay from a surface with a pseudo-element", async () => {
  const root = render(`<style>
    .stage { position:relative; left:20px; top:20px; width:160px; height:120px; }
    .surface { position:absolute; inset:0; background:#cdd7df; border-radius:18px; clip-path:inset(0 round 18px);
      --sq-tl:18px; --sq-tr:18px; --sq-br:18px; --sq-bl:18px; }
    .surface::before { content:""; position:absolute; left:80px; top:50px; width:8px; height:8px; background:#c65; }
    .overlay { position:absolute; left:10px; top:10px; width:20px; height:20px; background:#1d1d1f; }
    .stage:has(.surface[style*="clip-path"]) + .overlay, .stage:has(.surface[data-ouro-paint-solo]) + .overlay { background:#2e2e30; }
    .stage:has(.surface[style*="opacity: 0"]) + .overlay { background:#272729; }
  </style><div class="stage"><div class="surface"></div></div><div class="overlay"></div>`);
  const surface = root.querySelector(".surface")!;
  expect(await findSquirclePaint()).toEqual([]);
  expect(surface.hasAttribute("data-ouro-paint-hit")).toBe(false);
  expect(surface.hasAttribute("style")).toBe(false);
}, paintTimeout);

it("ignores a neighboring raster change while finding real paint beyond the box", async () => {
  const root = render('<div id="surface" style="position:relative;width:160px;height:120px;background:white;border-radius:28px;corner-shape:squircle;box-shadow:0 4px 12px #0008"></div>');
  const surface = root.querySelector<HTMLElement>("#surface")!;
  const capture = state.__ouroPaintCapture!;
  let leaking = false;
  state.__ouroPaintCapture = async (clip) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width;
    canvas.height = clip.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgb(120,130,140)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const hidden = getComputedStyle(surface).opacity === "0" || surface.hasAttribute("data-ouro-paint-solo");
    const masked = surface.style.getPropertyValue("clip-path") !== "";
    if ((!leaking && hidden) || (leaking && !hidden && !masked)) {
      const rect = surface.getBoundingClientRect();
      context.fillStyle = leaking ? "#c20" : "rgb(126,136,146)";
      context.fillRect(rect.left - clip.x - 10, rect.top - clip.y - 10, 5, 5);
    }
    return canvas.toDataURL();
  };
  try {
    expect(await findSquirclePaint()).toEqual([]);
    leaking = true;
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
  } finally {
    state.__ouroPaintCapture = capture;
  }
}, paintTimeout);

it("detects visible paint outside a low-opacity surface", async () => {
  render('<div id="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;opacity:.04"><div style="position:absolute;inset:0;background:#000"></div></div>');
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
}, paintTimeout);

it("detects important paint on a MathML descendant outside a shadowed surface", async () => {
  const root = render('<div id="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;box-shadow:0 4px 12px #0008"><math style="position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#f40;opacity:1 !important"></math></div>');
  const math = root.querySelector("math")!;
  const foreign = document.createElementNS("urn:example", "foreign");
  foreign.setAttribute("style", "color:red");
  root.querySelector("#surface")!.append(foreign);
  const original = math.getAttribute("style");
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
  expect(math.getAttribute("style")).toBe(original);
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

it("uses the clipping corner when a divider is on the opposite edge", () => {
  const root = render('<div id="outer" style="position:relative;width:160px;height:120px;overflow:hidden;background:#345;border-radius:24px;corner-shape:squircle"><div id="bar" style="position:absolute;inset:0 0 auto;height:40px;background:#789;border-bottom:1px solid #123"></div></div>');
  const bar = root.querySelector<HTMLElement>("#bar")!;
  expect(findCornerIssues()).toEqual([]);
  bar.style.borderTop = "1px solid #123";
  expect(findCornerIssues().find((issue) => issue.element === "div#bar in div#outer")?.detail).toContain("top left");
  bar.style.borderTop = "";
  bar.style.boxShadow = "inset 0 0 0 2px #123";
  expect(findCornerIssues().find((issue) => issue.element === "div#bar in div#outer")?.detail).toContain("top left");
  bar.style.boxShadow = "0 10px 14px -12px #123";
  expect(findCornerIssues()).toEqual([]);
});

it("checks a larger painted corner even when its outer frame clips", () => {
  const root = render('<div id="outer" style="position:relative;width:160px;height:120px;overflow:hidden;background:#345;border-radius:24px;corner-shape:squircle"><div id="inner" style="position:absolute;inset:0;background:#789;border-radius:32px;corner-shape:squircle"></div></div>');
  const inner = root.querySelector<HTMLElement>("#inner")!;
  expect(findCornerIssues().find((issue) => issue.element === "div#inner in div#outer")?.detail).toContain("32px, expected 24px");
  inner.style.borderRadius = "8px";
  expect(findCornerIssues()).toEqual([]);
});

it("compares the visible curves through an unpainted clipping layer", () => {
  const root = render(`<div id="outer" style="position:relative;width:200px;height:160px;box-shadow:0 2px 6px #0002;border-radius:17.376px;--sq-tl:32px;--sq-tr:32px;--sq-br:32px;--sq-bl:32px">
    <div id="clip" style="position:absolute;left:8px;top:8px;width:100px;height:100px;overflow:hidden"><div id="tile" style="position:absolute;inset:0;background:#789"></div></div>
  </div>`);
  const clip = root.querySelector<HTMLElement>("#clip")!;
  const tile = root.querySelector<HTMLElement>("#tile")!;
  const shape = (element: HTMLElement, radius: number, round = false) => {
    element.style.borderRadius = `${radius * (round ? 1 : .543)}px`;
    element.style.clipPath = round ? "none" : "inset(0)";
    element.style.setProperty("corner-shape", "round");
    for (const corner of ["tl", "tr", "br", "bl"]) element.style.setProperty(`--sq-${corner}`, round ? "0px" : `${radius}px`);
  };
  shape(clip, 24);
  shape(tile, 0);
  expect(findCornerIssues()).toEqual([]);
  shape(clip, 12);
  expect(findCornerIssues()[0]?.detail).toContain("12px, expected 24px");
  shape(clip, 24, true);
  expect(findCornerIssues()[0]?.detail).toContain("both corners must be squircles");
  shape(clip, 24);
  shape(tile, 32);
  expect(findCornerIssues()[0]?.detail).toContain("32px, expected 24px");
  shape(tile, 5, true);
  expect(findCornerIssues()).toEqual([]);
  shape(tile, 14, true);
  expect(findCornerIssues()[0]?.detail).toContain("incompatible clipping curves");
  if (CSS.supports("corner-shape", "bevel")) {
    shape(clip, 24, true);
    clip.style.setProperty("corner-shape", "bevel");
    shape(tile, 32);
    expect(findCornerIssues()[0]?.detail).toContain("incompatible clipping curves");
    shape(clip, 24);
    shape(tile, 32, true);
    tile.style.setProperty("corner-shape", "bevel");
    expect(findCornerIssues()[0]?.detail).toContain("incompatible clipping curves");
  }
  if (CSS.supports("corner-shape", "squircle")) {
    shape(clip, 24, true);
    shape(tile, 24, true);
    clip.style.borderRadius = "12px / 24px";
    tile.style.borderRadius = "24px / 12px";
    clip.style.setProperty("corner-shape", "squircle");
    tile.style.setProperty("corner-shape", "squircle");
    expect(findCornerIssues()[0]?.detail).toContain("incompatible clipping curves");
    tile.style.borderRadius = "32px / 12px";
    expect(findCornerIssues()[0]?.detail).toContain("incompatible clipping curves");
  }
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
  const imageUrl = await commands.cornerImageServer({ data: opaque });
  if (imageUrl === null) throw new Error("The corner image server did not start.");
  try {
    image.style.border = "";
    image.style.objectFit = "fill";
    image.src = imageUrl;
    await image.decode();
    expect(findCornerIssues()[0]?.detail).toContain("cannot inspect");
    image.style.border = "1px solid red";
    expect(findCornerIssues()[0]?.detail).toContain("expected 20px");
    root.innerHTML = `<div style="position:relative;width:160px;height:120px">
      <img alt="" src="${imageUrl}" style="position:absolute;inset:0;width:160px;height:120px;border-radius:24px;corner-shape:squircle">
      <div style="position:absolute;inset:4px;background:#789;border-radius:6px;corner-shape:squircle"></div>
    </div>`;
    await root.querySelector("img")!.decode();
    expect(findCornerIssues()[0]?.detail).toContain("cannot inspect");
  } finally {
    await commands.cornerImageServer({ data: null });
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
    position = "left 5px top 5px";
    image.style.objectPosition = position;
    expect(findCornerIssues()).toEqual([]);
    position = "left 1em top 5px";
    expect(findCornerIssues()[0]?.detail).toContain("cannot resolve the image's object-position");
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

it("does not discard a mismatched cutout behind a smaller transparent clip", () => {
  render(`<div style="position:relative;width:160px;height:120px;background:#eef4fa;border-radius:17.376px 0 0 0;--sq-tl:32px;clip-path:inset(0)">
    <div style="position:absolute;inset:4px;overflow:hidden;border-radius:2.172px 0 0 0;--sq-tl:4px;clip-path:inset(0)">
      <div style="position:absolute;inset:0;background:#789">
        <div class="cutout" style='position:absolute;inset:0;background:#eef4fa;--sq-tl:28px;clip-path:path(evenodd, "M 0 0 H 152 V 112 H 0 Z M 0 28 A 28 28 0 0 1 28 0 H 152 V 112 H 0 Z")'></div>
      </div>
    </div>
  </div>`);
  expect(findCornerIssues().map((issue) => issue.detail)).toContainEqual(expect.stringContaining("incompatible clipping curves"));
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

it("does not mistake an inverse corner cover for a rounded painted surface", async () => {
  const root = render(`<div class="cover" style='position:relative;width:160px;height:120px;background:#eef4fa;--sq-tl:28px;clip-path:path(evenodd, "M 0 0 H 160 V 120 H 0 Z M 0 28 C 0 17.164 -.2576 9.1672 4.4548 4.4548 C 9.1672 -.2576 17.164 0 28 0 H 160 V 120 H 0 Z")'></div>`);
  const cover = root.querySelector(".cover")!;
  const original = cover.getAttribute("style");
  expect(await findSquirclePaint()).toEqual([]);
  expect(cover.getAttribute("style")).toBe(original);
}, paintTimeout);

it("keeps paint inside an inverse cutout while detecting paint above its edge", () => {
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
  expect(findCornerIssues()).toEqual([]);
  const cover = root.querySelector<HTMLElement>(".cut-cover")!;
  cover.style.left = "0";
  cover.style.top = "0";
  expect(findCornerIssues().map((issue) => issue.element)).toContain("div.cut-inner in div.cut-outer");
  expect(inner.hasAttribute("style")).toBe(false);
  expect(layer.hasAttribute("style")).toBe(false);
});

it("recognizes panes whose corners are covered by an ancestor's inverse cutout", () => {
  const root = render(`<div style="display:flow-root;width:160px;height:120px;background:#eef4fa;border-top-left-radius:17.376px;--sq-tl:32px;clip-path:inset(0)">
    <div style="position:relative;margin:4px;width:152px;height:112px;background:#789">
      <div style="position:absolute;inset:0;display:flex;background:#567">
        <div style="width:50%;height:100%;background:#345"></div><div style="width:50%;height:100%;background:#678"></div>
      </div>
      <div style='position:absolute;inset:0;background:#eef4fa;--sq-tl:28px;clip-path:path(evenodd, "M 0 0 H 152 V 112 H 0 Z M 0 28 C 0 17.164 -.2576 9.1672 4.4548 4.4548 C 9.1672 -.2576 17.164 0 28 0 H 152 V 112 H 0 Z")'></div>
    </div>
  </div>`);
  expect(findCornerIssues()).toEqual([]);
  root.append(root.firstElementChild!.cloneNode(true));
  expect(findCornerIssues()).toEqual([]);
});

it("reports an inverse cutout whose curve is partly covered by paint", () => {
  render(`<div style="width:160px;height:120px;background:#eef4fa;border-top-left-radius:17.376px;--sq-tl:32px;clip-path:inset(0)">
    <div style="position:relative;margin:4px;width:152px;height:112px;background:#789">
      <div style='position:absolute;inset:0;background:#eef4fa;--sq-tl:28px;clip-path:path(evenodd, "M 0 0 H 152 V 112 H 0 Z M 0 28 C 0 17.164 -.2576 9.1672 4.4548 4.4548 C 9.1672 -.2576 17.164 0 28 0 H 152 V 112 H 0 Z")'></div>
      <div style="position:absolute;left:1px;top:8px;width:3px;height:4px;background:#b44939"></div>
    </div>
  </div>`);
  expect(findCornerIssues().map((issue) => issue.detail)).toContainEqual(expect.stringContaining("cutout does not match"));
}, paintTimeout);

it("does not mistake a switch's round thumb inside a capsule for nested frames", () => {
  render('<div style="position:relative;width:36px;height:20px;background:#345;border-radius:9999px"><div style="position:absolute;left:2px;top:2px;width:16px;height:16px;background:white;border-radius:50%"></div></div><div style="position:relative;width:20px;height:36px;background:#345;border-radius:9999px"><div style="position:absolute;left:2px;top:2px;width:16px;height:16px;background:white;border-radius:50%"></div></div>');
  expect(findCornerIssues()).toEqual([]);
});



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
    root.style.background = "repeating-linear-gradient(90deg, #000 0 2px, #fff 2px 4px)";
    hit.style.clipPath = "none";
    hit.style.backdropFilter = "blur(2px)";
    expect(await found()).toBe(true);
    hit.style.backdropFilter = "";
    hit.classList.add("painted-hit");
    expect(await found()).toBe(true);
    hit.classList.remove("painted-hit");
    hit.insertAdjacentHTML("beforeend", '<canvas width="160" height="120" style="position:absolute;inset:0"></canvas>');
    hit.querySelector("canvas")!.getContext("2d")!.fillRect(0, 0, 160, 120);
    expect(await found()).toBe(true);
    hit.innerHTML = '<div style="position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:#b44939"></div>';
    hit.style.clipPath = "";
    const computed = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = computed(element, pseudo);
      return element === hit && !pseudo ? new Proxy(style, {
        get(target, property) {
          if (property === "backdropFilter") return "";
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) : style;
    });
    try {
      expect(await found()).toBe(false);
    } finally {
      spy.mockRestore();
    }
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
  render('<div style="position:relative;width:160px;height:120px;border-radius:28px;corner-shape:squircle"><div style="position:absolute;inset:0;background:#000"></div></div>');
  const image = (painted: boolean, clip: PaintClip) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width;
    canvas.height = clip.height;
    if (painted) canvas.getContext("2d")!.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  const captures = [true, false, false, false, true];
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

it("keeps a detached rounded indicator distinct from square corner paint", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render('<div class="surface rounded-ouro-xl" style="position:relative;width:160px;height:120px;background:#eee"><span class="indicator" style="position:absolute;left:-4px;top:10px;width:3px;height:20px;border-radius:50%;background:#06c"></span></div>');
    const indicator = root.querySelector<HTMLElement>(".indicator")!;
    expect(await findSquirclePaint()).toEqual([]);
    indicator.insertAdjacentHTML("afterend", '<span style="position:absolute;left:-6px;top:7px;width:1px;height:2px;background:#c30"></span>');
    indicator.style.cssText = "position:absolute;left:-8px;top:0;width:8px;height:8px;background:#c30";
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-xl");
  } finally {
    restore();
  }
}, paintTimeout);

it("keeps a round badge in a painted cutout but finds an uncovered corner", async () => {
  const shape = "M 0 32 C 0 19.616 -.2944 10.4768 5.0912 5.0912 C 10.4768 -.2944 19.616 0 32 0 H 48 C 60.384 0 69.5232 -.2944 74.9088 5.0912 C 80.2944 10.4768 80 19.616 80 32 V 48 C 80 60.384 80.2944 69.5232 74.9088 74.9088 C 69.5232 80.2944 60.384 80 48 80 H 32 C 19.616 80 10.4768 80.2944 5.0912 74.9088 C -.2944 69.5232 0 60.384 0 48 Z";
  const notch = "M 88 75 A 13 13 0 1 1 62 75 A 13 13 0 1 1 88 75 Z";
  const radius = "border-radius:17.376px;--sq-tl:32px;--sq-tr:32px;--sq-br:32px;--sq-bl:32px";
  const root = render(`<div class="frame" style="position:relative;width:80px;height:80px;${radius}">
    <div class="surface" style='position:absolute;inset:0;background:#dce5ef;${radius};clip-path:path(evenodd, "${shape} ${notch}")'></div>
    <div class="badge" style="position:absolute;right:-5px;bottom:-5px;width:20px;height:20px;border-radius:50%;corner-shape:round;background:#149b55"></div>
  </div>`);
  const frame = root.querySelector<HTMLElement>(".frame")!;
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const badge = root.querySelector<HTMLElement>(".badge")!;
  frame.insertAdjacentHTML("afterbegin", '<div style="position:absolute;inset:0;clip-path:inset(0);pointer-events:none"></div>');
  expect(await findSquirclePaint()).toEqual([]);
  for (const element of [frame, surface]) {
    element.style.setProperty("--sq-tl", "0px");
    element.style.borderTopLeftRadius = "0";
  }
  expect(await findSquirclePaint()).toEqual([]);
  for (const element of [frame, surface]) {
    element.style.setProperty("--sq-tl", "32px");
    element.style.borderTopLeftRadius = "17.376px";
  }
  frame.insertAdjacentHTML("beforeend", '<div style="position:absolute;left:-6px;top:-6px;width:8px;height:8px;background:#b44939"></div>');
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.frame");
  badge.style.right = "-19px";
  badge.style.bottom = "-19px";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.frame");
  badge.style.right = "-5px";
  badge.style.bottom = "-5px";
  frame.lastElementChild!.remove();
  surface.style.clipPath = `path("${shape}")`;
  expect(await findSquirclePaint()).not.toEqual([]);
}, paintTimeout);







it("keeps a native shadow and its probe separate from a descendant's external paint", async () => {
  const root = render('<div style="position:relative;width:160px;height:120px"><div style="position:absolute;inset:0"></div><div class="surface" data-ouro-paint-solo="original" style="position:absolute;inset:0;background:#fff;border-radius:28px;corner-shape:squircle;box-shadow:0 4px 12px #0008"></div></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  expect(await findSquirclePaint()).toEqual([]);
  expect(surface.getAttribute("data-ouro-paint-solo")).toBe("original");
  surface.innerHTML = '<div style="position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#f40"></div>';
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  expect(surface.getAttribute("data-ouro-paint-solo")).toBe("original");
  surface.firstElementChild!.setAttribute("style", "position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#f40;opacity:1 !important;transition:opacity 1s !important");
  const child = surface.firstElementChild as HTMLElement;
  const childStyle = child.getAttribute("style");
  surface.insertAdjacentHTML("beforeend", '<span style="transition:opacity 1s !important"></span>');
  const transitionOnly = surface.querySelector<HTMLElement>("span")!;
  const transitionStyle = transitionOnly.getAttribute("style");
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  expect(child.getAttribute("style")).toBe(childStyle);
  expect(transitionOnly.getAttribute("style")).toBe(transitionStyle);
  const capture = state.__ouroPaintCapture!;
  let captures = 0;
  state.__ouroPaintCapture = async (clip) => {
    const image = await capture(clip);
    if (++captures === 2) child.style.color = "red";
    return image;
  };
  try {
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
    expect(child.style.color).toBe("red");
    expect(child.style.getPropertyValue("opacity")).toBe("1");
    expect(child.style.getPropertyPriority("opacity")).toBe("important");
    expect(child.style.getPropertyValue("transition-property")).toBe("opacity");
    const updatedStyle = child.getAttribute("style")!;
    captures = 0;
    state.__ouroPaintCapture = async (clip) => {
      const image = await capture(clip);
      if (++captures === 2) child.setAttribute("style", updatedStyle);
      return image;
    };
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
    expect(child.getAttribute("style")).toBe(updatedStyle);
    captures = 0;
    state.__ouroPaintCapture = async (clip) => {
      const image = await capture(clip);
      if (++captures === 2) {
        child.setAttribute("style", updatedStyle.replaceAll(";", " ;"));
        transitionOnly.style.color = "blue";
      }
      return image;
    };
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
    expect(child.getAttribute("style")).toBe(updatedStyle);
    expect(transitionOnly.style.color).toBe("blue");
    expect(transitionOnly.style.getPropertyPriority("transition-property")).toBe("important");
  } finally {
    state.__ouroPaintCapture = capture;
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
    for (const [corner, d] of [
      ["top right", `M ${160 - radius} 0 H 160 V ${radius}`],
      ["bottom right", `M 160 ${120 - radius} V 120 H ${160 - radius}`],
      ["bottom left", `M ${radius} 120 H 0 V ${120 - radius}`],
    ] as const) {
      path.setAttribute("d", d);
      expect((await findSquirclePaint()).map((issue) => issue.detail)).toEqual(expect.arrayContaining([expect.stringContaining(corner)]));
    }
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

it("preserves changes to an independent SVG stroke while measuring it", async () => {
  const restore = forceSquircleFallback();
  const capture = state.__ouroPaintCapture!;
  try {
    const { path, radius } = outlinedSurface();
    path.setAttribute("d", `M 0 ${radius} V 0 H ${radius}`);
    let changed = false;
    state.__ouroPaintCapture = async (clip) => {
      const image = await capture(clip);
      if (!changed && path.style.opacity === "0") {
        path.style.stroke = "blue";
        changed = true;
      }
      return image;
    };
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface.rounded-ouro-xl");
    expect(changed).toBe(true);
    expect(path.style.stroke).toBe("blue");
    expect(path.style.opacity).toBe("");
  } finally {
    state.__ouroPaintCapture = capture;
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

it("finds a surface fill beyond its curve even when its shadow is rounded", async () => {
  const root = render('<div class="surface" style="width:200px;height:200px;--sq-tl:100px;--sq-tr:100px;--sq-br:100px;--sq-bl:100px;border-radius:54.3px;background:#d40;box-shadow:0 2px 6px #0004"></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const original = surface.getAttribute("style");
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  expect(surface.getAttribute("style")).toBe(original);
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

it("detects an outline on a percentage-radius fallback corner", async () => {
  const root = render('<div class="surface" style="width:160px;height:120px;--sq-tl:50%;outline:6px solid #c65"></div>');
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  expect(root.querySelector<HTMLElement>(".surface")!.style.getPropertyValue("--sq-tl")).toBe("50%");
}, paintTimeout);

it("skips a fixed painted corner entirely outside the viewport", async () => {
  render('<div style="position:fixed;left:-1000px;top:-1000px;width:160px;height:120px;background:#fff;border-radius:28px;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px;clip-path:inset(0)"></div>');
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("does not mistake the next line of a wrapped inline surface for corner paint", async () => {
  const root = render('<div style="width:220px;font:16px/24px monospace"><span style="display:inline-block;width:165px"></span><code id="inline" style="background:#dde4ed;border-radius:8px;corner-shape:squircle;--sq-tl:8px;--sq-tr:8px;--sq-br:8px;--sq-bl:8px"><span>one/</span><wbr><span>several-more-words</span></code></div>');
  const fragments = root.querySelector("#inline")!.getClientRects();
  expect(fragments.length).toBeGreaterThan(1);
  expect(fragments[0]!.left).toBeGreaterThan(fragments[fragments.length - 1]!.left);
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("checks the real ends of wrapped inline surfaces in each writing direction", async () => {
  for (const [writingMode, direction, decoration] of [
    ["horizontal-tb", "ltr", "slice"],
    ["horizontal-tb", "rtl", "slice"],
    ["vertical-rl", "ltr", "slice"],
    ["vertical-rl", "rtl", "slice"],
    ["horizontal-tb", "ltr", "clone"],
  ] as const) {
    const root = render(`<div class="line" style="position:relative;width:120px;height:120px;writing-mode:${writingMode};direction:${direction};font:16px/24px monospace">
      <code class="inline" style="background:#eee;border-radius:8px;corner-shape:squircle;--sq-tl:8px;--sq-tr:8px;--sq-br:8px;--sq-bl:8px;-webkit-box-decoration-break:${decoration};box-decoration-break:${decoration}">one two three four five six seven eight nine ten</code>
    </div>`);
    const line = root.querySelector<HTMLElement>(".line")!;
    const inline = root.querySelector<HTMLElement>(".inline")!;
    const fragments = inline.getClientRects();
    expect(fragments.length, `${writingMode} ${direction} ${decoration}`).toBeGreaterThan(1);
    expect(await findSquirclePaint()).toEqual([]);
    const fragment = decoration === "clone" ? fragments[fragments.length - 1]! : fragments[0]!;
    const bounds = line.getBoundingClientRect();
    const horizontal = writingMode === "horizontal-tb";
    const x = horizontal && direction === "rtl" ? fragment.right - 4 : fragment.left;
    const y = !horizontal && direction === "rtl" ? fragment.bottom - 4 : fragment.top;
    inline.insertAdjacentHTML("beforeend", `<span style="position:absolute;left:${x - bounds.left}px;top:${y - bounds.top}px;width:4px;height:4px;background:#c30"></span>`);
    expect((await findSquirclePaint()).map((issue) => issue.element), `${writingMode} ${direction} ${decoration}`).toContain("code.inline");
    root.remove();
  }
}, paintTimeout);



it("checks surfaces larger than the viewport and leaves no temporary style attribute", async () => {
  const root = render(`<style>.surface { width:${innerWidth + 100}px; height:${innerHeight + 100}px; background:#fff; border-radius:28px; corner-shape:squircle; }</style><div class="surface"></div>`);
  const surface = root.querySelector(".surface")!;
  expect(await findSquirclePaint()).toEqual([]);
  expect(surface.hasAttribute("style")).toBe(false);
}, paintTimeout);



it("keeps a removed style attribute absent when calibrating a fallback shadow", async () => {
  const root = render('<style>.surface { position:relative; width:160px; height:120px; background:#fff; border-radius:2px; --sq-tl:28px; box-shadow:0 2px 6px #0004; }</style><div class="surface"></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const capture = state.__ouroPaintCapture!;
  let removed = false;
  let captures = 0;
  state.__ouroPaintCapture = async (clip) => {
    const image = await capture(clip);
    captures++;
    if (!removed) {
      surface.removeAttribute("style");
      removed = true;
    } else if (captures === 2) surface.setAttribute("style", "");
    return image;
  };
  try {
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
    expect(removed).toBe(true);
    expect(surface.hasAttribute("style")).toBe(false);
  } finally {
    state.__ouroPaintCapture = capture;
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
  const root = render('<div id="surface" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  root.style.top = "auto";
  root.style.bottom = "0";
  const original = await commands.squircleHostScroll({ y: null });
  const capture = state.__ouroPaintCapture!;
  state.__ouroPaintCapture = async (clip) => {
    const scrolled = await commands.squircleHostScroll({ y: 6 });
    expect(scrolled.scroll).toBeGreaterThan(0);
    expect(scrolled.top).toBeLessThan(0);
    const image = await capture(clip);
    expect(await commands.squircleHostScroll({ y: null })).toEqual(scrolled);
    return image;
  };
  try {
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
  } finally {
    state.__ouroPaintCapture = capture;
    await commands.squircleHostScroll({ y: original.scroll });
  }
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

it("checks coincident rounded siblings with different corners, and a contained squircle", async () => {
  const root = render(`<div style="position:relative;width:160px;height:120px">
    <div class="outer" style="position:absolute;inset:0;background:white;border-radius:28px;corner-shape:squircle;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px"></div>
    <div class="inner" style="position:absolute;inset:0;background:#b44939;border-radius:12px;corner-shape:squircle;--sq-tl:12px;--sq-tr:12px;--sq-br:12px;--sq-bl:12px"></div>
  </div>`);
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.outer");
  const inner = root.querySelector<HTMLElement>(".inner")!;
  inner.style.inset = "40px auto auto 60px";
  inner.style.width = "20px";
  inner.style.height = "20px";
  expect(await findSquirclePaint()).toEqual([]);
}, paintTimeout);

it("checks a rounded document root without a parent element", async () => {
  const html = document.documentElement;
  const original = html.getAttribute("style");
  try {
    html.style.setProperty("--sq-tl", "28px");
    html.style.borderTopLeftRadius = "15px";
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    if (original === null) html.removeAttribute("style");
    else html.setAttribute("style", original);
  }
}, paintTimeout);

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
  const captures = ["red", "blue", "green", "purple", "orange", "red", "blue", "green", "purple", "orange"];
  state.__ouroPaintCapture = async (clip) => image(captures.shift()!, clip);
  try {
    expect(await findSquirclePaint()).toEqual([]);
  } finally {
    state.__ouroPaintCapture = (clip) => commands.squircleCapture(clip);
  }
});

it("does not attribute an unrelated neighbor's pixels to an overflowing corner", async () => {
  const root = render('<div class="surface" data-ouro-paint-hit="keep" style="position:relative;width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px"></div><div style="position:absolute;left:178px;top:4px;width:8px;height:8px;background:#ddd"></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const capture = state.__ouroPaintCapture!;
  state.__ouroPaintCapture = async (clip) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width;
    canvas.height = clip.height;
    const pen = canvas.getContext("2d")!;
    pen.fillStyle = "#fff";
    pen.fillRect(0, 0, canvas.width, canvas.height);
    if (surface.style.opacity !== "0" && surface.style.clipPath === "" && !surface.hasAttribute("data-ouro-paint-solo")) {
      const rect = surface.getBoundingClientRect();
      pen.fillStyle = "#c30";
      pen.fillRect(rect.left - clip.x + 178, rect.top - clip.y + 4, 8, 8);
    }
    return canvas.toDataURL();
  };
  try {
    expect(await findSquirclePaint()).toEqual([]);
    surface.insertAdjacentHTML("beforeend", '<span style="position:absolute;left:178px;top:4px;width:8px;height:8px;background:#c30;pointer-events:none"></span>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
    surface.firstElementChild!.remove();
    root.insertAdjacentHTML("beforeend", '<style>.surface::after { content:""; position:absolute; left:178px; top:4px; width:8px; height:8px; background:#c30; pointer-events:none }</style>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
    root.querySelector("style")!.textContent = '.surface.surface::after { content:""; position:absolute; left:178px; top:4px; width:8px; height:8px; background:#c30; pointer-events:none !important }';
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
    expect(surface.getAttribute("data-ouro-paint-hit")).toBe("keep");
  } finally {
    state.__ouroPaintCapture = capture;
  }
}, paintTimeout);

it("ignores an unpainted rounded focus wrapper around a smaller control", async () => {
  const root = render(`<div class="wrapper" style="position:relative;width:160px;height:120px;border-radius:28px;corner-shape:squircle;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px">
    <div style="position:absolute;right:0;bottom:0;width:24px;height:24px;background:#d11"></div>
  </div>`);
  const wrapper = root.querySelector<HTMLElement>(".wrapper")!;
  const child = wrapper.firstElementChild as HTMLElement;
  expect(await findSquirclePaint()).toEqual([]);
  child.style.cssText = "position:absolute;inset:0;background:#d11";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.wrapper");
  child.style.cssText = "position:absolute;right:0;bottom:0;width:24px;height:24px;background:#d11";
  wrapper.style.background = "#fff";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.wrapper");
}, paintTimeout);

it("keeps a round bar separate from an unpainted narrow focus wrapper", async () => {
  const root = render('<button class="focus" style="position:relative;width:4px;height:47px;padding:0;border:0;background:transparent;border-radius:4.344px;--sq-tl:8px;--sq-tr:8px;--sq-br:8px;--sq-bl:8px"><span class="bar" style="position:absolute;left:2px;top:0;width:4px;height:47px;border-radius:9999px;background:#58b"></span></button>');
  const bar = root.querySelector<HTMLElement>(".bar")!;
  expect(await findSquirclePaint()).toEqual([]);
  bar.style.borderRadius = "0";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("button.focus");
}, paintTimeout);

it("keeps an independent floating squircle separate from an unpainted focus wrapper", async () => {
  const restore = forceSquircleFallback();
  try {
    const root = render(`<div id="focus" class="rounded-ouro-xl" style="position:relative;width:160px;height:120px">
      <div id="floating" class="rounded-ouro-lg" style="position:absolute;left:142px;top:102px;width:50px;height:32px;background:#ddd">
        <span style="position:absolute;inset:10px;background:#234"></span>
      </div>
    </div>`);
    expect(await findSquirclePaint()).toEqual([]);
    root.querySelector("#floating")!.insertAdjacentHTML("beforeend", '<span style="position:absolute;left:-5px;top:-5px;width:10px;height:10px;background:#d11"></span>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#floating.rounded-ouro-lg");
  } finally {
    restore();
  }
}, paintTimeout);

it("keeps a separate round badge distinct from square paint on it", async () => {
  const root = render('<div style="position:relative;width:64px;height:64px"><div class="surface" style="position:absolute;inset:0;background:#def;border-radius:20px;clip-path:inset(0 round 20px);--sq-tl:24px;--sq-tr:24px;--sq-br:24px;--sq-bl:24px"></div><span class="badge" style="position:absolute;right:-6px;bottom:-6px;width:28px;height:28px;border-radius:9999px;background:#357"></span></div>');
  expect(await findSquirclePaint()).toEqual([]);
  root.querySelector(".badge")!.insertAdjacentHTML("beforeend", '<span style="position:absolute;right:-4px;top:-4px;width:8px;height:8px;background:#d11"></span>');
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
}, paintTimeout);

it("separates a fractional badge raster edge from square paint", async () => {
  const root = render('<div style="position:fixed;left:50px;top:50px;width:112px;height:112px"><div class="surface" style="position:absolute;inset:0;background:#456;border-radius:27px;clip-path:inset(0 round 27px);--sq-tl:49.28px;--sq-tr:49.28px;--sq-br:49.28px;--sq-bl:49.28px"></div><span class="badge" style="position:absolute;right:-6.6px;bottom:-6.6px;width:31px;height:31px;border-radius:9999px;background:#fb0"></span></div>');
  const surface = root.querySelector<HTMLElement>(".surface")!;
  const badge = root.querySelector<HTMLElement>(".badge")!;
  const capture = state.__ouroPaintCapture!;
  let square = false;
  state.__ouroPaintCapture = async (clip) => {
    const canvas = document.createElement("canvas");
    canvas.width = clip.width;
    canvas.height = clip.height;
    const pen = canvas.getContext("2d")!;
    pen.fillStyle = "#000";
    pen.fillRect(0, 0, canvas.width, canvas.height);
    if (badge.style.opacity !== "0" && badge.style.clipPath === "" && !surface.hasAttribute("data-ouro-paint-solo")) {
      const rect = surface.getBoundingClientRect();
      pen.fillStyle = "#413109";
      pen.fillRect(rect.left + (square ? 124 : 108) - clip.x, rect.top + (square ? 90 : 118) - clip.y, 1, 1);
    }
    return canvas.toDataURL();
  };
  try {
    expect(await findSquirclePaint()).toEqual([]);
    badge.insertAdjacentHTML("beforeend", '<span style="position:absolute;left:34px;top:2px;width:8px;height:8px;background:#d11"></span>');
    square = true;
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.surface");
  } finally {
    state.__ouroPaintCapture = capture;
  }
}, paintTimeout);







it("keeps a selected segment and its shadow inside the track's corners", async () => {
  const host = render("");
  host.style.setProperty("--radius", "20px");
  host.style.setProperty("--shadow-sm", "0 4px 8px rgba(0,0,0,.4)");
  const root = createRoot(host);
  try {
    for (const fallback of [false, true]) {
      const restore = fallback ? forceSquircleFallback() : () => {};
      try {
        for (const value of ["one", "two"]) {
          await act(async () => root.render(createElement(SegmentedControl, {
            label: "View",
            items: [{ value: "one", label: "One" }, { value: "two", label: "Two" }],
            value,
            onValueChange: () => {},
          })));
          host.querySelector<HTMLElement>('[role="radiogroup"]')!.id = "segment-track";
          const thumb = host.querySelector<HTMLElement>("[data-ouro-segment-thumb]")!;
          const shadow = getComputedStyle(thumb, "::before");
          expect(shadow.content).not.toBe("none");
          expect(shadow.boxShadow).not.toBe("none");
          expect((await findSquirclePaint()).map((issue) => issue.element)).not.toContain("div#segment-track.relative.isolate.m-0");
        }
      } finally {
        restore();
      }
    }
  } finally {
    await act(async () => root.unmount());
  }
}, paintTimeout);

it("keeps a fractional-width segment thumb and its shadow inside its own corners", async () => {
  const restore = forceSquircleFallback();
  const host = render("");
  host.style.width = "302.3125px";
  host.style.setProperty("--shadow-sm", "0 1px 3px #0004");
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SegmentedControl, {
      label: "Example",
      hideLabel: true,
      fullWidth: true,
      items: [{ value: "one", label: "One" }, { value: "two", label: "Two" }, { value: "three", label: "Three" }],
      value: "two",
      onValueChange: () => {},
    })));
    const thumb = host.querySelector<HTMLElement>("[data-ouro-segment-thumb]")!;
    thumb.id = "fractional-thumb";
    expect(thumb.getBoundingClientRect().width).toBeCloseTo(99.4375, 2);
    expect((await findSquirclePaint()).map((issue) => issue.element)).not.toContain("span#fractional-thumb.pointer-events-none.absolute.top-0.5");
    thumb.style.setProperty("clip-path", "none", "important");
    thumb.style.setProperty("overflow", "visible", "important");
    thumb.insertAdjacentHTML("beforeend", '<span style="position:absolute;inset:0;background:#c30"></span>');
    expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("span#fractional-thumb.pointer-events-none.absolute.top-0.5");
  } finally {
    await act(async () => root.unmount());
    restore();
  }
}, paintTimeout);

it("ignores a bottom corner when only the opposite border is painted", async () => {
  const root = render(`<div class="wrapper" style="position:relative;width:160px;height:120px;border-top:2px solid #444;border-radius:0 0 28px 28px;corner-shape:squircle;--sq-br:28px;--sq-bl:28px">
    <div style="position:absolute;left:0;bottom:0;width:24px;height:24px;background:#d11"></div>
  </div>`);
  const wrapper = root.querySelector<HTMLElement>(".wrapper")!;
  expect(await findSquirclePaint()).toEqual([]);
  wrapper.style.background = "#fff";
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div.wrapper");
}, paintTimeout);

it("rejects a changed screenshot size after restoring the painted surface", async () => {
  const root = render('<div style="width:160px;height:120px;background:#fff;border-radius:28px;corner-shape:squircle"></div>');
  const surface = root.firstElementChild!;
  const original = surface.getAttribute("style");
  const captures = [
    { color: "red", extra: 0 },
    { color: "blue", extra: 0 },
    { color: "blue", extra: 0 },
    { color: "purple", extra: 0 },
    { color: "orange", extra: 2 },
  ];
  state.__ouroPaintCapture = async (clip) => {
    const { color, extra } = captures.shift()!;
    const canvas = document.createElement("canvas");
    canvas.width = clip.width + extra;
    canvas.height = clip.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  try {
    await expect(findSquirclePaint()).rejects.toThrow("screenshots changed size");
    expect(surface.getAttribute("style")).toBe(original);
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
