import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { findCornerIssues } from "@/registry/ouro/check/corner-check";
import { findSquirclePaint, type PaintClip } from "@/registry/ouro/check/squircle-paint";

const state = window as unknown as { __ouroPaintCapture?: (clip: PaintClip) => Promise<string>; __ouroCheckRef?: number };
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
});

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
  inner.style.cornerShape = "round";
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
    element.style.cornerShape = "round";
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
});

it("finds paint on a forced fallback and skips invisible or offscreen surfaces", async () => {
  const root = render('<div id="surface" style="position:relative;width:160px;height:120px;border-radius:15px;--sq-tl:28px;--sq-tr:28px;--sq-br:28px;--sq-bl:28px;background:#fff"><div style="position:absolute;inset:0;background:#f40"></div></div>');
  expect((await findSquirclePaint()).map((issue) => issue.element)).toContain("div#surface");
  root.innerHTML = '<div hidden style="width:160px;height:120px;border-radius:28px;corner-shape:squircle"></div><div style="width:1px;height:1px;border-radius:28px;corner-shape:squircle"></div><div style="position:fixed;left:-600px;top:-600px;width:160px;height:120px;border-radius:28px;corner-shape:squircle"></div>';
  expect(await findSquirclePaint()).toEqual([]);
});

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
