export { findCornerIssues };
export type { CornerOptions };

import type { PageIssue } from "./size-check.ts";

interface CornerOptions {
  /** The native window's corner radius in CSS pixels, when its edge is outside the page. */
  windowRadius?: number;
  /** The native window's bounds in viewport CSS pixels; defaults to the viewport itself. */
  windowBounds?: { x: number; y: number; width: number; height: number };
  /** How far the native window extends beyond each viewport edge in CSS pixels. */
  windowInsets?: { top: number; right: number; bottom: number; left: number };
}

// Runs in the page: the runner serializes this function into page.evaluate.
function findCornerIssues({ windowRadius, windowBounds, windowInsets }: CornerOptions = {}): PageIssue[] {
  if (windowRadius !== undefined && (!Number.isFinite(windowRadius) || windowRadius < 0)) {
    throw new Error("windowRadius takes a non-negative number of CSS pixels");
  }
  if ((windowBounds !== undefined || windowInsets !== undefined) && windowRadius === undefined) {
    throw new Error("windowBounds and windowInsets require windowRadius");
  }
  if (windowBounds !== undefined && windowInsets !== undefined) throw new Error("pass windowBounds or windowInsets, not both");
  if (windowBounds !== undefined && (
    typeof windowBounds !== "object" || windowBounds === null || Array.isArray(windowBounds) ||
    ![windowBounds.x, windowBounds.y, windowBounds.width, windowBounds.height].every(Number.isFinite) ||
    windowBounds.width <= 0 || windowBounds.height <= 0
  )) {
    throw new Error("windowBounds takes finite x and y and positive width and height in viewport CSS pixels");
  }
  if (windowInsets !== undefined && (
    typeof windowInsets !== "object" || windowInsets === null || Array.isArray(windowInsets) ||
    ![windowInsets.top, windowInsets.right, windowInsets.bottom, windowInsets.left].every((value) => Number.isFinite(value) && value >= 0)
  )) {
    throw new Error("windowInsets takes non-negative top, right, bottom and left in CSS pixels");
  }
  if (windowBounds && (windowBounds.x > 1 || windowBounds.y > 1 || windowBounds.x + windowBounds.width < innerWidth - 1 || windowBounds.y + windowBounds.height < innerHeight - 1)) {
    throw new Error("native window bounds must contain the viewport; use windowInsets for a sweep of sizes");
  }
  type Corner = { name: string; key: string; x: number; y: number; squircle: boolean; cutoutMismatch?: boolean };
  type Surface = { el: Element | null; rect: DOMRect; corners: Corner[] };
  const names = [
    { name: "top left", key: "tl", property: "TopLeft", shape: "top-left" },
    { name: "top right", key: "tr", property: "TopRight", shape: "top-right" },
    { name: "bottom right", key: "br", property: "BottomRight", shape: "bottom-right" },
    { name: "bottom left", key: "bl", property: "BottomLeft", shape: "bottom-left" },
  ] as const;
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (el: Element) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `n${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}`;
  const optedOut = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const rules = (n.getAttribute("data-ouro-allow") ?? "").split(/\s+/);
      if ((rules.includes("corners-nest") || rules.includes("all")) && (n.getAttribute("data-ouro-allow-why") ?? "").trim()) return true;
    }
    return false;
  };
  const visible = (el: Element) => {
    if (el.closest("[hidden], template, .visually-hidden, .sr-only, details:not([open]) > :not(summary)")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) <= 0.05) return false;
    }
    return true;
  };
  const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const rgba = (colour: string) => {
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = colour;
    canvas.fillRect(0, 0, 1, 1);
    return [...canvas.getImageData(0, 0, 1, 1).data];
  };
  const painted = (el: Element) => {
    const s = getComputedStyle(el);
    if (el.matches("img, video, canvas") || s.backgroundImage !== "none") return true;
    const fill = rgba(s.backgroundColor);
    if (fill[3]! > 12) {
      let behind: number[] | undefined;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ns = getComputedStyle(n);
        if (ns.backgroundImage !== "none") return true;
        const colour = rgba(ns.backgroundColor);
        if (colour[3]! >= 250) { behind = colour; break; }
      }
      if (!behind || fill[3]! < 250 || Math.hypot(fill[0]! - behind[0]!, fill[1]! - behind[1]!, fill[2]! - behind[2]!) > 3) return true;
    }
    for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
      if (s[`border${side}Style`] !== "none" && parseFloat(s[`border${side}Width`]) > 0 && rgba(s[`border${side}Color`])[3]! > 12) return true;
    }
    return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && rgba(s.outlineColor)[3]! > 12) || s.boxShadow !== "none";
  };
  const surface = (el: Element): Surface => {
    const rect = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const html = el as HTMLElement;
    const sx = html.offsetWidth ? rect.width / html.offsetWidth : 1;
    const sy = html.offsetHeight ? rect.height / html.offsetHeight : 1;
    const length = (value: string, dimension: number, scale: number) => value.endsWith("%") ? (parseFloat(value) / 100) * dimension : (parseFloat(value) || 0) * scale;
    const corners = names.map(({ name, key, property, shape }) => {
      const fallback = s.getPropertyValue(`--sq-${key}`).trim();
      const parts = (parseFloat(fallback) > 0 ? fallback : s[`border${property}Radius`]).trim().split(/\s+/);
      const x = length(parts[0]!, rect.width, sx);
      const y = length(parts[1] ?? parts[0]!, rect.height, sy);
      const native = s.getPropertyValue(`corner-${shape}-shape`).trim();
      const squircle = native === "squircle" || native === "superellipse(2)" || (parseFloat(fallback) > 0 && s.clipPath !== "none");
      return { name, key, x, y, squircle };
    });
    const [tl, tr, br, bl] = corners;
    const factor = Math.min(1, rect.width / Math.max(1, tl!.x + tr!.x), rect.width / Math.max(1, bl!.x + br!.x), rect.height / Math.max(1, tl!.y + bl!.y), rect.height / Math.max(1, tr!.y + br!.y));
    for (const corner of corners) { corner.x *= factor; corner.y *= factor; }
    return { el, rect, corners };
  };
  const surfaces = [document.documentElement, document.body, ...document.body.querySelectorAll("*")]
    .filter((el) => !el.closest("svg, script, style, template") && !el.hasAttribute("data-ouro-surface") && !el.hasAttribute("data-ouro-avatar-surface") && visible(el) && painted(el))
    .map(surface);
  const cutouts = surfaces.filter(({ el, corners }) => {
    const s = getComputedStyle(el!);
    return corners.some((corner) => corner.x >= 6 && corner.y >= 6) &&
      s.clipPath !== "none" && s.maskImage === "none" && s.backgroundImage === "none" &&
      Number(s.opacity) === 1 && s.filter === "none" && s.mixBlendMode === "normal" &&
      rgba(s.backgroundColor)[3] === 255;
  });
  for (const inner of surfaces) {
    if (!(inner.el instanceof HTMLElement) || !inner.corners.some((corner) => corner.x < 1 || corner.y < 1)) continue;
    for (const cutout of cutouts) {
      if (!(cutout.el instanceof HTMLElement) || !inner.el.contains(cutout.el) || inner === cutout) continue;
      if (![inner.rect.left - cutout.rect.left, inner.rect.top - cutout.rect.top, inner.rect.right - cutout.rect.right, inner.rect.bottom - cutout.rect.bottom].every((distance) => Math.abs(distance) < 0.5)) continue;
      const root = inner.el;
      const layer = cutout.el;
      const previous = [root, layer].map((el) => ({ el, style: el.getAttribute("style"), normalized: el.style.cssText, value: el.style.getPropertyValue("pointer-events"), priority: el.style.getPropertyPriority("pointer-events") }));
      try {
        root.style.setProperty("pointer-events", "auto", "important");
        layer.style.setProperty("pointer-events", "auto", "important");
        for (const [index, corner] of cutout.corners.entries()) {
          if (corner.x < 6 || corner.y < 6) continue;
          const left = index === 0 || index === 3;
          const top = index < 2;
          const point = (x: number, y: number) => document.elementFromPoint(
            left ? inner.rect.left + x * corner.x : inner.rect.right - x * corner.x,
            top ? inner.rect.top + y * corner.y : inner.rect.bottom - y * corner.y,
          );
          const outside = point(0.05, 0.05);
          const inside = point(0.5, 0.5);
          if (!outside || !layer.contains(outside) || !inside || layer.contains(inside) || !root.contains(inside) || (inside !== root && painted(inside))) continue;
          // Bracket the n=4 curve rather than trusting a radius the cutout may not draw.
          const x = 0.05;
          const edge = 1 - (1 - (1 - x) ** 4) ** 0.25;
          const tolerance = 0.75 / corner.y;
          const before = point(x, Math.max(0, edge - tolerance));
          const after = point(x, Math.min(1, edge + tolerance));
          const matches = Boolean(before && after && layer.contains(before) && !layer.contains(after) && root.contains(after) && (after === root || !painted(after)));
          inner.corners[index] = { ...corner, squircle: matches, cutoutMismatch: !matches };
          corner.squircle = matches;
        }
      } finally {
        for (const { el, style, normalized, value, priority } of previous) {
          if (value) el.style.setProperty("pointer-events", value, priority);
          else el.style.removeProperty("pointer-events");
          if (el.getAttribute("style") !== style && el.style.cssText === normalized) {
            if (style === null) el.removeAttribute("style");
            else el.setAttribute("style", style);
          }
        }
      }
    }
  }
  const nativeBounds = windowBounds ?? (windowInsets
    ? { x: -windowInsets.left, y: -windowInsets.top, width: innerWidth + windowInsets.left + windowInsets.right, height: innerHeight + windowInsets.top + windowInsets.bottom }
    : { x: 0, y: 0, width: innerWidth, height: innerHeight });
  const windowSurface: Surface | null = windowRadius === undefined ? null : {
    el: null,
    rect: new DOMRect(nativeBounds.x, nativeBounds.y, nativeBounds.width, nativeBounds.height),
    corners: names.map(({ name, key }) => ({ name, key, x: windowRadius, y: windowRadius, squircle: true })),
  };
  const clippedCorner = (inner: Surface, outer: Surface, index: number) => {
    if (outer.el && !outer.el.contains(inner.el!)) return false;
    const i = inner.rect;
    const o = outer.rect;
    const horizontal = index === 0 || index === 3 ? i.left - o.left : o.right - i.right;
    const vertical = index < 2 ? i.top - o.top : o.bottom - i.bottom;
    if (Math.abs(horizontal) > 1 || Math.abs(vertical) > 1) return false;
    if (outer.el) {
      const outside = getComputedStyle(outer.el);
      if (!(/hidden|clip/.test(outside.overflowX) && /hidden|clip/.test(outside.overflowY)) && outside.clipPath === "none") return false;
    }
    const own = getComputedStyle(inner.el!);
    return own.boxShadow === "none" && (own.outlineStyle === "none" || parseFloat(own.outlineWidth) === 0) &&
      (["Top", "Right", "Bottom", "Left"] as const).every((side) => own[`border${side}Style`] === "none" || parseFloat(own[`border${side}Width`]) === 0);
  };
  const issues: PageIssue[] = [];
  for (const inner of surfaces) {
    if (optedOut(inner.el!)) continue;
    const i = inner.rect;
    const outers = [...surfaces, ...(windowSurface ? [windowSurface] : [])]
      .filter((outer) => {
        if (outer === inner || (outer.el && optedOut(outer.el))) return false;
        const o = outer.rect;
        return i.left >= o.left - 1 && i.top >= o.top - 1 && i.right <= o.right + 1 && i.bottom <= o.bottom + 1 &&
          (outer.el === null || o.width > i.width + 0.5 || o.height > i.height + 0.5 || (outer.el.contains(inner.el!) && !inner.el!.contains(outer.el)));
      })
      .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
    const failures = new Map<Surface, string[]>();
    for (const [index, corner] of inner.corners.entries()) {
      for (const outer of outers) {
        const o = outer.rect;
        const oc = outer.corners[index]!;
        if (Math.min(oc.x, oc.y) < 6 || oc.x >= o.width / 2 - 0.5 || oc.y >= o.height / 2 - 0.5) continue;
        const left = index === 0 || index === 3;
        const top = index < 2;
        const dx = left ? i.left - o.left : o.right - i.right;
        const dy = top ? i.top - o.top : o.bottom - i.bottom;
        if (dx < -1 || dy < -1 || dx >= oc.x / 2 || dy >= oc.y / 2) continue;
        if (clippedCorner(inner, outer, index)) break;
        const wantX = Math.max(0, oc.x - Math.max(0, dx));
        const wantY = Math.max(0, oc.y - Math.max(0, dy));
        const wrongRadius = Math.abs(corner.x - wantX) > 1 || Math.abs(corner.y - wantY) > 1;
        if (wrongRadius || !corner.squircle || !oc.squircle) {
          const actual = Math.abs(corner.x - corner.y) < 0.5 ? `${Math.round(corner.x)}px` : `${Math.round(corner.x)}x${Math.round(corner.y)}px`;
          const expected = Math.abs(wantX - wantY) < 0.5 ? `${Math.round(wantX)}px` : `${Math.round(wantX)}x${Math.round(wantY)}px`;
          const shape = corner.cutoutMismatch ? "; the painted cutout does not match its stated squircle radius" : !oc.squircle || !corner.squircle ? "; both corners must be squircles" : "";
          const details = failures.get(outer) ?? [];
          details.push(`${corner.name}: ${actual}, expected ${expected}${shape}`);
          failures.set(outer, details);
        }
        break;
      }
    }
    for (const [outer, details] of failures) {
      issues.push({
        ref: ref(inner.el!),
        rule: "corners-nest",
        element: `${describe(inner.el!)} in ${outer.el ? describe(outer.el) : "the native window"}`,
        detail: `${details.join("; ")}: use the outer radius less the inset`,
      });
    }
  }
  return issues;
}
