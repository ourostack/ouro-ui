export { findSquirclePaint };
export type { PaintCapture, PaintClip };

import type { PageIssue } from "./size-check.ts";

/** A rectangle in viewport CSS pixels. */
interface PaintClip { x: number; y: number; width: number; height: number }
/** Captures the whole rectangle as a base64 PNG or data URL, at a consistent pixel scale. */
type PaintCapture = (clip: PaintClip) => Promise<string>;

// Runs in the page. The host supplies __ouroPaintCapture, which returns a PNG of the requested viewport rectangle.
async function findSquirclePaint(): Promise<PageIssue[]> {
  type Corner = { x: number; y: number; squircle: boolean };
  type Saved = { value: string; priority: string };
  type InlineElement = Element & { style: CSSStyleDeclaration };
  const capture = (window as unknown as { __ouroPaintCapture?: PaintCapture }).__ouroPaintCapture;
  let pixelIndex = 0;
  if (!capture) throw new Error("squircle-paint needs a screenshot capture supplied by its host");
  const names = [
    { key: "tl", property: "TopLeft", shape: "top-left" },
    { key: "tr", property: "TopRight", shape: "top-right" },
    { key: "br", property: "BottomRight", shape: "bottom-right" },
    { key: "bl", property: "BottomLeft", shape: "bottom-left" },
  ] as const;
  const counter = window as unknown as { __ouroCheckRef?: number };
  const nextRef = () => counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
  const ref = (el: Element) => {
    const id = `p${nextRef()}`;
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
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
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
  const notchedBadges = (el: HTMLElement, siblings: HTMLElement[], bounds: DOMRect, initial: NonNullable<ReturnType<typeof geometry>>, hasOutline: boolean) => {
    const sameBox = (rect: DOMRect) =>
      [rect.left - bounds.left, rect.top - bounds.top, rect.right - bounds.right, rect.bottom - bounds.bottom].every((distance) => Math.abs(distance) < 0.5);
    const candidates = [...el.querySelectorAll("*"), ...siblings].filter((candidate): candidate is HTMLElement => {
      if (!(candidate instanceof HTMLElement)) return false;
      const rect = candidate.getBoundingClientRect();
      if (rect.width < 2 || Math.abs(rect.width - rect.height) > 0.5 || rect.width > Math.min(bounds.width, bounds.height) / 2) return false;
      if (rect.right <= bounds.left || rect.left >= bounds.right || rect.bottom <= bounds.top || rect.top >= bounds.bottom) return false;
      if (!initial.corners.some((corner, index) => {
        if (!corner.squircle) return false;
        const width = corner.x * bounds.width / initial.width;
        const height = corner.y * bounds.height / initial.height;
        const left = index === 0 || index === 3 ? bounds.left : bounds.right - width;
        const top = index < 2 ? bounds.top : bounds.bottom - height;
        return rect.left < left + width && rect.right > left && rect.top < top + height && rect.bottom > top;
      })) return false;
      if (!visible(candidate)) return false;
      const style = getComputedStyle(candidate);
      return names.every(({ property }) => {
        const [x, y] = style[`border${property}Radius`].split(/\s+/);
        const length = (value: string, dimension: number) => value.endsWith("%") ? parseFloat(value) * dimension / 100 : parseFloat(value) || 0;
        return length(x!, candidate.offsetWidth) >= candidate.offsetWidth / 2 && length(y ?? x!, candidate.offsetHeight) >= candidate.offsetHeight / 2;
      });
    });
    if (candidates.length === 0) return [];
    if (!hasOutline && !hasPaint(el) &&
      ![...el.querySelectorAll("*"), ...siblings].some((other) => !candidates.some((candidate) => candidate.contains(other)) && visible(other) && hasPaint(other))) return candidates;
    const surfaces = [el, ...el.querySelectorAll<HTMLElement>("*")].flatMap((surface) => {
      if (!(surface instanceof HTMLElement) || !sameBox(surface.getBoundingClientRect()) || getComputedStyle(surface).clipPath === "none") return [];
      const shape = geometry(surface);
      return shape ? [{ surface, shape }] : [];
    });
    return candidates.filter((candidate) => {
      if (siblings.includes(candidate)) return true;
      const badge = candidate.getBoundingClientRect();
      const cx = (badge.left + badge.right) / 2;
      const cy = (badge.top + badge.bottom) / 2;
      const radius = badge.width / 2 + 0.5;
      return surfaces.some(({ surface, shape }) => {
        const inside = (x: number, y: number) => {
          const localX = (x - bounds.left) * shape.width / bounds.width;
          const localY = (y - bounds.top) * shape.height / bounds.height;
          if (localX < 0 || localY < 0 || localX >= shape.width || localY >= shape.height) return false;
          return shape.corners.every((corner, index) => {
            if (!corner.squircle) return true;
            const dx = (corner.x - (index === 0 || index === 3 ? localX : shape.width - localX)) / corner.x;
            const dy = (corner.y - (index < 2 ? localY : shape.height - localY)) / corner.y;
            return dx <= 0 || dy <= 0 || dx ** 4 + dy ** 4 <= 1;
          });
        };
        const points = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-0.707, -0.707], [0.707, -0.707], [0.707, 0.707], [-0.707, 0.707]]
          .map(([x, y]) => [cx + x! * radius, cy + y! * radius] as const)
          .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && inside(x, y));
        if (points.length < 3) return false;
        const original = surface.getAttribute("style");
        const normalized = surface.style.cssText;
        const prior = save(surface, "pointer-events");
        try {
          surface.style.setProperty("pointer-events", "auto", "important");
          return points.every(([x, y]) => !document.elementsFromPoint(x, y).includes(surface));
        } finally {
          restore(surface, "pointer-events", prior);
          restoreStyle(surface, original, normalized);
        }
      });
    });
  };
  // Clip each layer to the ideal n=4 curve, including paint extending beyond the box.
  const clipPath = (regions: { width: number; height: number; corners: Corner[]; offsetX: number; offsetY: number }[]) => {
    const path = regions.map(({ width, height, corners, offsetX, offsetY }) => {
      const [tl, tr, br, bl] = [corners[0]!, corners[1]!, corners[2]!, corners[3]!];
      const n = (value: number) => Number(value.toFixed(4));
      const x = (value: number) => n(value + offsetX);
      const y = (value: number) => n(value + offsetY);
      const [w, h] = [width, height];
      return [
        `M ${x(0)} ${y(tl.y)}`,
        `C ${x(0)} ${y(0.613 * tl.y)} ${x(-0.0092 * tl.x)} ${y(0.3274 * tl.y)} ${x(0.1591 * tl.x)} ${y(0.1591 * tl.y)}`,
        `C ${x(0.3274 * tl.x)} ${y(-0.0092 * tl.y)} ${x(0.613 * tl.x)} ${y(0)} ${x(tl.x)} ${y(0)}`,
        `H ${x(w - tr.x)}`,
        `C ${x(w - 0.613 * tr.x)} ${y(0)} ${x(w - 0.3274 * tr.x)} ${y(-0.0092 * tr.y)} ${x(w - 0.1591 * tr.x)} ${y(0.1591 * tr.y)}`,
        `C ${x(w + 0.0092 * tr.x)} ${y(0.3274 * tr.y)} ${x(w)} ${y(0.613 * tr.y)} ${x(w)} ${y(tr.y)}`,
        `V ${y(h - br.y)}`,
        `C ${x(w)} ${y(h - 0.613 * br.y)} ${x(w + 0.0092 * br.x)} ${y(h - 0.3274 * br.y)} ${x(w - 0.1591 * br.x)} ${y(h - 0.1591 * br.y)}`,
        `C ${x(w - 0.3274 * br.x)} ${y(h + 0.0092 * br.y)} ${x(w - 0.613 * br.x)} ${y(h)} ${x(w - br.x)} ${y(h)}`,
        `H ${x(bl.x)}`,
        `C ${x(0.613 * bl.x)} ${y(h)} ${x(0.3274 * bl.x)} ${y(h + 0.0092 * bl.y)} ${x(0.1591 * bl.x)} ${y(h - 0.1591 * bl.y)}`,
        `C ${x(-0.0092 * bl.x)} ${y(h - 0.3274 * bl.y)} ${x(0)} ${y(h - 0.613 * bl.y)} ${x(0)} ${y(h - bl.y)}`,
        "Z",
      ].join(" ");
    }).join(" ");
    return `path("${path}")`;
  };
  const pixels = async (data: string) => {
    const comma = data.indexOf(",");
    const url = data.startsWith("data:");
    const content = url ? data.slice(comma + 1) : data;
    const binary = url && !/;base64$/i.test(data.slice(0, comma))
      ? content.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      : atob(content);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    image.close();
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
  };
  const differences = async (actual: string, masked: string, hidden: string, solo: string | null, withoutBadges: string | null, badges: DOMRect[], withoutStrokes: string | null, strokePads: { x: number; y: number }[], clip: PaintClip, rect: DOMRect, width: number, height: number, corners: Corner[], native: boolean, otherFragments: DOMRect[], fragmented: boolean, attributable: (x: number, y: number) => boolean, restored: string | null = null, withoutEffects: string | null = null, roundedEffects: boolean[] = []) => {
    const [a, b, c, own, noBadges, noStrokes, stable, noEffects] = await Promise.all([pixels(actual), pixels(masked), pixels(hidden), solo ? pixels(solo) : null, withoutBadges ? pixels(withoutBadges) : null, withoutStrokes ? pixels(withoutStrokes) : null, restored ? pixels(restored) : null, withoutEffects ? pixels(withoutEffects) : null]);
    if (a.width !== b.width || a.height !== b.height || a.width !== c.width || a.height !== c.height || (own && (a.width !== own.width || a.height !== own.height)) || (noBadges && (a.width !== noBadges.width || a.height !== noBadges.height)) || (noStrokes && (a.width !== noStrokes.width || a.height !== noStrokes.height)) || (stable && (a.width !== stable.width || a.height !== stable.height)) || (noEffects && (a.width !== noEffects.width || a.height !== noEffects.height))) {
      throw new Error("squircle-paint screenshots changed size during measurement");
    }
    if (![1, window.devicePixelRatio].some((scale) =>
      Math.abs(a.width - clip.width * scale) <= 1 && Math.abs(a.height - clip.height * scale) <= 1,
    )) {
      throw new Error(`squircle-paint capture must cover the requested clip at CSS or device pixel scale: requested ${clip.width}x${clip.height} at ${window.devicePixelRatio}x, received ${a.width}x${a.height}`);
    }
    const guardX = Math.max(1, Math.ceil(a.width / clip.width * 0.75));
    const guardY = Math.max(1, Math.ceil(a.height / clip.height * 0.75));
    const difference = (first: Uint8ClampedArray, second: Uint8ClampedArray, index: number) => Math.max(
      Math.abs(first[index]! - second[index]!),
      Math.abs(first[index + 1]! - second[index + 1]!),
      Math.abs(first[index + 2]! - second[index + 2]!),
      Math.abs(first[index + 3]! - second[index + 3]!),
    );
    for (const [cornerIndex, corner] of corners.entries()) {
      if (!corner.squircle) continue;
      const left = cornerIndex === 0 || cornerIndex === 3;
      const top = cornerIndex < 2;
      const cornerX = left ? rect.left + corner.x * rect.width / width : rect.right - corner.x * rect.width / width;
      const cornerY = top ? rect.top + corner.y * rect.height / height : rect.bottom - corner.y * rect.height / height;
      const pixelX = (cornerX - clip.x) * a.width / clip.width;
      const pixelY = (cornerY - clip.y) * a.height / clip.height;
      const startX = left ? 0 : Math.max(0, Math.floor(pixelX));
      const endX = left ? Math.min(a.width, Math.ceil(pixelX)) : a.width;
      const startY = top ? 0 : Math.max(0, Math.floor(pixelY));
      const endY = top ? Math.min(a.height, Math.ceil(pixelY)) : a.height;
      let previous = new Uint8Array(a.width);
      for (let y = startY; y < endY; y++) {
        const row = new Uint8Array(a.width);
        for (let x = startX; x < endX; x++) {
          const index = (y * a.width + x) * 4;
          if (stable && difference(a.data, stable.data, index) >= 2) continue;
          const px = clip.x + (x + 0.5) * clip.width / a.width;
          const py = clip.y + (y + 0.5) * clip.height / a.height;
          if (otherFragments.some((other) => px >= other.left && px < other.right && py >= other.top && py < other.bottom)) continue;
          const dx = (left ? cornerX - px : px - cornerX) / (corner.x * rect.width / width);
          const dy = (top ? cornerY - py : py - cornerY) / (corner.y * rect.height / height);
          if (dx <= 0 || dy <= 0 || dx ** 4 + dy ** 4 <= 1) continue;
          if (fragmented) {
            const insideX = dx - clip.width / a.width / 2 / (corner.x * rect.width / width);
            const insideY = dy - clip.height / a.height / 2 / (corner.y * rect.height / height);
            if (insideX <= 0 || insideY <= 0 || insideX ** 4 + insideY ** 4 <= 1) continue;
          }
          const outsideX = px < rect.left || px >= rect.right;
          const outsideY = py < rect.top || py >= rect.bottom;
          const outsideCorner = outsideX || outsideY;
          // A separate rounded badge or detached indicator is not paint from the surface.
          if (noBadges && difference(a.data, noBadges.data, index) >= 2 && difference(noBadges.data, c.data, index) < 2 && badges.some((badge) => {
            const radius = Math.min(badge.width, badge.height) / 2;
            const dx = Math.max(0, Math.abs(px - (badge.left + badge.right) / 2) - (badge.width / 2 - radius));
            const dy = Math.max(0, Math.abs(py - (badge.top + badge.bottom) / 2) - (badge.height / 2 - radius));
            const pixelRadius = Math.hypot(clip.width / a.width, clip.height / a.height) / 2;
            return dx * dx + dy * dy <= (radius + pixelRadius) ** 2;
          })) continue;
          // A pixel straddling the box edge can contain the surface's own antialiasing, even when its centre is inside.
          const edgeX = Math.min(Math.abs(px - rect.left), Math.abs(px - rect.right)) <= clip.width / a.width / 2 + 0.001;
          const edgeY = Math.min(Math.abs(py - rect.top), Math.abs(py - rect.bottom)) <= clip.height / a.height / 2 + 0.001;
          if ((outsideX && edgeX) || (outsideY && edgeY) || (own && difference(a.data, own.data, index) < 2 && (edgeX || edgeY))) continue;
          const delta = difference(a.data, fragmented ? c.data : own && (native || outsideCorner) ? own.data : outsideCorner ? c.data : b.data, index);
          const behind = difference(b.data, c.data, index);
          if (delta < 2 || (!fragmented && !outsideCorner && behind > 4)) continue;
          if (noEffects && roundedEffects[cornerIndex] && difference(a.data, noEffects.data, index) >= 2 && difference(noEffects.data, c.data, index) < 2) continue;
          if (outsideCorner && difference(a.data, c.data, index) < 2) continue;
          if (!fragmented && outsideCorner && difference(a.data, b.data, index) < 2) continue;
          if (own && noStrokes && difference(a.data, noStrokes.data, index) >= 2 && difference(noStrokes.data, own.data, index) < 2 &&
            strokePads.some((pad) => {
              const dx = (left ? cornerX - px : px - cornerX) / (corner.x * rect.width / width + pad.x);
              const dy = (top ? cornerY - py : py - cornerY) / (corner.y * rect.height / height + pad.y);
              return dx ** 4 + dy ** 4 <= 1;
            })) continue;
          if (!fragmented && !outsideCorner) {
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
          if (outsideCorner && !attributable(px, py)) continue;
          if (delta >= 64 || (x > startX && row[x - 1]) || previous[x]) {
            pixelIndex = index;
            return { corner: cornerIndex, x: Math.round(px - rect.left), y: Math.round(py - rect.top) };
          }
          row[x] = 1;
        }
        previous = row;
      }
    }
    return null;
  };
  const save = (el: InlineElement, property: string): Saved => ({ value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) });
  const restore = (el: InlineElement, property: string, saved: Saved) => {
    if (saved.value) el.style.setProperty(property, saved.value, saved.priority);
    else el.style.removeProperty(property);
  };
  const restoreStyle = (el: InlineElement, original: string | null, normalized: string) => {
    if (el.getAttribute("style") !== original && el.style.cssText === normalized) {
      if (original === null) el.removeAttribute("style");
      else el.setAttribute("style", original);
    }
  };
  const hasInlineStyle = (el: Element): el is InlineElement => "style" in el && el.style instanceof CSSStyleDeclaration;
  const inverseCutout = (el: HTMLElement, shape: NonNullable<ReturnType<typeof geometry>>) => {
    if (getComputedStyle(el).clipPath === "none") return false;
    const rect = el.getBoundingClientRect();
    const original = el.getAttribute("style");
    const normalized = el.style.cssText;
    const previous = save(el, "pointer-events");
    try {
      el.style.setProperty("pointer-events", "auto", "important");
      return shape.corners.some((corner, index) => {
        if (!corner.squircle) return false;
        const left = index === 0 || index === 3;
        const top = index < 2;
        const x = corner.x * rect.width / shape.width;
        const y = corner.y * rect.height / shape.height;
        const hit = (fraction: number) => {
          const px = left ? rect.left + fraction * x : rect.right - fraction * x;
          const py = top ? rect.top + fraction * y : rect.bottom - fraction * y;
          if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) return null;
          return document.elementsFromPoint(px, py).includes(el);
        };
        return hit(0.05) === true && hit(0.5) === false;
      });
    } finally {
      restore(el, "pointer-events", previous);
      restoreStyle(el, original, normalized);
    }
  };
  const colorContext = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const alpha = (color: string) => {
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = color;
    colorContext.fillRect(0, 0, 1, 1);
    return colorContext.getImageData(0, 0, 1, 1).data[3]!;
  };
  const opaque = (color: string) => alpha(color) === 255;
  const hasPaint = (element: Element, corner?: number) => {
    if (element.matches("img, video, canvas, svg")) return true;
    const paintedStyle = (style: CSSStyleDeclaration) => {
      if (style.backgroundImage !== "none" || alpha(style.backgroundColor) > 0 || style.boxShadow !== "none" ||
        (style.backdropFilter || "none") !== "none") return true;
      if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && alpha(style.outlineColor) > 0) return true;
      const sides = corner === undefined ? ["Top", "Right", "Bottom", "Left"] as const :
        [corner < 2 ? "Top" : "Bottom", corner === 0 || corner === 3 ? "Left" : "Right"] as const;
      return sides.some((side) =>
        style[`border${side}Style`] !== "none" && parseFloat(style[`border${side}Width`]) > 0 && alpha(style[`border${side}Color`]) > 0,
      );
    };
    if (paintedStyle(getComputedStyle(element))) return true;
    return ["::before", "::after"].some((pseudo) => {
      const style = getComputedStyle(element, pseudo);
      return style.content !== "none" && style.content !== "normal" && paintedStyle(style);
    });
  };
  const round = (element: HTMLElement) => {
    const radius = Math.min(element.offsetWidth, element.offsetHeight) / 2;
    if (radius < 1) return false;
    const style = getComputedStyle(element);
    const length = (value: string, dimension: number) => value.endsWith("%") ? parseFloat(value) * dimension / 100 : parseFloat(value) || 0;
    return names.every(({ property }) => {
      const [x, y = x] = style[`border${property}Radius`].split(/\s+/);
      return length(x!, element.offsetWidth) >= radius && length(y!, element.offsetHeight) >= radius;
    });
  };
  const issues: PageIssue[] = [];
  const targets = [document.documentElement, document.body, ...document.body.querySelectorAll<HTMLElement>("*")]
    .filter((el) => !el.closest("svg, script, style, template") && !optedOut(el) && visible(el));
  const svgLayers = [...document.querySelectorAll<SVGSVGElement>("svg")].filter((svg) => visible(svg) && !optedOut(svg));
  for (const el of targets) {
    if (!el.hasAttribute("data-corner-debug")) continue;
    const initial = geometry(el);
    if (!initial || inverseCutout(el, initial)) continue;
    const bounds = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const transform = style.transform;
    const ownEffects = style.boxShadow !== "none" || style.outlineStyle !== "none";
    const scaleX = bounds.width / initial.width;
    const scaleY = bounds.height / initial.height;
    const siblings = [...(el.parentElement?.children ?? [])].filter((other): other is HTMLElement => {
      if (!(other instanceof HTMLElement) || other === el || !visible(other)) return false;
      const rect = other.getBoundingClientRect();
      if (!other.offsetWidth || !other.offsetHeight || getComputedStyle(other).transform !== transform ||
        Math.abs(rect.width / other.offsetWidth - scaleX) > 0.01 || Math.abs(rect.height / other.offsetHeight - scaleY) > 0.01) return false;
      const sameBox = [rect.left - bounds.left, rect.top - bounds.top, rect.right - bounds.right, rect.bottom - bounds.bottom].every((distance) => Math.abs(distance) < 0.5);
      const otherGeometry = geometry(other);
      if (otherGeometry) {
        const sameCorners = initial.corners.every((corner, index) => {
          const otherCorner = otherGeometry.corners[index]!;
          return corner.squircle === otherCorner.squircle && Math.abs(corner.x - otherCorner.x) < 0.5 && Math.abs(corner.y - otherCorner.y) < 0.5;
        });
        if (!sameBox || sameCorners) return false;
      }
      if (sameBox) return true;
      if (rect.width > bounds.width + 0.5 || rect.height > bounds.height + 0.5) return false;
      return initial.corners.some((corner, index) => {
        if (!corner.squircle) return false;
        const left = index === 0 || index === 3 ? bounds.left : bounds.right - corner.x * scaleX;
        const top = index < 2 ? bounds.top : bounds.bottom - corner.y * scaleY;
        return rect.left < left + corner.x * scaleX && rect.right > left && rect.top < top + corner.y * scaleY && rect.bottom > top;
      });
    });
    const outlines = svgLayers.filter((svg) => {
      if (el.contains(svg)) return false;
      const rect = svg.getBoundingClientRect();
      const svgStyle = getComputedStyle(svg);
      const width = parseFloat(svgStyle.width);
      const height = parseFloat(svgStyle.height);
      return width > 0 && height > 0 &&
        [rect.left - bounds.left, rect.top - bounds.top, rect.right - bounds.right, rect.bottom - bounds.bottom].every((distance) => Math.abs(distance) < 0.5);
    });
    const surfaceLayers = [...el.querySelectorAll("*"), ...siblings, ...outlines].filter(visible);
    const independent = surfaceLayers.filter((other): other is HTMLElement => {
      if (!(other instanceof HTMLElement)) return false;
      if (geometry(other) !== null && hasPaint(other)) return true;
      return !hasPaint(el) && Math.abs(other.offsetWidth - other.offsetHeight) > 0.5 &&
        round(other) && (hasPaint(other) || [...other.querySelectorAll("*")].some((child) => hasPaint(child)));
    });
    const suppliesCorner = (other: Element, corner: Corner, index: number) => {
      const rect = other.getBoundingClientRect();
      if ([rect.left - bounds.left, rect.top - bounds.top, rect.right - bounds.right, rect.bottom - bounds.bottom].every((distance) => Math.abs(distance) < 0.5)) return true;
      if (rect.left >= bounds.left - 0.5 && rect.top >= bounds.top - 0.5 && rect.right <= bounds.right + 0.5 && rect.bottom <= bounds.bottom + 0.5) return false;
      const left = index === 0 || index === 3 ? bounds.left : bounds.right - corner.x * scaleX;
      const top = index < 2 ? bounds.top : bounds.bottom - corner.y * scaleY;
      return rect.left < left + corner.x * scaleX && rect.right > left && rect.top < top + corner.y * scaleY && rect.bottom > top;
    };
    for (const [index, corner] of initial.corners.entries()) {
      if (corner.squircle && !hasPaint(el, index) && !surfaceLayers.some((other) =>
        !independent.some((surface) => surface.contains(other)) && suppliesCorner(other, corner, index) && hasPaint(other, index),
      )) corner.squircle = false;
    }
    if (!initial.corners.some((corner) => corner.squircle)) continue;
    const strokes = outlines.flatMap((svg) => [...svg.querySelectorAll<SVGGraphicsElement>("path, rect, circle, ellipse, line, polyline, polygon, use")].flatMap((node) => {
      const stroke = getComputedStyle(node);
      const width = parseFloat(stroke.strokeWidth);
      const matrix = node.getScreenCTM();
      if (stroke.fill !== "none" || stroke.stroke === "none" || !(width > 0) || !matrix) return [];
      const nonScaling = stroke.vectorEffect === "non-scaling-stroke";
      return [{
        node,
        x: width / 2 * (nonScaling ? 1 : Math.hypot(matrix.a, matrix.c)) + 1,
        y: width / 2 * (nonScaling ? 1 : Math.hypot(matrix.b, matrix.d)) + 1,
      }];
    }));
    const layers = [el, ...siblings, ...outlines].map((layer) => ({
      el: layer,
      originalStyle: layer.getAttribute("style"),
      normalizedStyle: layer.style.cssText,
      saved: new Map(["clip-path", "opacity", "box-shadow", "outline", "transition"].map((property) => [property, save(layer, property)])),
    }));
    const covers = (other: HTMLElement, rect: DOMRect) => {
      const box = other.getBoundingClientRect();
      if (![box.left - rect.left, box.top - rect.top, box.right - rect.right, box.bottom - rect.bottom].every((distance) => Math.abs(distance) < 0.5)) return false;
      const otherStyle = getComputedStyle(other);
      const opaqueCover = Number(otherStyle.opacity) === 1 && otherStyle.clipPath === "none" && otherStyle.maskImage === "none" && otherStyle.filter === "none" && otherStyle.mixBlendMode === "normal" &&
        otherStyle.backgroundImage === "none" && otherStyle.backgroundClip === "border-box" &&
        names.every(({ property }) => parseFloat(otherStyle[`border${property}Radius`]) === 0) && opaque(otherStyle.backgroundColor);
      if (!opaqueCover) return false;
      const ownStyle = el.getAttribute("style")!;
      const siblingStyle = other.getAttribute("style")!;
      const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
      const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
      try {
        el.style.setProperty("pointer-events", "auto", "important");
        other.style.setProperty("pointer-events", "auto", "important");
        return other.contains(document.elementFromPoint(x, y));
      } finally {
        el.setAttribute("style", ownStyle);
        other.setAttribute("style", siblingStyle);
      }
    };
    const scroll = [...function* () { for (let n = el.parentElement; n; n = n.parentElement) yield n; }()]
      .map((node) => ({ node, left: node.scrollLeft, top: node.scrollTop }));
    const windowScroll = { x: scrollX, y: scrollY };
    let found: { corner: number; x: number; y: number } | null = null;
    try {
      for (const layer of layers) layer.el.style.setProperty("transition", "none", "important");
      const blocks: ScrollLogicalPosition[] = el.getBoundingClientRect().height > innerHeight ? ["start", "end"] : ["nearest"];
      const inlines: ScrollLogicalPosition[] = el.getBoundingClientRect().width > innerWidth ? ["start", "end"] : ["nearest"];
      for (const block of blocks) {
        for (const inline of inlines) {
          el.scrollIntoView({ block, inline, behavior: "instant" });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const r = el.getBoundingClientRect();
          const margin = 32;
          // Screenshots round fractional clips; integral bounds keep their pixels aligned to the viewport.
          const x = Math.max(0, Math.floor(r.left - margin));
          const y = Math.max(0, Math.floor(r.top - margin));
          const clip = { x, y, width: Math.min(Math.ceil(r.right + margin), innerWidth) - x, height: Math.min(Math.ceil(r.bottom + margin), innerHeight) - y };
          if (clip.width < 1 || clip.height < 1) continue;
          const active = layers.filter((layer) => layer.el === el || !(layer.el instanceof HTMLElement) || !covers(layer.el, r));
          const sources = [...new Set(active.flatMap((layer) => [layer.el, ...layer.el.querySelectorAll("*")]))].filter(visible);
          const sourceRects = sources.map((source) => source.getBoundingClientRect());
          let hasEscapingEffect: boolean | undefined;
          let hasPseudo = false;
          let blockedHit = false;
          let stopHit: (() => void) | undefined;
          const attributable = (px: number, py: number) => {
            if (sourceRects.some((rect) => {
              return px >= rect.left - 0.5 && px < rect.right + 0.5 && py >= rect.top - 0.5 && py < rect.bottom + 0.5;
            })) return true;
            const escaping = (computed: CSSStyleDeclaration) =>
              computed.boxShadow !== "none" || computed.outlineStyle !== "none" ||
              (computed.filter || "none") !== "none" || (computed.textShadow || "none") !== "none" ||
              computed.borderImageOutset.split(/\s+/).some((value) => parseFloat(value) > 0);
            if (hasEscapingEffect === undefined) {
              hasEscapingEffect = false;
              for (const source of sources) {
                const computed = getComputedStyle(source);
                if (computed.display === "list-item" || escaping(computed)) hasEscapingEffect = true;
                for (const pseudo of ["::before", "::after"]) {
                  const style = getComputedStyle(source, pseudo);
                  if (style.content === "none" || style.content === "normal") continue;
                  hasPseudo = true;
                  if (escaping(style)) hasEscapingEffect = true;
                }
              }
            }
            if (hasEscapingEffect) return true;
            if (!hasPseudo) return false;
            if (!stopHit) {
              const attribute = "data-ouro-paint-hit";
              const marker = `h${nextRef()}`;
              const saved = active.map(({ el }) => ({ el, value: el.getAttribute(attribute) }));
              const selector = `[${attribute}="${marker}"]`;
              const sheet = new CSSStyleSheet();
              sheet.replaceSync(`${selector}, ${selector} *, ${selector}::before, ${selector}::after, ${selector} *::before, ${selector} *::after { pointer-events: auto !important; }`);
              stopHit = () => {
                document.adoptedStyleSheets = document.adoptedStyleSheets.filter((current) => current !== sheet);
                for (const { el, value } of saved) {
                  if (value === null) el.removeAttribute(attribute);
                  else el.setAttribute(attribute, value);
                }
              };
              for (const { el } of saved) el.setAttribute(attribute, marker);
              document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
              blockedHit = sources.some((source) => {
                if (getComputedStyle(source).pointerEvents === "none") return true;
                return ["::before", "::after"].some((pseudo) => {
                  const style = getComputedStyle(source, pseudo);
                  return style.content !== "none" && style.content !== "normal" && style.pointerEvents === "none";
                });
              });
            }
            return blockedHit || document.elementsFromPoint(px, py).some((node) => active.some((layer) => layer.el.contains(node)));
          };
          const effectLayers = active.filter((layer) => {
            const computed = getComputedStyle(layer.el);
            return computed.boxShadow !== "none" || computed.outlineStyle !== "none";
          });
          const rectangles = style.display === "inline" ? [...el.getClientRects()].filter((rect) => rect.width >= 2 && rect.height >= 2) : [];
          const fragmented = rectangles.length > 1;
          const horizontal = style.writingMode.startsWith("horizontal");
          const reverse = style.direction === "rtl";
          const cloned = style.boxDecorationBreak === "clone" || style.getPropertyValue("-webkit-box-decoration-break") === "clone";
          const start = horizontal ? (reverse ? [1, 2] : [0, 3]) : (reverse ? [2, 3] : [0, 1]);
          const end = horizontal ? (reverse ? [0, 3] : [1, 2]) : (reverse ? [0, 1] : [2, 3]);
          const fragments = (fragmented ? rectangles : [r]).map((rect, index, all) => {
            const corners = initial.corners.map((corner, cornerIndex) => {
              const present = !fragmented || cloned ||
                (index === 0 && start.includes(cornerIndex)) || (index === all.length - 1 && end.includes(cornerIndex));
              return present ? { ...corner } : { ...corner, x: 0, y: 0, squircle: false };
            });
            const width = fragmented ? rect.width / scaleX : initial.width;
            const height = fragmented ? rect.height / scaleY : initial.height;
            const [tl, tr, br, bl] = [corners[0]!, corners[1]!, corners[2]!, corners[3]!];
            const factor = Math.min(1, width / Math.max(1, tl.x + tr.x), width / Math.max(1, bl.x + br.x), height / Math.max(1, tl.y + bl.y), height / Math.max(1, tr.y + br.y));
            for (const corner of corners) { corner.x *= factor; corner.y *= factor; }
            return { rect, width, height, corners };
          });
          for (let attempt = 0; attempt < 2; attempt++) {
            const captureSolo = async () => {
              // Compare with the surface alone to separate its own shadow or outline from another layer's paint.
              const attribute = "data-ouro-paint-solo";
              const previous = el.getAttribute(attribute);
              const marker = `p${nextRef()}`;
              const probe = new CSSStyleSheet();
              probe.replaceSync(`[${attribute}="${marker}"] *, [${attribute}="${marker}"]::before, [${attribute}="${marker}"]::after { opacity: 0 !important; transition: none !important; }`);
              const originalStyle = el.getAttribute("style");
              const normalizedStyle = el.style.cssText;
              const radii = names.map(({ shape }) => ({ property: `border-${shape}-radius`, saved: save(el, `border-${shape}-radius`) }));
              const overrides = [...el.querySelectorAll("[style]")].flatMap((node) => {
                if (!hasInlineStyle(node)) return [];
                const opacity = node.style.getPropertyPriority("opacity") === "important";
                const transition = node.style.getPropertyPriority("transition-property") === "important";
                if (!opacity && !transition) return [];
                return [{
                  node, opacity, style: node.getAttribute("style")!, normalized: node.style.cssText,
                  savedOpacity: save(node, "opacity"), savedTransition: save(node, "transition-property"),
                  temporary: "",
                }];
              });
              try {
                for (const override of overrides) {
                  override.node.style.setProperty("transition-property", "none", "important");
                  if (override.opacity) override.node.style.setProperty("opacity", "0", "important");
                  override.temporary = override.node.getAttribute("style")!;
                }
                el.setAttribute(attribute, marker);
                document.adoptedStyleSheets = [...document.adoptedStyleSheets, probe];
                if (!initial.native) {
                  const computed = getComputedStyle(el);
                  const length = (value: string, dimension: number) => value.endsWith("%") ? parseFloat(value) * dimension / 100 : parseFloat(value) || 0;
                  for (const [index, corner] of initial.corners.entries()) {
                    if (!corner.squircle || corner.native) continue;
                    const raw = computed.getPropertyValue(`--sq-${names[index]!.key}`).trim();
                    const [currentX, currentY = currentX] = computed.getPropertyValue(radii[index]!.property).trim().split(/\s+/);
                    const x = length(raw, initial.width) * 0.543;
                    const y = length(raw, initial.height) * 0.543;
                    if (Math.abs(length(currentX!, initial.width) - x) > 0.5 || Math.abs(length(currentY!, initial.height) - y) > 0.5) {
                      el.style.setProperty(radii[index]!.property, `${x}px ${y}px`, "important");
                    }
                  }
                }
                for (const layer of active.slice(1)) layer.el.style.setProperty("opacity", "0", "important");
                return await capture(clip);
              } finally {
                document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== probe);
                if (previous === null) el.removeAttribute(attribute);
                else el.setAttribute(attribute, previous);
                for (const { property, saved } of radii) restore(el, property, saved);
                restoreStyle(el, originalStyle, normalizedStyle);
                for (const override of overrides) {
                  if (override.node.getAttribute("style") === override.temporary || override.node.getAttribute("style") === override.style) {
                    override.node.setAttribute("style", override.style);
                  } else {
                    if (override.opacity) restore(override.node, "opacity", override.savedOpacity);
                    restore(override.node, "transition-property", override.savedTransition);
                    if (override.node.style.cssText === override.normalized) override.node.setAttribute("style", override.style);
                  }
                }
                for (const layer of active.slice(1)) restore(layer.el, "opacity", layer.saved.get("opacity")!);
              }
            };
            const actual = await capture(clip);
            // A mask can change how a browser composites the restored shadow, so take this reference first.
            let solo = ownEffects ? await captureSolo() : null;
            for (const layer of active) {
              const layerRect = layer.el.getBoundingClientRect();
              const layerStyle = getComputedStyle(layer.el);
              const layerWidth = layer.el instanceof HTMLElement ? layer.el.offsetWidth : parseFloat(layerStyle.width);
              const layerHeight = layer.el instanceof HTMLElement ? layer.el.offsetHeight : parseFloat(layerStyle.height);
              const layerScaleX = layerRect.width / layerWidth;
              const layerScaleY = layerRect.height / layerHeight;
              const regions = fragments.map((fragment) => {
                const x = scaleX / layerScaleX;
                const y = scaleY / layerScaleY;
                return {
                  width: fragment.width * x, height: fragment.height * y,
                  corners: fragment.corners.map((corner) => ({ ...corner, x: corner.x * x, y: corner.y * y })),
                  offsetX: (fragment.rect.left - layerRect.left) / layerScaleX,
                  offsetY: (fragment.rect.top - layerRect.top) / layerScaleY,
                };
              });
              layer.el.style.setProperty("clip-path", clipPath(regions), "important");
            }
            const masked = await capture(clip);
            for (const layer of active) layer.el.style.setProperty("opacity", "0", "important");
            const hidden = await capture(clip);
            for (const layer of active) {
              restore(layer.el, "opacity", layer.saved.get("opacity")!);
              restore(layer.el, "clip-path", layer.saved.get("clip-path")!);
            }
            const compare = async (withoutBadges: string | null, badges: DOMRect[], withoutStrokes: string | null, restored: string | null = null, withoutEffects: string | null = null, roundedEffects: boolean[] = []) => {
              try {
                for (const fragment of fragments) {
                  const otherFragments = fragments.filter((other) => other !== fragment).map((other) => other.rect);
                  const result = await differences(actual, masked, hidden, solo, withoutBadges, badges, withoutStrokes, strokes, clip, fragment.rect, fragment.width, fragment.height, fragment.corners, initial.native, otherFragments, fragmented, attributable, restored, withoutEffects, roundedEffects);
                  if (result) return { ...result, x: Math.round(result.x + fragment.rect.left - r.left), y: Math.round(result.y + fragment.rect.top - r.top) };
                }
                return null;
              } finally {
                stopHit?.();
                stopHit = undefined;
              }
            };
            let differs = await compare(null, [], null);
            if (differs && !solo) {
              solo = await captureSolo();
              differs = await compare(null, [], null);
            }
            let withoutEffects: string | null = null;
            let roundedEffects: boolean[] = [];
            if (differs && effectLayers.length) {
              const computed = getComputedStyle(el);
              const length = (value: string, dimension: number) => value.endsWith("%") ? parseFloat(value) * dimension / 100 : parseFloat(value) || 0;
              roundedEffects = initial.corners.map((corner, index) => effectLayers.every((layer) => {
                if (layer.el === el) {
                  if (corner.native) return true;
                  const raw = computed.getPropertyValue(`--sq-${names[index]!.key}`).trim();
                  const [x, y = x] = computed[`border${names[index]!.property}Radius`].split(/\s+/);
                  return Math.abs(length(x!, initial.width) - length(raw, initial.width) * 0.543) < 0.5 &&
                    Math.abs(length(y!, initial.height) - length(raw, initial.height) * 0.543) < 0.5;
                }
                const rect = layer.el.getBoundingClientRect();
                if (![rect.left - r.left, rect.top - r.top, rect.right - r.right, rect.bottom - r.bottom].every((distance) => Math.abs(distance) < 0.5)) return false;
                const layerStyle = getComputedStyle(layer.el);
                const width = layer.el instanceof HTMLElement ? layer.el.offsetWidth : parseFloat(layerStyle.width);
                const height = layer.el instanceof HTMLElement ? layer.el.offsetHeight : parseFloat(layerStyle.height);
                if (!(width > 0 && height > 0)) return false;
                const [x, y = x] = layerStyle[`border${names[index]!.property}Radius`].split(/\s+/);
                return length(x!, width) * rect.width / width + 0.5 >= corner.x * scaleX * 0.543 &&
                  length(y!, height) * rect.height / height + 0.5 >= corner.y * scaleY * 0.543;
              }));
              try {
                // Repaint the restored surface before removing effects; Chromium can otherwise capture the previous mask.
                await capture(clip);
                for (const layer of effectLayers) {
                  layer.el.style.setProperty("box-shadow", "none", "important");
                  layer.el.style.setProperty("outline", "none", "important");
                }
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                withoutEffects = await capture(clip);
              } finally {
                for (const layer of effectLayers) {
                  restore(layer.el, "box-shadow", layer.saved.get("box-shadow")!);
                  restore(layer.el, "outline", layer.saved.get("outline")!);
                }
              }
              differs = await compare(null, [], null, null, withoutEffects, roundedEffects);
            }
            let withoutStrokes: string | null = null;
            if (differs && strokes.length) {
              const saved = strokes.map(({ node }) => ({
                node,
                style: node.getAttribute("style"),
                normalized: node.style.cssText,
                opacity: save(node, "opacity"),
                transition: save(node, "transition"),
              }));
              try {
                for (const { node } of saved) {
                  node.style.setProperty("transition", "none", "important");
                  node.style.setProperty("opacity", "0", "important");
                }
                withoutStrokes = await capture(clip);
              } finally {
                for (const { node, style, normalized, opacity, transition } of saved) {
                  restore(node, "opacity", opacity);
                  restore(node, "transition", transition);
                  restoreStyle(node, style, normalized);
                }
              }
              differs = await compare(null, [], withoutStrokes, null, withoutEffects, roundedEffects);
            }
            let withoutBadges: string | null = null;
            let badgeRects: DOMRect[] = [];
            if (differs) {
              const detached = surfaceLayers.filter((other): other is HTMLElement => {
                if (!(other instanceof HTMLElement) || !hasPaint(other)) return false;
                const rect = other.getBoundingClientRect();
                if (!(rect.right <= r.left || rect.left >= r.right || rect.bottom <= r.top || rect.top >= r.bottom)) return false;
                const radius = Math.min(rect.width, rect.height) / 2;
                if (radius < 1) return false;
                const style = getComputedStyle(other);
                const length = (value: string, dimension: number) => value.endsWith("%") ? parseFloat(value) * dimension / 100 : parseFloat(value) || 0;
                return names.every(({ property }) => {
                  const [x, y = x] = style[`border${property}Radius`].split(/\s+/);
                  return length(x!, other.offsetWidth) >= radius && length(y!, other.offsetHeight) >= radius;
                });
              });
              const badges = [...new Set([...notchedBadges(el, siblings, r, initial, outlines.length > 0), ...detached])];
              if (badges.length) {
                const saved = badges.map((badge) => ({
                  badge,
                  style: badge.getAttribute("style"),
                  normalized: badge.style.cssText,
                  opacity: save(badge, "opacity"),
                  transition: save(badge, "transition"),
                }));
                try {
                  for (const { badge } of saved) {
                    badge.style.setProperty("transition", "none", "important");
                    badge.style.setProperty("opacity", "0", "important");
                  }
                  withoutBadges = await capture(clip);
                } finally {
                  for (const { badge, style, normalized, opacity, transition } of saved) {
                    restore(badge, "opacity", opacity);
                    restore(badge, "transition", transition);
                    restoreStyle(badge, style, normalized);
                  }
                }
                badgeRects = badges.map((badge) => badge.getBoundingClientRect());
                differs = await compare(withoutBadges, badgeRects, withoutStrokes, null, withoutEffects, roundedEffects);
              }
            }
            let changed = false;
            if (differs) {
              const restored = await capture(clip);
              differs = await compare(withoutBadges, badgeRects, withoutStrokes, restored, withoutEffects, roundedEffects);
              changed = !differs;
            }
            if (differs) {
              const rgba = (await Promise.all([actual, masked, hidden, ...(solo ? [solo] : [])].map(pixels))).map((image) => [...image.data.slice(pixelIndex, pixelIndex + 4)]);
              const computed = getComputedStyle(el);
              console.log("INLINE-CORNER", JSON.stringify({ point: differs, rgba, rect: r.toJSON(), clip, corners: initial.corners, fragments: fragments.map((fragment) => ({ ...fragment, rect: fragment.rect.toJSON() })), display: computed.display, decoration: computed.boxDecorationBreak, radius: computed.borderRadius, clipPath: computed.clipPath, background: computed.backgroundColor }));
              found = differs;
              break;
            }
            if (!changed) break;
          }
          if (found) break;
        }
        if (found) break;
      }
    } finally {
      for (const layer of layers) for (const [property, value] of layer.saved) restore(layer.el, property, value);
      for (const position of scroll) position.node.scrollTo({ left: position.left, top: position.top, behavior: "instant" });
      window.scrollTo({ left: windowScroll.x, top: windowScroll.y, behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (const layer of layers) restoreStyle(layer.el, layer.originalStyle, layer.normalizedStyle);
    }
    if (found) {
      const corner = ["top left", "top right", "bottom right", "bottom left"][found.corner]!;
      issues.push({ ref: ref(el), rule: "squircle-paint", element: describe(el), detail: `paint shows outside the ${corner} squircle corner at (${found.x}, ${found.y})` });
    }
  }
  return issues;
}
