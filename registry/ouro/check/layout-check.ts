export { findLayoutIssues };

import type { PageIssue } from "./size-check.ts";

// Runs in the page (page.evaluate), so nothing in it may close over anything outside its function. Layout a person sees
// as broken, measured from the boxes the browser drew, after Apple's Human Interface Guidelines on layout (content stays
// in the visible area) and Refactoring UI (Wathan and Schoger) on hierarchy (one way to do a thing in view):
//
//   off-screen         text or a control the screen cuts off at its left or right edge, where no scrolling reaches it:
//                      more than `cutPx` of it lies past the edge and no box around it scrolls that way. A box wholly
//                      off the screen (a closed drawer) and visually hidden text (1px, or clipped) are left out
//   duplicate-control  two controls in view with the same role and name, such as two Close buttons or two Chat tabs,
//                      outside repeated items (a list's rows, a table's cells, cards), where each has its own
//   stray-scrollbar    a region that scrolls by `minScroll` to `maxScroll` px: a scrollbar, and a scroll, for almost
//                      nothing, often a rounding or a margin that spills over. The page itself counts too, down (across, it is
//                      sideways-scroll's)
//
// An element opts out of a rule with data-ouro-allow="<rule ids>" and a reason in data-ouro-allow-why, as the other rules
// do. `element` names the element by its words, the same at every size; `detail` has this size's numbers.

interface LayoutOptions {
  cutPx?: number;
  minScroll?: number;
  maxScroll?: number;
}

function findLayoutIssues({ cutPx = 2, minScroll = 1, maxScroll = 8 }: LayoutOptions = {}): PageIssue[] {
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
    if (twice.has(key) || first.contains(el) || el.contains(first)) continue;
    twice.add(key);
    issues.push({ ref: ref(first, el), rule: "duplicate-control", element: `${roleOf(el)} "${name.slice(0, 40)}"`, detail: `drawn twice in view: ${describe(first)} and ${describe(el)}` });
  }

  // Scrolls for almost nothing.
  for (const el of [document.documentElement, ...document.body.querySelectorAll("*")]) {
    const s = getComputedStyle(el);
    const page = el === document.documentElement;
    if (optedOut(el, "stray-scrollbar") || (!page && !drawn(el))) continue;
    // The page's own sideways scroll is sideways-scroll's.
    const across = page ? 0 : /auto|scroll/.test(s.overflowX) ? el.scrollWidth - el.clientWidth : 0;
    const down = page ? el.scrollHeight - innerHeight : /auto|scroll/.test(s.overflowY) ? el.scrollHeight - el.clientHeight : 0;
    const by = [down >= minScroll && down <= maxScroll && !(page && /hidden|clip/.test(s.overflowY)) ? `${down}px down` : "", across >= minScroll && across <= maxScroll ? `${across}px across` : ""].filter(Boolean);
    if (!by.length) continue;
    issues.push({ ref: ref(page ? document.body : el), rule: "stray-scrollbar", element: page ? "the page" : describe(el), detail: `scrolls by ${by.join(" and ")}` });
  }
  return issues;
}
