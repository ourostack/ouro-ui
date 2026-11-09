export { findImageFades };

import type { PageIssue } from "./size-check.ts";

// Runs in the page (page.evaluate), so nothing in it may close over anything outside the function. check.ts holds pages
// to it at every size:
//
//   image-fade  a picture that fades into the page: an <img>, an SVG <image> or an element with a url() background
//               whose own box or a box around it has a gradient mask, or that a gradient between transparent and a
//               colour covers, a tenth of it or more: an absolutely positioned element over it, or an absolutely
//               positioned ::before or ::after of the picture or of a box around it, or a gradient layered over its own
//               url() background. A radial or conic gradient counts
//               only when it is opaque at its outer edge, as a vignette is: a glow that fades out adds light, and stays.
//               A picture ends on a hard edge, or sits on a solid band.
//
// A picture opts out with data-ouro-allow="image-fade" and data-ouro-allow-why="<reason>", or the plain alias
// data-image-fade-ok="<reason>", on itself or a box around it, and an overlay does on itself; an allow without a reason
// does not count.

function findImageFades(): PageIssue[] {
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (el: Element) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `f${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  // Read, never rewritten; a reason of spaces is no reason.
  const reasonOf = (el: Element, name: string) => (el.getAttribute(name) ?? "").trim();
  const optedOut = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const rules = reasonOf(n, "data-ouro-allow").split(/\s+/);
      if (reasonOf(n, "data-image-fade-ok") || ((rules.includes("image-fade") || rules.includes("all")) && reasonOf(n, "data-ouro-allow-why"))) return true;
    }
    return false;
  };
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}`;
  const shown = (el: Element) => {
    if (el.closest("[hidden], template")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) <= 0.05) return false;
    }
    return true;
  };
  // Whether a background fades what is under it into the page: a gradient between a fully transparent stop and one
  // that is not, however the browser writes the colour (`transparent`, rgba(…, 0) or a colour function's `/ 0`). A
  // linear gradient does at whichever end is opaque; a radial or conic one only when its outer stop is opaque, as a
  // vignette is, and not when it fades out, as a glow of light does.
  const fadesOut = (image: string) => {
    for (const [, kind, inner] of image.matchAll(/(linear|radial|conic)-gradient\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g)) {
      const stops = inner!.split(/,(?![^()]*\))/).filter((part) => /transparent|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\(|#[\da-f]/i.test(part));
      const clear = stops.map((stop) => /transparent|rgba\([^()]*,\s*0(?:\.0*)?\s*\)|\/\s*0(?:\.0*)?%?\s*\)/.test(stop));
      if (clear.includes(true) && clear.includes(false) && (kind === "linear" || !clear.at(-1))) return true;
    }
    return false;
  };
  // The fraction of `picture`'s area that `box` covers.
  const covered = (picture: DOMRect, box: { left: number; top: number; width: number; height: number }) => {
    const x = Math.max(0, Math.min(picture.right, box.left + box.width) - Math.max(picture.left, box.left));
    const y = Math.max(0, Math.min(picture.bottom, box.top + box.height) - Math.max(picture.top, box.top));
    return (x * y) / (picture.width * picture.height);
  };
  const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
  // Where an absolutely positioned pseudo-element of `el` is drawn. Its offsets and size read as used values in px, from
  // the padding box it is placed in: `el`'s own when `el` is positioned, else its offsetParent's; the screen's when it
  // is fixed, or has no offsetParent.
  const pseudoBox = (el: Element, s: CSSStyleDeclaration) => {
    const host = s.position !== "fixed" && (getComputedStyle(el).position !== "static" ? el : (el as HTMLElement).offsetParent);
    const origin = host ? { left: host.getBoundingClientRect().left + host.clientLeft, top: host.getBoundingClientRect().top + host.clientTop } : { left: 0, top: 0 };
    return { left: origin.left + parseFloat(s.left), top: origin.top + parseFloat(s.top), width: parseFloat(s.width), height: parseFloat(s.height) };
  };
  // The name of a picture, the same at every size: its file's path (the last two folders, never the host, which a local
  // server changes) or the element.
  const nameOf = (el: Element) => (el instanceof HTMLImageElement && /^https?:/.test(el.src) ? new URL(el.src).pathname.split("/").filter(Boolean).slice(-2).join("/") : describe(el));

  // The overlays: absolutely positioned elements, not set behind the page, whose background is a gradient that reaches
  // transparent.
  const overlays = [...document.body.querySelectorAll("*")].filter((el) => {
    const s = getComputedStyle(el);
    return /absolute|fixed/.test(s.position) && !(Number.parseInt(s.zIndex) < 0) && fadesOut(s.backgroundImage);
  });
  // Why `picture` fades into the page, or "" when it does not.
  const causeOf = (picture: Element, box: DOMRect): string => {
    // A gradient layered over the picture's own url() background: the layers before it are drawn on top.
    const own = getComputedStyle(picture);
    const first = own.backgroundImage.indexOf("url(");
    if (first > 0 && fadesOut(own.backgroundImage.slice(0, first))) return "faded by a gradient layered over its own background";
    for (let n: Element | null = picture; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/gradient\(/.test(`${s.getPropertyValue("mask-image")} ${s.getPropertyValue("-webkit-mask-image")}`)) return `faded by a gradient mask on ${n === picture ? "the picture itself" : describe(n)}`;
      for (const which of ["::before", "::after"]) {
        const p = getComputedStyle(n, which);
        // A pseudo-element in the flow sits beside the picture, not over it; one set behind the page, or a box's ::before
        // under a positioned picture, which is drawn after it, sits under it.
        if (p.content === "none" || !/absolute|fixed/.test(p.position) || Number.parseInt(p.zIndex) < 0 || !fadesOut(p.backgroundImage)) continue;
        if (which === "::before" && n !== picture && own.position !== "static") continue;
        const part = covered(box, pseudoBox(n, p));
        if (part >= 0.1) return `${percent(part)} covered by the gradient to transparent of ${describe(n)}${which}`;
      }
    }
    for (const overlay of overlays) {
      if (overlay.contains(picture) || optedOut(overlay)) continue;
      // An overlay is drawn over a picture that is not positioned, and over one that is when it comes later in the page.
      if (own.position !== "static" && overlay.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_FOLLOWING) continue;
      const part = covered(box, overlay.getBoundingClientRect());
      if (part >= 0.1) return `${percent(part)} covered by the gradient to transparent of ${describe(overlay)}`;
    }
    return "";
  };

  for (const picture of document.body.querySelectorAll("*")) {
    if (!(picture.matches("img, svg image") || /url\(/.test(getComputedStyle(picture).backgroundImage)) || optedOut(picture) || !shown(picture)) continue;
    const detail = causeOf(picture, picture.getBoundingClientRect());
    if (detail) issues.push({ ref: ref(picture), rule: "image-fade", element: nameOf(picture), detail });
  }
  return issues;
}
