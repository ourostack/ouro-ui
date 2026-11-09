export { findSizeIssues };
export type { Measure, PageIssue, SizeCheckOptions };

// Runs in the page (page.evaluate), so nothing in it may close over anything outside the function. With
// overlap-check.ts (text on text or on a picture) and axe, check.ts holds pages to these at every size:
//
//   sideways-scroll  the page is wider than the screen; names the outermost elements that stick out
//   clipped-text     a block of text cut off by its box: overflow, an ellipsis or a line clamp
//   blurry-image     a raster picture or a video drawn larger than its file's own pixels allow at the screen's density,
//                    at most 2
//   long-lines       only where the project declares a measure (`measures`): an element whose lines run past it
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
  samples?: number[];
}

// A declared measure: the elements it holds (a CSS selector, or null for the page's prose: p, li, dd, blockquote,
// figcaption and [data-prose]) and how long a line may run: "800px", "75ch" (the width of 75 zeros in the element's
// font), or "100 chars" (characters a rendered line holds on average, counted from the text).
interface Measure {
  selector: string | null;
  measure: string;
}

interface SizeCheckOptions {
  measures?: Measure[];
  density?: number;
  tolerance?: number;
  minImage?: number;
}

async function findSizeIssues({ measures = [], density = Math.min(2, window.devicePixelRatio), tolerance = 1.1, minImage = 96 }: SizeCheckOptions = {}): Promise<PageIssue[]> {
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (el: Element) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `s${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  // Whether an element, or one around it, opts out of `rule`: data-ouro-allow with a reason in data-ouro-allow-why, or
  // one of `aliases` with its reason as its value. A reason of spaces is no reason; the page's attributes are read, never
  // rewritten.
  const reasonOf = (el: Element, name: string) => (el.getAttribute(name) ?? "").trim();
  const optedOut = (el: Element, rule: string, aliases: string[]) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const rules = reasonOf(n, "data-ouro-allow").split(/\s+/);
      if (aliases.some((name) => reasonOf(n!, name)) || ((rules.includes(rule) || rules.includes("all")) && reasonOf(n, "data-ouro-allow-why"))) return true;
    }
    return false;
  };
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
  const sideways = (el: Element) => optedOut(el, "sideways-scroll", ["data-scroll-x", "data-size-ignore"]);
  if (over > 1 && !sideways(document.body)) {
    const edge = document.documentElement.clientWidth + 1;
    const out = [...document.body.querySelectorAll("*")].filter((el) => !sideways(el) && shown(el) && el.getBoundingClientRect().right > edge);
    const outermost = out.filter((el) => !out.some((o) => o !== el && o.contains(el))).slice(0, 3);
    issues.push({ ref: ref(outermost[0] ?? document.body), rule: "sideways-scroll", element: outermost.map(describe).join(", ") || "the page", detail: `${over}px wider than the screen` });
  }

  // Clipped text.
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg, select, textarea, script, style") || optedOut(el, "clipped-text", ["data-clip-ok", "data-size-ignore"])) continue;
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
  // By its path's last two folders, never its host: a run's local server has a new port each time. A data: or blob:
  // picture has no lasting address, so it goes by its name.
  const nameOf = (img: Element, src: string) => (/^(data|blob):/.test(src) ? `img${quoted(img)}` : new URL(src).pathname.split("/").filter(Boolean).slice(-2).join("/"));
  for (const img of document.images) {
    const src = img.currentSrc || img.src;
    // Loaded and empty: the file is missing or is no picture. (An SVG without a size of its own is empty too, so it is
    // left out.)
    if (src && img.complete && !img.naturalWidth && !/\.svg(\?|#|$)|^data:image\/svg/.test(src) && !optedOut(img, "broken-image", [])) {
      issues.push({ ref: ref(img), rule: "broken-image", element: nameOf(img, src), detail: "the picture did not load" });
      continue;
    }
    if (!img.naturalWidth || /\.svg(\?|#|$)|^data:image\/svg/.test(src) || optedOut(img, "blurry-image", ["data-size-ignore"]) || !shown(img)) continue;
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

  // Blurry videos: a video's frames are videoWidth × videoHeight pixels, drawn by object-fit (contain unless the page says
  // otherwise). A video that has not loaded its size (preload="none", say) is asked for it on a video of its own, which
  // loads only the metadata; one that gives no size in 3 s is left out.
  for (const video of document.querySelectorAll("video")) {
    if (optedOut(video, "blurry-image", ["data-size-ignore"]) || !shown(video)) continue;
    const r = video.getBoundingClientRect();
    if (r.width < minImage && r.height < minImage) continue;
    const src = video.currentSrc || video.src || video.querySelector("source")?.src || "";
    let [pw, ph] = [video.videoWidth, video.videoHeight];
    if (!pw && src) {
      const probe = document.createElement("video");
      probe.muted = true;
      probe.preload = "metadata";
      probe.src = src;
      await Promise.race([new Promise((done) => probe.addEventListener("loadedmetadata", done, { once: true })), new Promise((done) => setTimeout(done, 3000))]);
      [pw, ph] = [probe.videoWidth, probe.videoHeight];
      probe.removeAttribute("src");
    }
    if (!pw) continue;
    const fit = getComputedStyle(video).objectFit;
    const [sx, sy] = [r.width / pw, r.height / ph];
    const scale = fit === "none" ? 1 : fit === "cover" || fit === "fill" ? Math.max(sx, sy) : Math.min(sx, sy);
    if (scale * density > tolerance) {
      issues.push({
        ref: ref(video),
        rule: "blurry-image",
        element: /^(data|blob):/.test(src) || !src ? `video${quoted(video)}` : nameOf(video, src),
        detail: `a video drawn ${Math.round(r.width)}×${Math.round(r.height)} from ${pw}×${ph} frames; at ${density}x it needs ${Math.ceil(pw * scale * density)}px wide`,
      });
    }
  }

  // Long lines, only against a measure the project declared: none is assumed, since a fixed measure is a design choice,
  // not a default. An element two measures hold is checked against the first.
  const checked = new Set<Element>();
  for (const { selector, measure } of measures) {
    const [, amount, unit] = /^(\d+(?:\.\d+)?)\s*(px|ch|chars)$/.exec(measure.trim())!;
    const limit = Number(amount);
    for (const el of document.body.querySelectorAll(selector ?? "p, li, dd, blockquote, figcaption, [data-prose]")) {
      if (checked.has(el)) continue;
      checked.add(el);
      // The page's prose leaves out code, tables, navigation and blocks of blocks; a selector holds exactly what it names,
      // a container of paragraphs included.
      const prose = selector === null;
      if ((prose && (el.closest("pre, code, table, nav") || !inlineOnly(el))) || optedOut(el, "long-lines", ["data-long-lines-ok", "data-size-ignore"]) || !shown(el)) continue;
      const text = el.textContent!.replace(/\s+/g, " ").trim();
      // A run of short items set apart by middle dots, bullets or bars (counts, tags, a byline) is a list, not prose.
      const items = text.split(/\s[·•|]\s/);
      if (items.length >= 3 && items.every((item) => item.length <= 40)) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const boxes = [...range.getClientRects()].filter((b) => b.width > 1).sort((a, b) => a.top - b.top || a.left - b.left);
      // A rendered line: the boxes at one height, unless a gap wider than a space parts them, as columns side by side do.
      const gap = parseFloat(getComputedStyle(el).fontSize) * 0.75;
      const rows: { top: number; left: number; right: number }[] = [];
      for (const b of boxes) {
        const row = rows.findLast((row) => row.top === Math.round(b.top) && b.left <= row.right + gap);
        if (row) [row.left, row.right] = [Math.min(row.left, b.left), Math.max(row.right, b.right)];
        else rows.push({ top: Math.round(b.top), left: b.left, right: b.right });
      }
      if (unit === "chars") {
        // As a reader meets it: the characters a rendered line holds on average, fixed by how the text is composed.
        const perLine = text.length / Math.max(1, rows.length);
        if (perLine > limit) issues.push({ ref: ref(el), rule: "long-lines", element: `${describe(el)}${quoted(el)}`, detail: `about ${Math.round(perLine)} characters a line (keep to ${limit})` });
        continue;
      }
      const context = document.createElement("canvas").getContext("2d")!;
      // From its parts: the font shorthand reads empty once a font feature or variant is set, and the canvas would
      // keep its own 10px font.
      const s = getComputedStyle(el);
      context.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const px = unit === "px" ? limit : limit * context.measureText("0").width;
      const widest = Math.max(0, ...rows.map((row) => row.right - row.left));
      if (widest > px + 1) issues.push({ ref: ref(el), rule: "long-lines", element: `${describe(el)}${quoted(el)}`, detail: `lines up to ${Math.round(widest)}px wide (measure ${measure.trim()})` });
    }
  }
  return issues;
}
