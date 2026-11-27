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
  const clipPath = (width: number, height: number, corners: Corner[], offsetX: number, offsetY: number) => {
    const [tl, tr, br, bl] = corners as [Corner, Corner, Corner, Corner];
    const n = (value: number) => Number(value.toFixed(4));
    const x = (value: number) => n(value + offsetX);
    const y = (value: number) => n(value + offsetY);
    const [w, h] = [width, height];
    const path = [
      `M -10000 -10000 H ${w + 10000} V ${h + 10000} H -10000 Z`,
      `M ${x(0)} ${y(0)} H ${x(w)} V ${y(h)} H ${x(0)} Z`,
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
  const differences = async (actual: string, masked: string, hidden: string, solo: string | null, clip: PaintClip, rect: DOMRect, width: number, height: number, corners: Corner[], native: boolean) => {
    const [a, b, c, own] = await Promise.all([pixels(actual), pixels(masked), pixels(hidden), solo ? pixels(solo) : null]);
    if (a.width !== b.width || a.height !== b.height || a.width !== c.width || a.height !== c.height || (own && (a.width !== own.width || a.height !== own.height))) {
      throw new Error("squircle-paint screenshots changed size during measurement");
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
          const px = clip.x + (x + 0.5) * clip.width / a.width;
          const py = clip.y + (y + 0.5) * clip.height / a.height;
          const outsideX = px < rect.left || px >= rect.right;
          const outsideY = py < rect.top || py >= rect.bottom;
          const outsideCorner = outsideX || outsideY;
          const delta = difference(a.data, outsideCorner ? c.data : b.data, index);
          const behind = difference(b.data, c.data, index);
          if (delta < 2 || (!outsideCorner && behind > 4)) continue;
          if (own && (native || outsideCorner) && difference(a.data, own.data, index) < 2) continue;
          if (outsideCorner && difference(a.data, b.data, index) > 4) continue;
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
          if (delta >= 64 || (x > startX && row[x - 1]) || previous[x]) return true;
          row[x] = 1;
        }
        previous = row;
      }
    }
    return false;
  };
  const save = (el: HTMLElement, property: string): Saved => ({ value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) });
  const restore = (el: HTMLElement, property: string, saved: Saved) => {
    if (saved.value) el.style.setProperty(property, saved.value, saved.priority);
    else el.style.removeProperty(property);
  };
  const colorContext = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const opaque = (color: string) => {
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = color;
    colorContext.fillRect(0, 0, 1, 1);
    return colorContext.getImageData(0, 0, 1, 1).data[3] === 255;
  };
  const issues: PageIssue[] = [];
  const targets = [document.body, ...document.body.querySelectorAll<HTMLElement>("*")]
    .filter((el) => !el.closest("svg, script, style, template") && !optedOut(el) && visible(el));
  for (const el of targets) {
    const initial = geometry(el);
    if (!initial) continue;
    const bounds = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const transform = style.transform;
    const ownEffects = style.boxShadow !== "none" || style.outlineStyle !== "none";
    const scaleX = bounds.width / initial.width;
    const scaleY = bounds.height / initial.height;
    const siblings = [...el.parentElement!.children].filter((other): other is HTMLElement => {
      if (!(other instanceof HTMLElement) || other === el || !visible(other)) return false;
      const rect = other.getBoundingClientRect();
      if (!other.offsetWidth || !other.offsetHeight || getComputedStyle(other).transform !== transform ||
        Math.abs(rect.width / other.offsetWidth - scaleX) > 0.01 || Math.abs(rect.height / other.offsetHeight - scaleY) > 0.01) return false;
      if ([rect.left - bounds.left, rect.top - bounds.top, rect.right - bounds.right, rect.bottom - bounds.bottom].every((distance) => Math.abs(distance) < 0.5)) return true;
      if (rect.width > bounds.width + 0.5 || rect.height > bounds.height + 0.5) return false;
      return initial.corners.some((corner, index) => {
        if (!corner.squircle) return false;
        const left = index === 0 || index === 3 ? bounds.left : bounds.right - corner.x * scaleX;
        const top = index < 2 ? bounds.top : bounds.bottom - corner.y * scaleY;
        return rect.left < left + corner.x * scaleX && rect.right > left && rect.top < top + corner.y * scaleY && rect.bottom > top;
      });
    });
    const layers = [el, ...siblings].map((layer) => ({
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
    let found = false;
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
          const x = Math.max(0, r.left - margin);
          const y = Math.max(0, r.top - margin);
          const clip = { x, y, width: Math.min(r.right + margin, innerWidth) - x, height: Math.min(r.bottom + margin, innerHeight) - y };
          if (clip.width < 1 || clip.height < 1) continue;
          const active = layers.filter((layer) => layer.el === el || !covers(layer.el, r));
          const actual = await capture(clip);
          for (const layer of active) {
            const layerRect = layer.el.getBoundingClientRect();
            const offsetX = (r.left - layerRect.left) / scaleX;
            const offsetY = (r.top - layerRect.top) / scaleY;
            layer.el.style.setProperty("clip-path", clipPath(initial.width, initial.height, initial.corners, offsetX, offsetY), "important");
          }
          const masked = await capture(clip);
          for (const layer of active) layer.el.style.setProperty("opacity", "0", "important");
          const hidden = await capture(clip);
          for (const layer of active) {
            restore(layer.el, "opacity", layer.saved.get("opacity")!);
            restore(layer.el, "clip-path", layer.saved.get("clip-path")!);
          }
          const captureSolo = async () => {
            // Compare with the surface alone to separate its own shadow or outline from another layer's paint.
            const attribute = "data-ouro-paint-solo";
            const previous = el.getAttribute(attribute);
            counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
            const marker = `p${counter.__ouroCheckRef}`;
            const probe = document.createElement("style");
            probe.textContent = `[${attribute}="${marker}"] *, [${attribute}="${marker}"]::before, [${attribute}="${marker}"]::after { visibility: hidden !important; }`;
            try {
              el.setAttribute(attribute, marker);
              document.head.append(probe);
              for (const layer of active.slice(1)) layer.el.style.setProperty("opacity", "0", "important");
              return await capture(clip);
            } finally {
              probe.remove();
              if (previous === null) el.removeAttribute(attribute);
              else el.setAttribute(attribute, previous);
              for (const layer of active.slice(1)) restore(layer.el, "opacity", layer.saved.get("opacity")!);
            }
          };
          let solo = ownEffects ? await captureSolo() : null;
          let differs = await differences(actual, masked, hidden, solo, clip, r, initial.width, initial.height, initial.corners, initial.native);
          if (differs && !solo) {
            solo = await captureSolo();
            differs = await differences(actual, masked, hidden, solo, clip, r, initial.width, initial.height, initial.corners, initial.native);
          }
          if (differs) { found = true; break; }
        }
        if (found) break;
      }
    } finally {
      for (const layer of layers) for (const [property, value] of layer.saved) restore(layer.el, property, value);
      for (const position of scroll) position.node.scrollTo({ left: position.left, top: position.top, behavior: "instant" });
      window.scrollTo({ left: windowScroll.x, top: windowScroll.y, behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (const layer of layers) {
        const currentStyle = layer.el.getAttribute("style");
        if (currentStyle !== layer.originalStyle && layer.el.style.cssText === layer.normalizedStyle) {
          if (layer.originalStyle === null) layer.el.removeAttribute("style");
          else layer.el.setAttribute("style", layer.originalStyle);
        }
      }
    }
    if (found) issues.push({ ref: ref(el), rule: "squircle-paint", element: describe(el), detail: "paint shows outside the squircle's corner curve" });
  }
  return issues;
}
