export { findImageFades };

import type { PageIssue } from "./size-check.ts";

// Runs in the page (page.evaluate), so nothing in it may close over anything outside the function. check.ts holds pages
// to it at every size:
//
//   image-fade  a picture that fades into the page: an <img>, an SVG <image> or an element with a url() background
//               whose own box or a box around it has a gradient mask, or that a gradient reaching transparent covers,
//               a tenth of it or more: an absolutely positioned element over it, or an absolutely positioned
//               ::before or ::after of the picture or of a box around it. A picture ends on a hard edge, or sits on a
//               solid band.
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
  // A gradient with a fully transparent stop, however the browser writes the colour: `transparent`, rgba(…, 0) or a
  // colour function's `/ 0`.
  const fadesOut = (image: string) => /gradient\(/.test(image) && /transparent|rgba\([^()]*,\s*0(?:\.0*)?\s*\)|\/\s*0(?:\.0*)?%?\s*\)/.test(image);
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
    for (let n: Element | null = picture; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/gradient\(/.test(`${s.getPropertyValue("mask-image")} ${s.getPropertyValue("-webkit-mask-image")}`)) return `faded by a gradient mask on ${n === picture ? "the picture itself" : describe(n)}`;
      for (const which of ["::before", "::after"]) {
        const p = getComputedStyle(n, which);
        // A pseudo-element in the flow sits beside the picture, not over it.
        if (p.content === "none" || !/absolute|fixed/.test(p.position) || !fadesOut(p.backgroundImage)) continue;
        const part = covered(box, pseudoBox(n, p));
        if (part >= 0.1) return `${percent(part)} covered by the gradient to transparent of ${describe(n)}${which}`;
      }
    }
    const own = getComputedStyle(picture).position;
    for (const overlay of overlays) {
      if (overlay.contains(picture) || optedOut(overlay)) continue;
      // An overlay is drawn over a picture that is not positioned, and over one that is when it comes later in the page.
      if (own !== "static" && overlay.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_FOLLOWING) continue;
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
