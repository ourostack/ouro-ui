export { findSquirclePaint };
export type { PaintCapture, PaintClip };

import type { PageIssue } from "./size-check.ts";

interface PaintClip { x: number; y: number; width: number; height: number }
type PaintCapture = (clip: PaintClip) => Promise<string>;

// Runs in the page. The host supplies __ouroPaintCapture, which returns a PNG of the requested viewport rectangle.
async function findSquirclePaint(): Promise<PageIssue[]> {
  type Corner = { x: number; y: number; squircle: boolean };
  type Saved = { value: string; priority: string };
  const capture = (window as unknown as { __ouroPaintCapture?: PaintCapture }).__ouroPaintCapture;
  if (!capture) throw new Error("squircle-paint needs a screenshot capture supplied by its host");
  const names = [
    { key: "tl", property: "TopLeft", shape: "top-left" },
    { key: "tr", property: "TopRight", shape: "top-right" },
    { key: "br", property: "BottomRight", shape: "bottom-right" },
    { key: "bl", property: "BottomLeft", shape: "bottom-left" },
  ] as const;
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (el: Element) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `p${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}`;
  const optedOut = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const rules = (n.getAttribute("data-ouro-allow") ?? "").split(/\s+/);
      if ((rules.includes("squircle-paint") || rules.includes("all")) && (n.getAttribute("data-ouro-allow-why") ?? "").trim()) return true;
    }
    return false;
  };
  const visible = (el: Element) => {
    if (el.closest("[hidden], template, .visually-hidden, .sr-only, details:not([open]) > :not(summary)")) return false;
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.05) return false;
    }
    return true;
  };
  const geometry = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width < 2 || height < 2) return null;
    const length = (value: string, dimension: number) => value.endsWith("%") ? parseFloat(value) * dimension / 100 : parseFloat(value) || 0;
    const corners = names.map(({ key, property, shape }) => {
      const fallback = style.getPropertyValue(`--sq-${key}`).trim();
      const fallbackRadius = length(fallback, width);
      const values = (fallbackRadius > 0 ? fallback : style[`border${property}Radius`]).trim().split(/\s+/);
      const shapeValue = style.getPropertyValue(`corner-${shape}-shape`).trim();
      const native = shapeValue === "squircle" || shapeValue === "superellipse(2)";
      const x = length(values[0]!, width);
      const y = length(values[1] ?? values[0]!, height);
      return { x, y, squircle: (native || fallbackRadius > 0) && x >= 4 && y >= 4, native };
    });
    if (!corners.some((corner) => corner.squircle)) return null;
    const [tl, tr, br, bl] = corners;
    const factor = Math.min(1, width / Math.max(1, tl!.x + tr!.x), width / Math.max(1, bl!.x + br!.x), height / Math.max(1, tl!.y + bl!.y), height / Math.max(1, tr!.y + br!.y));
    for (const corner of corners) {
      corner.x *= factor;
      corner.y *= factor;
      if (!corner.squircle) corner.x = corner.y = 0;
    }
    return { width, height, corners, native: corners.filter((corner) => corner.squircle).every((corner) => corner.native) };
  };
  // An even-odd path keeps everything outside the box, but cuts its corner slivers to the ideal n=4 curve.
  const clipPath = (width: number, height: number, corners: Corner[]) => {
    const [tl, tr, br, bl] = corners as [Corner, Corner, Corner, Corner];
    const n = (value: number) => Number(value.toFixed(4));
    const [w, h] = [width, height];
    const path = [
      `M -10000 -10000 H ${w + 10000} V ${h + 10000} H -10000 Z`,
      `M 0 0 H ${w} V ${h} H 0 Z`,
      `M 0 ${n(tl.y)}`,
      `C 0 ${n(0.613 * tl.y)} ${n(-0.0092 * tl.x)} ${n(0.3274 * tl.y)} ${n(0.1591 * tl.x)} ${n(0.1591 * tl.y)}`,
      `C ${n(0.3274 * tl.x)} ${n(-0.0092 * tl.y)} ${n(0.613 * tl.x)} 0 ${n(tl.x)} 0`,
      `H ${n(w - tr.x)}`,
      `C ${n(w - 0.613 * tr.x)} 0 ${n(w - 0.3274 * tr.x)} ${n(-0.0092 * tr.y)} ${n(w - 0.1591 * tr.x)} ${n(0.1591 * tr.y)}`,
      `C ${n(w + 0.0092 * tr.x)} ${n(0.3274 * tr.y)} ${w} ${n(0.613 * tr.y)} ${w} ${n(tr.y)}`,
      `V ${n(h - br.y)}`,
      `C ${w} ${n(h - 0.613 * br.y)} ${n(w + 0.0092 * br.x)} ${n(h - 0.3274 * br.y)} ${n(w - 0.1591 * br.x)} ${n(h - 0.1591 * br.y)}`,
      `C ${n(w - 0.3274 * br.x)} ${n(h + 0.0092 * br.y)} ${n(w - 0.613 * br.x)} ${h} ${n(w - br.x)} ${h}`,
      `H ${n(bl.x)}`,
      `C ${n(0.613 * bl.x)} ${h} ${n(0.3274 * bl.x)} ${n(h + 0.0092 * bl.y)} ${n(0.1591 * bl.x)} ${n(h - 0.1591 * bl.y)}`,
      `C ${n(-0.0092 * bl.x)} ${n(h - 0.3274 * bl.y)} 0 ${n(h - 0.613 * bl.y)} 0 ${n(h - bl.y)}`,
      "Z",
    ].join(" ");
    return `path(evenodd, "${path}")`;
  };
  const pixels = async (data: string) => {
    const image = new Image();
    image.src = data.startsWith("data:") ? data : `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
  };
  const differences = async (actual: string, masked: string, hidden: string, clip: PaintClip, rect: DOMRect) => {
    const [a, b, c] = await Promise.all([pixels(actual), pixels(masked), pixels(hidden)]);
    if (a.width !== b.width || a.height !== b.height || a.width !== c.width || a.height !== c.height) {
      throw new Error("squircle-paint screenshots changed size during measurement");
    }
    let previous = new Uint8Array(a.width);
    let count = 0;
    let largest = 0;
    let adjacent = false;
    const guardX = Math.max(1, Math.ceil(a.width / clip.width * 0.75));
    const guardY = Math.max(1, Math.ceil(a.height / clip.height * 0.75));
    const difference = (first: Uint8ClampedArray, second: Uint8ClampedArray, index: number) => Math.max(
      Math.abs(first[index]! - second[index]!),
      Math.abs(first[index + 1]! - second[index + 1]!),
      Math.abs(first[index + 2]! - second[index + 2]!),
    );
    for (let y = 0; y < a.height; y++) {
      const row = new Uint8Array(a.width);
      for (let x = 0; x < a.width; x++) {
        const index = (y * a.width + x) * 4;
        const px = clip.x + (x + 0.5) * clip.width / a.width;
        const py = clip.y + (y + 0.5) * clip.height / a.height;
        const outsideCorner = (px < rect.left || px >= rect.right) && (py < rect.top || py >= rect.bottom);
        const delta = difference(a.data, outsideCorner ? c.data : b.data, index);
        const behind = difference(b.data, c.data, index);
        if (outsideCorner ? delta < 64 : delta < 20 || behind > 4) continue;
        if (!outsideCorner) {
          let edge = false;
          for (let dy = -guardY; dy <= guardY && !edge; dy++) {
            for (let dx = -guardX; dx <= guardX; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < a.width && ny >= 0 && ny < a.height && difference(b.data, c.data, (ny * a.width + nx) * 4) > 4) {
                edge = true;
                break;
              }
            }
          }
          if (edge) continue;
        }
        count++;
        largest = Math.max(largest, delta);
        row[x] = 1;
        if ((x > 0 && row[x - 1]) || previous[x]) adjacent = true;
      }
      previous = row;
    }
    return count > 0 && (largest >= 64 || adjacent);
  };
  const save = (el: HTMLElement, property: string): Saved => ({ value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) });
  const restore = (el: HTMLElement, property: string, saved: Saved) => {
    if (saved.value) el.style.setProperty(property, saved.value, saved.priority);
    else el.style.removeProperty(property);
  };
  const issues: PageIssue[] = [];
  const targets = [document.body, ...document.body.querySelectorAll<HTMLElement>("*")]
    .filter((el) => !el.closest("svg, script, style, template") && !optedOut(el) && visible(el));
  for (const el of targets) {
    const initial = geometry(el);
    if (!initial) continue;
    const scroll = [...function* () { for (let n = el.parentElement; n; n = n.parentElement) yield n; }()]
      .map((node) => ({ node, left: node.scrollLeft, top: node.scrollTop }));
    const windowScroll = { x: scrollX, y: scrollY };
    const originalStyle = el.getAttribute("style");
    const normalizedStyle = el.style.cssText;
    const saved = new Map(["clip-path", "opacity", "box-shadow", "outline", "transition"].map((property) => [property, save(el, property)]));
    let found = false;
    try {
      el.style.setProperty("transition", "none", "important");
      // Native shadows and focus outlines follow the native squircle; they are outside it by design.
      if (initial.native) {
        el.style.setProperty("box-shadow", "none", "important");
        el.style.setProperty("outline", "none", "important");
      }
      const blocks: ScrollLogicalPosition[] = el.getBoundingClientRect().height > innerHeight ? ["start", "end"] : ["nearest"];
      const inlines: ScrollLogicalPosition[] = el.getBoundingClientRect().width > innerWidth ? ["start", "end"] : ["nearest"];
      for (const block of blocks) {
        for (const inline of inlines) {
          el.scrollIntoView({ block, inline, behavior: "instant" });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const r = el.getBoundingClientRect();
          const margin = 32;
          const x = Math.max(0, r.left - margin);
          const y = Math.max(0, r.top - margin);
          const clip = { x, y, width: Math.min(r.right + margin, innerWidth) - x, height: Math.min(r.bottom + margin, innerHeight) - y };
          if (clip.width < 1 || clip.height < 1) continue;
          const actual = await capture(clip);
          el.style.setProperty("clip-path", clipPath(initial.width, initial.height, initial.corners), "important");
          const masked = await capture(clip);
          el.style.setProperty("opacity", "0", "important");
          const hidden = await capture(clip);
          restore(el, "opacity", saved.get("opacity")!);
          restore(el, "clip-path", saved.get("clip-path")!);
          if (await differences(actual, masked, hidden, clip, r)) { found = true; break; }
        }
        if (found) break;
      }
    } finally {
      for (const [property, value] of saved) restore(el, property, value);
      for (const position of scroll) position.node.scrollTo({ left: position.left, top: position.top, behavior: "instant" });
      window.scrollTo({ left: windowScroll.x, top: windowScroll.y, behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const currentStyle = el.getAttribute("style");
      if (currentStyle !== originalStyle && el.style.cssText === normalizedStyle) {
        if (originalStyle === null) el.removeAttribute("style");
        else el.setAttribute("style", originalStyle);
      }
    }
    if (found) issues.push({ ref: ref(el), rule: "squircle-paint", element: describe(el), detail: "paint shows outside the squircle's corner curve" });
  }
  return issues;
}
