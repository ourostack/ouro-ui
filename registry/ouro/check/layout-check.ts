export { findLayoutIssues };

import type { PageIssue } from "./size-check.ts";

// Runs in the page (page.evaluate), so nothing in it may close over anything outside its function. Layout a person sees
// as broken, measured from the boxes the browser drew, after Apple's Human Interface Guidelines on layout (content stays
// in the visible area) and Refactoring UI (Wathan and Schoger) on hierarchy (one way to do a thing in view):
//
//   off-screen         text or a control the screen cuts off at its left or right edge, where no scrolling reaches it:
//                      more than `cutPx` of it lies past the edge and no box around it scrolls that way. A box wholly
//                      off the screen (a closed drawer) and visually hidden text (1px, or clipped) are left out
//   duplicate-control  two controls in view with the same role and name in one place (the same nearest section, group,
//                      nav, header, aside, form or dialog), such as two Close buttons on a panel, outside repeated
//                      items (a list's rows, a table's cells, cards), where each has its own. Two links count only when
//                      they go to different places: two that go to the same one are the same link. Two toggles that
//                      each control their own panel (`aria-controls`) are two controls
//   stray-scrollbar    a region that scrolls by `minScroll` to `maxScroll` px down, or 2 to `maxScroll` px across: a
//                      scrollbar, and a scroll, for almost nothing, often a rounding or a margin that spills over. Text
//                      that doesn't wrap (code, a nowrap row) scrolls across by however long its line is, so it doesn't
//                      count across, and nor does a list's region (messages, rows, options): it holds as many as
//                      there are, so it overflows by however much they add up to. The page itself counts too, down (across, it is
//                      sideways-scroll's)
//   near-miss          two separate surfaces, or a surface and the edge of the surface it sits in, that are neither
//                      touching nor `gapMin` apart: a gap of more than 0 and under the minimum gap token
//                      (--ouro-gap-min, read from the page; `gapMin` px where it has none). A surface is a block or inline-block box of at
//                      least 16x16 with a fill unlike what is behind it, a frame (a border on every side, an outline
//                      or a ring) or a picture. Two surfaces are a near miss when they don't overlap, aren't nested
//                      and face each other across that gap along at least half of the shorter one's facing side. Two kinds
//                      of near miss are no miss: parts of one control group, which read as one thing with their own
//                      rhythm (surfaces under the same group root: role group, radiogroup, toolbar or tablist, or an Ouro
//                      ToggleGroup, ButtonGroup, SegmentedControl, Tabs and the like), and a small adornment centred in a
//                      control's frame (a Kbd hint, a clear button) whose frame is too small to hold the minimum gap on
//                      both sides: the field's own padding insets it, it isn't placed beside anything.
//                      A surface's inner edge is never judged against the surface it sits in when that surface is, or
//                      sits inside, a button or a switch, checkbox, radio or slider role: a control's own parts
//                      (Switch's track and thumb, a custom checkbox's box and mark) are drawn as one piece. Nor is it
//                      judged on an axis a scrolling ancestor between it and that surface scrolls: where it sits down
//                      that axis is wherever it's scrolled to, not a design gap. The same skip applies to two separate
//                      surfaces: a floating one (fixed, sticky or absolutely positioned, such as a "Jump to latest"
//                      button) paired with one that scrolls under it, on the axis their shared scrolling ancestor
//                      scrolls, since that gap is the scroll position's, not the design's. Two that both scroll, or
//                      both float, are still judged: only a floating-over-scrolling pair is skipped
//
// An element opts out of a rule with data-ouro-allow="<rule ids>" and a reason in data-ouro-allow-why, as the other rules
// do. `element` names the element by its words, the same at every size; `detail` has this size's numbers.

interface LayoutOptions {
  cutPx?: number;
  minScroll?: number;
  maxScroll?: number;
  gapMin?: number;
}

function findLayoutIssues({ cutPx = 2, minScroll = 1, maxScroll = 8, gapMin: gapMinFallback = 8 }: LayoutOptions = {}): PageIssue[] {
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (...els: Element[]) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `l${counter.__ouroCheckRef}`;
    for (const el of els) el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  const optedOut = (el: Element, rule: string) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const rules = (n.getAttribute("data-ouro-allow") ?? "").split(/\s+/);
      if ((rules.includes(rule) || rules.includes("all")) && (n.getAttribute("data-ouro-allow-why") ?? "").trim()) return true;
    }
    return false;
  };
  const nameOf = (el: Element) => {
    const labelled = (el.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => (id ? document.getElementById(id)?.textContent : "") ?? "")
      .join(" ")
      .trim();
    return (el.getAttribute("aria-label") || labelled || (el as HTMLElement).innerText || el.getAttribute("title") || "").trim().replace(/\s+/g, " ");
  };
  const describe = (el: Element) => {
    const words = nameOf(el);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}${words ? ` "${words.slice(0, 40)}${words.length > 40 ? "…" : ""}"` : ""}`;
  };
  // Drawn: no box around it hides it, fades it out or is closed, and it is bigger than the 1px of visually hidden text.
  const drawn = (el: Element) => {
    if (el.closest('[hidden], [inert], [aria-hidden="true"], template, details:not([open]) > :not(summary)')) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) <= 0.05 || /^rect\(0(px)?,? 0(px)?/.test(s.clip) || s.clipPath === "inset(50%)") return false;
    }
    return true;
  };
  const controls = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=radio], [role=option]";
  const roleOf = (el: Element) => {
    const role = el.getAttribute("role");
    if (role) return role;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "input") return `${(el as HTMLInputElement).type} field`;
    return tag;
  };

  // Off the screen.
  const width = document.documentElement.clientWidth;
  // A box around it that scrolls already clips it to its own edges (drawnBox), so only the page's own scroll is left.
  const pageScrollsAcross = !/hidden|clip/.test(getComputedStyle(document.documentElement).overflowX) && document.documentElement.scrollWidth > width;
  // As drawn: each box around it that hides overflow cuts it to its own edges first, so text an ellipsis or a clipping
  // panel already cuts inside the screen is clipped-text's, not this rule's.
  const drawnBox = (el: Element) => {
    const r = el.getBoundingClientRect();
    let { left, right } = r;
    for (let n = el.parentElement; n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).overflowX === "visible") continue;
      const c = n.getBoundingClientRect();
      left = Math.max(left, c.left);
      right = Math.min(right, c.right);
    }
    return { left, right };
  };
  const textBlocks = [...document.body.querySelectorAll("*")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()));
  const candidates = new Set([...document.body.querySelectorAll(controls), ...textBlocks]);
  const cut: Element[] = [];
  for (const el of candidates) {
    if (el.closest("svg, script, style, noscript") || optedOut(el, "off-screen") || !drawn(el)) continue;
    const r = drawnBox(el);
    if ((-r.left <= cutPx && r.right - width <= cutPx) || r.right <= 0 || r.left >= width || pageScrollsAcross) continue;
    cut.push(el);
  }
  // The outermost of each nest of cut elements: a button cut off with the words in it is one finding.
  for (const el of cut.filter((el) => !cut.some((other) => other !== el && other.contains(el)))) {
    const r = drawnBox(el);
    const side = r.left < -cutPx ? `${Math.round(-r.left)}px past the left edge` : `${Math.round(r.right - width)}px past the right edge`;
    issues.push({ ref: ref(el), rule: "off-screen", element: describe(el), detail: `${side} of a ${width}px screen, where nothing scrolls to it` });
  }

  // The same control twice.
  const repeated = "li, tr, td, th, article, [role=row], [role=listitem], [role=gridcell], [role=option], [role=article]";
  const place = "section, form, dialog, fieldset, figure, nav, header, footer, aside, main, [role=dialog], [role=alertdialog], [role=region], [role=group], [role=toolbar], [role=tablist], [role=menu], [role=menubar]";
  const destination = (el: Element) => (el.tagName.toLowerCase() === "a" ? (el as HTMLAnchorElement).href : "");
  // Two toggles that each open their own panel, such as a Show more under each of two blocks, are two controls.
  const controlsOwn = (a: Element, b: Element) => Boolean(a.getAttribute("aria-controls") && b.getAttribute("aria-controls") && a.getAttribute("aria-controls") !== b.getAttribute("aria-controls"));
  const seen = new Map<string, Element>();
  const twice = new Set<string>();
  for (const el of document.body.querySelectorAll(controls)) {
    if (el.closest(repeated) || optedOut(el, "duplicate-control") || !drawn(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= width) continue;
    const name = nameOf(el);
    if (!name) continue;
    const key = `${roleOf(el)}\u0000${name.toLowerCase()}`;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, el);
      continue;
    }
    if (twice.has(key) || first.contains(el) || el.contains(first) || (destination(el) && destination(el) === destination(first)) || controlsOwn(first, el) || first.closest(place) !== el.closest(place)) continue;
    twice.add(key);
    issues.push({ ref: ref(first, el), rule: "duplicate-control", element: `${roleOf(el)} "${name.slice(0, 40)}"`, detail: `drawn twice in view: ${describe(first)} and ${describe(el)}` });
  }

  // Scrolls for almost nothing.
  const lists = "ul, ol, table, [role=list], [role=listbox], [role=log], [role=feed], [role=grid], [role=tree]";
  const listRegion = (el: Element) => el.matches(lists) || el.firstElementChild?.matches(lists) || Boolean(el.querySelector('[data-ouro="message"]'));
  for (const el of [document.documentElement, ...document.body.querySelectorAll("*")]) {
    const s = getComputedStyle(el);
    const page = el === document.documentElement;
    // A list's region (messages, rows, options) holds as many as there are, so it overflows by whatever they add up to.
    if (optedOut(el, "stray-scrollbar") || (!page && (!drawn(el) || listRegion(el)))) continue;
    // The page's own sideways scroll is sideways-scroll's.
    const unwrapped = /pre|nowrap/.test(s.whiteSpace) || Boolean(el.querySelector("pre, code"));
    const across = page || unwrapped ? 0 : /auto|scroll/.test(s.overflowX) ? el.scrollWidth - el.clientWidth : 0;
    const down = page ? el.scrollHeight - innerHeight : /auto|scroll/.test(s.overflowY) ? el.scrollHeight - el.clientHeight : 0;
    const by = [down >= minScroll && down <= maxScroll && !(page && /hidden|clip/.test(s.overflowY)) ? `${down}px down` : "", across >= Math.max(2, minScroll) && across <= maxScroll ? `${across}px across` : ""].filter(Boolean);
    if (!by.length) continue;
    issues.push({ ref: ref(page ? document.body : el), rule: "stray-scrollbar", element: page ? "the page" : describe(el), detail: `scrolls by ${by.join(" and ")}` });
  }

  // Separate surfaces are touching or a minimum gap apart.
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(--ouro-gap-min, ${gapMinFallback}px)`;
  document.body.append(probe);
  const gapMin = probe.getBoundingClientRect().width;
  probe.remove();
  const touchPx = 0.5;
  const clear = (c: string) => c === "rgba(0, 0, 0, 0)" || /\/ 0\)$/.test(c);
  const behind = (el: Element) => {
    for (let n = el.parentElement; n; n = n.parentElement) if (!clear(getComputedStyle(n).backgroundColor)) return getComputedStyle(n).backgroundColor;
    return "";
  };
  const isSurface = (el: Element) => {
    if (el.matches("img, video, canvas, picture")) return true;
    const s = getComputedStyle(el);
    const filled = !clear(s.backgroundColor) && s.backgroundColor !== behind(el);
    const framed = [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].every((w, i) => parseFloat(w) > 0 && !clear([s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor][i]!));
    const outlined = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && !clear(s.outlineColor);
    const ringed = /0px 0px 0px [1-9]/.test(s.boxShadow.replace(/[^,]*inset[^,]*/g, ""));
    return filled || framed || outlined || ringed;
  };
  // A control's own parts (Switch's track and thumb, a custom checkbox's box and mark, a slider's track and thumb)
  // are drawn as one piece, so a surface's inner edge is never judged against a control it sits in.
  const controlPieceRoles = new Set(["button", "switch", "checkbox", "radio", "slider"]);
  const isControlPiece = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) if (controlPieceRoles.has(roleOf(n))) return true;
    return false;
  };
  const surfaces = [...document.body.querySelectorAll("*")].filter((el) => {
    if (el instanceof SVGElement || getComputedStyle(el).display === "inline" || optedOut(el, "near-miss") || !drawn(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 16 && r.height >= 16 && isSurface(el);
  });
  const rects = new Map(surfaces.map((el) => [el, el.getBoundingClientRect()]));
  const axes = [
    { axis: "x", start: "left", end: "right", sideStart: "top", sideEnd: "bottom" },
    { axis: "y", start: "top", end: "bottom", sideStart: "left", sideEnd: "right" },
  ] as const;
  // A scrolling ancestor the walk reaches before (or at) nearest: both els share an ancestor, so the walk from either
  // one up always reaches the other's, and the loop always returns from inside it.
  const nearestCommonAncestor = (a: Element, b: Element) => {
    const ancestors = new Set<Element>();
    for (let n: Element | null = a; n; n = n.parentElement) ancestors.add(n);
    for (let n: Element | null = b; n; n = n.parentElement) if (ancestors.has(n)) return n;
    /* istanbul ignore next @preserve -- both els are always under document.body, so the loop above always returns there or sooner */
    return document.body;
  };
  // A surface's position against a scrolling ancestor is wherever it's scrolled to, not a design gap.
  const scrolls = (el: Element, axis: "x" | "y") => (axis === "x" ? /auto|scroll/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth : /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight);
  // container is always an ancestor of a (the caller only calls this with a container that contains a), so the walk
  // always reaches it and returns from inside the loop: no trailing fallback return is reachable.
  const scrollsBetween = (a: Element, container: Element, axis: "x" | "y") => {
    let n = a.parentElement!;
    for (;;) {
      if (scrolls(n, axis)) return true;
      if (n === container) return false;
      n = n.parentElement!;
    }
  };
  const floats = (el: Element) => /fixed|sticky|absolute/.test(getComputedStyle(el).position);
  // A pair where one sits over a scroll area the other scrolls in (a "Jump to latest" button, a header pill over a
  // picture that scrolls under it): their gap depends on scroll position, not a design gap, like a surface's own
  // scrolling container's edge.
  const floatsOverScroll = (a: Element, b: Element, axis: "x" | "y") => {
    const container = nearestCommonAncestor(a, b);
    const aScrolls = container !== a && scrollsBetween(a, container, axis);
    const bScrolls = container !== b && scrollsBetween(b, container, axis);
    return (aScrolls && !bScrolls && floats(b)) || (bScrolls && !aScrolls && floats(a));
  };
  const apart = (a: Element, b: Element) => {
    const ra = rects.get(a)!;
    const rb = rects.get(b)!;
    for (const { axis, start, end, sideStart, sideEnd } of axes) {
      const gap = Math.max(ra[start] - rb[end], rb[start] - ra[end]);
      const along = Math.min(ra[sideEnd], rb[sideEnd]) - Math.max(ra[sideStart], rb[sideStart]);
      if (gap > touchPx && gap < gapMin && along >= Math.min(ra[sideEnd] - ra[sideStart], rb[sideEnd] - rb[sideStart]) / 2 && !floatsOverScroll(a, b, axis)) return gap;
    }
    return 0;
  };
  const groups = '[role=group], [role=radiogroup], [role=toolbar], [role=tablist], [data-ouro="toggle-group"], [data-ouro="button-group"], [data-ouro="segmented-control"], [data-ouro="tabs"], [data-ouro="radio-group"], [data-ouro="checkbox-group"], [data-ouro="pagination"], [data-ouro="otp-field"], [data-ouro="avatar-group"], [data-ouro="toolbar"]';
  const sameGroup = (a: Element, b: Element) => {
    const group = a.closest(groups);
    return Boolean(group) && group === b.closest(groups);
  };
  const near: { a: Element; b: Element; gap: number }[] = [];
  surfaces.forEach((a, i) => {
    for (const b of surfaces.slice(i + 1)) {
      const gap = a.contains(b) || b.contains(a) || sameGroup(a, b) ? 0 : apart(a, b);
      if (gap) near.push({ a, b, gap });
    }
    const container = surfaces.filter((c) => c !== a && c.contains(a)).pop();
    if (!container || isControlPiece(container) || sameGroup(a, container)) return;
    const r = rects.get(a)!;
    const c = rects.get(container)!;
    const scrollX = scrollsBetween(a, container, "x");
    const scrollY = scrollsBetween(a, container, "y");
    const inner = [
      scrollX ? Infinity : r.left - c.left - container.clientLeft,
      scrollY ? Infinity : r.top - c.top - container.clientTop,
      scrollX ? Infinity : c.right - r.right - (c.width - container.clientLeft - container.clientWidth),
      scrollY ? Infinity : c.bottom - r.bottom - (c.height - container.clientTop - container.clientHeight),
    ];
    // Centred across a control's frame too small to give it the minimum gap on both sides: the frame's padding insets it.
    const inControl = container.matches(controls) || Boolean(container.querySelector(controls));
    const insetBy = (lo: number, hi: number) => inControl && Math.abs(lo - hi) <= 1 && lo + hi < 2 * gapMin;
    const gap = Math.min(...inner.filter((d, k) => d > touchPx && d < gapMin && !insetBy(inner[k % 2 ? 1 : 0]!, inner[k % 2 ? 3 : 2]!)));
    if (gap < Infinity) near.push({ a: container, b: a, gap });
  });
  // The outermost of each nest of near misses: two cards a hair apart are one finding, not one for each part of them.
  const within = (inner: Element, outer: Element) => outer.contains(inner);
  for (const { a, b, gap } of near.filter((n) => !near.some((o) => o !== n && ((within(n.a, o.a) && within(n.b, o.b)) || (within(n.a, o.b) && within(n.b, o.a)))))) {
    issues.push({ ref: ref(a, b), rule: "near-miss", element: `${describe(a)} and ${describe(b)}`, detail: `${Math.round(gap * 10) / 10}px apart: more than 0 and under the ${Math.round(gapMin * 10) / 10}px minimum gap, so neither touching nor clearly apart` });
  }
  return issues;
}
