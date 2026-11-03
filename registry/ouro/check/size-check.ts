export { findSizeIssues };
export type { PageIssue, SizeCheckOptions };

// Runs in the page (page.evaluate), so nothing in it may close over anything outside the function. With
// overlap-check.ts (text on text or on a picture) and axe, check.ts holds pages to these at every size:
//
//   sideways-scroll  the page is wider than the screen; names the outermost elements that stick out
//   clipped-text     a block of text cut off by its box: overflow, an ellipsis or a line clamp
//   blurry-image     a raster picture drawn larger than its file's own pixels allow at the screen's density, at most 2
//   long-lines       a paragraph whose lines average more than maxChars characters
//
// An element opts out of a rule with data-ouro-allow="<rule ids>" and data-ouro-allow-why="<reason>"; an allow without
// a reason does not count. For an app whose own rules keep data-ouro-* for Ouro's components, plain aliases do the same,
// each with its reason as its value, and stay: data-scroll-x (sideways-scroll), data-clip-ok (clipped-text),
// data-long-lines-ok (long-lines) and data-size-ignore (all four of these rules and blurry-image; a broken picture is
// broken at any size, so it is never ignored).
// `element` names the element the same way at every size, so a sweep can say where it shows; `detail` has this size's
// numbers; `ref` marks it (data-ouro-check-ref) so the runner can photograph it.

interface PageIssue {
  ref: string;
  rule: string;
  element: string;
  detail: string;
  // A measured rule's number, its budget and their unit ("ms", or "" for a score).
  value?: number;
  budget?: number;
  unit?: string;
}

interface SizeCheckOptions {
  maxChars?: number;
  density?: number;
  tolerance?: number;
  minImage?: number;
}

async function findSizeIssues({ maxChars = 100, density = Math.min(2, window.devicePixelRatio), tolerance = 1.1, minImage = 96 }: SizeCheckOptions = {}): Promise<PageIssue[]> {
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (el: Element) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `s${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  // A reason of spaces is no reason: trimmed in place, so the selectors below see it empty.
  for (const name of ["data-ouro-allow-why", "data-scroll-x", "data-clip-ok", "data-long-lines-ok", "data-size-ignore"]) for (const el of document.querySelectorAll(`[${name}]`)) el.setAttribute(name, el.getAttribute(name)!.trim());
  const why = '[data-ouro-allow-why]:not([data-ouro-allow-why=""])';
  // An alias counts only with its reason as its value, as data-ouro-allow does only with data-ouro-allow-why.
  const alias = (name: string) => `[${name}]:not([${name}=""])`;
  const allowed = (rule: string, aliases: string) => `${aliases}, [data-ouro-allow~="${rule}"]${why}, [data-ouro-allow~="all"]${why}`;
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}`;
  // The text as written, not as drawn (innerText): a line clamp or a narrow box would name the element differently at
  // each size.
  const words = (el: Element) => (el.getAttribute("aria-label") || el.getAttribute("alt") || el.textContent || "").trim().replace(/\s+/g, " ");
  const quoted = (el: Element) => {
    const w = words(el);
    return w ? ` "${w.slice(0, 40)}${w.length > 40 ? "…" : ""}"` : "";
  };
  const shown = (el: Element) => {
    if (el.closest("[hidden], template, .visually-hidden, .sr-only")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) <= 0.05) return false;
    }
    return true;
  };
  const inlineOnly = (el: Element) => [...el.children].every((c) => /^inline|^contents$/.test(getComputedStyle(c).display) || c.matches("br, wbr"));

  // Sideways scrolling.
  const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const sideways = allowed("sideways-scroll", `${alias("data-scroll-x")}, ${alias("data-size-ignore")}`);
  if (over > 1 && !document.body.closest(sideways)) {
    const edge = document.documentElement.clientWidth + 1;
    const out = [...document.body.querySelectorAll("*")].filter((el) => !el.closest(sideways) && shown(el) && el.getBoundingClientRect().right > edge);
    const outermost = out.filter((el) => !out.some((o) => o !== el && o.contains(el))).slice(0, 3);
    issues.push({ ref: ref(outermost[0] ?? document.body), rule: "sideways-scroll", element: outermost.map(describe).join(", ") || "the page", detail: `${over}px wider than the screen` });
  }

  // Clipped text.
  const clipping = allowed("clipped-text", `${alias("data-clip-ok")}, ${alias("data-size-ignore")}, svg, select, textarea, script, style`);
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(clipping)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) || !inlineOnly(el)) continue;
    const s = getComputedStyle(el);
    const clipsX = /hidden|clip/.test(s.overflowX);
    const clipsY = /hidden|clip/.test(s.overflowY);
    const clamp = s.getPropertyValue("-webkit-line-clamp");
    const clamped = clamp !== "" && clamp !== "none";
    if ((!clipsX && !clipsY && !clamped) || !shown(el)) continue;
    const cutX = clipsX && el.scrollWidth > el.clientWidth + 1;
    const cutY = (clipsY || clamped) && el.scrollHeight > el.clientHeight + 2;
    // Truncation on purpose (an ellipsis or a line clamp) passes when the whole text is still there for a person who
    // asks: in a title, an aria-label, or the text itself in the accessibility tree.
    const whole = el.textContent!.trim().replace(/\s+/g, " ");
    const told = [el.getAttribute("title"), el.getAttribute("aria-label")].some((text) => text?.trim().replace(/\s+/g, " ").includes(whole));
    const intended = (s.textOverflow === "ellipsis" || clamped) && (told || !el.closest('[aria-hidden="true"]'));
    if ((cutX || cutY) && !intended) {
      issues.push({
        ref: ref(el),
        rule: "clipped-text",
        element: `${describe(el)}${quoted(el)}`,
        detail: cutX ? `${el.scrollWidth - el.clientWidth}px cut across${s.textOverflow === "ellipsis" ? " (ellipsis)" : ""}` : `${el.scrollHeight - el.clientHeight}px cut below${clamped ? " (line clamp)" : ""}`,
      });
    }
  }

  // Blurry pictures. naturalWidth is in CSS pixels, divided by the srcset density the browser chose, so the file's own
  // pixels come from loading the chosen source into an Image of its own.
  const blur = allowed("blurry-image", alias("data-size-ignore"));
  const broken = `[data-ouro-allow~="broken-image"]${why}, [data-ouro-allow~="all"]${why}`;
  // By its path's last two folders, never its host: a run's local server has a new port each time. A data: or blob:
  // picture has no lasting address, so it goes by its name.
  const nameOf = (img: HTMLImageElement, src: string) => (/^(data|blob):/.test(src) ? `img${quoted(img)}` : new URL(src).pathname.split("/").filter(Boolean).slice(-2).join("/"));
  for (const img of document.images) {
    const src = img.currentSrc || img.src;
    // Loaded and empty: the file is missing or is no picture. (An SVG without a size of its own is empty too, so it is
    // left out.)
    if (src && img.complete && !img.naturalWidth && !/\.svg(\?|#|$)|^data:image\/svg/.test(src) && !img.closest(broken)) {
      issues.push({ ref: ref(img), rule: "broken-image", element: nameOf(img, src), detail: "the picture did not load" });
      continue;
    }
    if (!img.naturalWidth || /\.svg(\?|#|$)|^data:image\/svg/.test(src) || img.closest(blur) || !shown(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.width < minImage && r.height < minImage) continue;
    const fit = getComputedStyle(img).objectFit;
    const file = new Image();
    file.src = src;
    await file.decode().catch(() => undefined);
    const pw = file.naturalWidth || img.naturalWidth;
    const ph = file.naturalHeight || img.naturalHeight;
    const sx = r.width / pw;
    const sy = r.height / ph;
    const scale = fit === "contain" || fit === "scale-down" ? Math.min(sx, sy) : fit === "none" ? 1 : Math.max(sx, sy);
    if (scale * density > tolerance) {
      issues.push({
        ref: ref(img),
        rule: "blurry-image",
        element: nameOf(img, src),
        detail: `drawn ${Math.round(r.width)}×${Math.round(r.height)} from ${pw}×${ph}; at ${density}x it needs ${Math.ceil(pw * scale * density)}px wide`,
      });
    }
  }

  // Long lines.
  const prose = allowed("long-lines", `${alias("data-long-lines-ok")}, ${alias("data-size-ignore")}, pre, code, table, nav`);
  for (const el of document.body.querySelectorAll("p, li, dd, blockquote, figcaption, [data-prose]")) {
    if (el.closest(prose) || !inlineOnly(el) || !shown(el)) continue;
    const text = el.textContent!.replace(/\s+/g, " ").trim();
    if (text.length <= maxChars) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((b) => b.width > 1).map((b) => Math.round(b.top)));
    const perLine = text.length / Math.max(1, tops.size);
    if (perLine > maxChars) issues.push({ ref: ref(el), rule: "long-lines", element: `${describe(el)}${quoted(el)}`, detail: `about ${Math.round(perLine)} characters a line (keep to ${maxChars})` });
  }
  return issues;
}
