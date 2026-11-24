export { findPanelIssues };
export type { PanelOptions };

import type { PageIssue } from "./size-check.ts";

// Runs in the page (page.evaluate), so nothing in it may close over anything outside its function. How an open panel
// uses its space: a menu, a listbox something opens, a dialog or a sheet, a [popover] that is open, what Base UI places
// against an anchor (data-side with data-open), or an element the app marks data-ouro-panel. The runner calls it as each
// page loads, at every size, and after each popup its walk opens; a story's sweep calls it at rest. A panel inside
// another is judged as part of the outer one.
//
//   empty-panel         a panel that isn't modal, `minHeight` px or taller, as the screen shows it, where under `coverage` of its inside
//                       (its box less its padding) has content within `nearPx`: text, a control or menu item, a picture or a table,
//                       as a panel whose links sit in one narrow column of a wide box does. A panel that fills 90% of
//                       the screen's width and height is a screen and passes; one that runs the screen's height is judged to its last content
//   wrapped-short-line  a line of words of `wideChars` characters or fewer, on a screen `wideScreen` px wide or wider
//                       (`narrowChars` below it), that wraps onto a second line: a link, a label or a one-line
//                       description in a column too narrow for it
//   boxed-blurb         a rounded box (`radius` px or more) with a fill of its own or a border on every side that holds
//                       `blurbChars` characters of words or more and nothing to press: a decorative card inside a menu.
//                       A message (role alert, status or note), code, a badge and a control's own frame pass
//   panel-off-screen    a panel whose content passes the bottom of the screen by more than 1px with nothing to scroll it
//                       into view: neither a box around it that scrolls it, nor the page itself when the panel isn't
//                       fixed to the screen
//   panel-clip          after a press opens it (`clip`; clipped-text reads the page as it loads): text in a panel cut off by the nearest box around it that hides its overflow, by more than 2px.
//                       A box folded to no height (a closed accordion), visually hidden text, a box that scrolls, and
//                       text cut short on purpose (an ellipsis or a line clamp) pass
//
// An element opts out of a rule with data-ouro-allow="<rule ids>" and a reason in data-ouro-allow-why, on it or a box
// around it, as the other rules do. `element` names the panel the same way at every size; `detail` has this size's numbers.

interface PanelOptions {
  minHeight?: number;
  coverage?: number;
  nearPx?: number;
  wideChars?: number;
  narrowChars?: number;
  wideScreen?: number;
  radius?: number;
  blurbChars?: number;
  // panel-clip too: off as the page loads, where clipped-text already reads what is open.
  clip?: boolean;
}

function findPanelIssues({ minHeight = 120, coverage = 0.6, nearPx = 24, wideChars = 60, narrowChars = 24, wideScreen = 1024, radius = 4, blurbChars = 20, clip = true }: PanelOptions = {}): PageIssue[] {
  const PANELS = "[role=menu], [role=listbox], [role=dialog], [role=alertdialog], dialog[open], [popover]:popover-open, [data-side][data-open], [data-ouro-panel]";
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const mark = (el: Element) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `n${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  const optedOut = (el: Element, rule: string) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const rules = (n.getAttribute("data-ouro-allow") ?? "").split(/\s+/);
      if ((rules.includes(rule) || rules.includes("all")) && (n.getAttribute("data-ouro-allow-why") ?? "").trim()) return true;
    }
    return false;
  };
  const drawn = (el: Element) => {
    if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const describe = (el: Element) => {
    const role = el.getAttribute("role");
    const ouro = el.getAttribute("data-ouro");
    const name = (el.getAttribute("aria-label") ?? "").trim();
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${role ? `[role=${role}]` : ""}${ouro ? `[data-ouro=${ouro}]` : ""}${name ? ` "${name.slice(0, 40)}"` : ""}`;
  };
  const words = (text: string) => text.trim().replace(/\s+/g, " ");
  const quote = (text: string) => `"${text.length > 60 ? `${text.slice(0, 60)}…` : text}"`;
  const textNodes = (root: Element) => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.textContent!.trim()) nodes.push(walker.currentNode as Text);
    return nodes;
  };
  const rectsOf = (node: Text) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  };
  // A listbox is a panel only when something opens it, as popup-first-frame reads it: one with no opener is page content.
  const opened = (el: Element) => {
    if (el.getAttribute("role") !== "listbox" || el.matches("[popover], [data-side]")) return true;
    return !!el.id && !!document.querySelector(`[aria-controls~="${CSS.escape(el.id)}"], [aria-owns~="${CSS.escape(el.id)}"]`);
  };
  // A wrapper Base UI marks as placed (a positioner, a sheet's viewport) is role presentation: the panel is inside it.
  const candidates = [...document.querySelectorAll(PANELS)].filter((el) => !el.matches("[role=presentation], [role=none]") && opened(el) && drawn(el));
  const panels = candidates.filter((el) => !candidates.some((other) => other !== el && other.contains(el)));

  for (const panel of panels) {
    const name = describe(panel);
    const style = getComputedStyle(panel);
    const box = panel.getBoundingClientRect();
    const own = panel.querySelectorAll("*");
    const texts = textNodes(panel).filter((node) => node.parentElement && drawn(node.parentElement));
    // What a person reads or presses in the panel, each with the element it sits in: its words, its controls, its pictures.
    const content: { el: Element; rect: DOMRect }[] = texts.flatMap((node) => rectsOf(node).map((rect) => ({ el: node.parentElement!, rect })));
    for (const el of panel.querySelectorAll("a[href], button, input, select, textarea, img, svg, video, canvas, picture, iframe, table, [role=button], [role=link], [role^=menuitem], [role=option], [role=tab], [role=treeitem], [role=checkbox], [role=radio], [role=switch], [role=textbox], [role=table], [role=grid], [role=img], [role=progressbar], [role=slider]")) {
      if (drawn(el)) content.push({ el, rect: el.getBoundingClientRect() });
    }

    // empty-panel: a grid of points every 16px over the inside the screen shows, each counted when content lies within nearPx.
    // A modal dialog or sheet is sized for what it asks, a message as much as a list, so only the panels a person opens
    // to pick from (menus, popovers, navigation panels) are held to filling their space.
    const modal = panel.matches('[aria-modal="true"], [role=alertdialog], dialog:modal');
    if (!modal && !optedOut(panel, "empty-panel")) {
      const inner = {
        left: Math.max(box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), 0),
        top: Math.max(box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop), 0),
        right: Math.min(box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight), innerWidth),
        bottom: Math.min(box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom), innerHeight),
      };
      // A panel that fills the screen is a screen, not a panel; one that runs the screen's height (a side sheet) is
      // judged down to its last content, as its height is the screen's, not its own.
      const fullHeight = box.top <= 1 && box.bottom >= innerHeight - 1;
      const screen = box.width >= innerWidth * 0.9 && box.height >= innerHeight * 0.9;
      if (fullHeight && content.length) inner.bottom = Math.min(inner.bottom, Math.max(...content.map(({ rect }) => rect.bottom)) + nearPx);
      const height = inner.bottom - inner.top;
      const width = inner.right - inner.left;
      if (!screen && height >= minHeight && width >= minHeight) {
        const rects = content.map(({ rect }) => rect);
        let hit = 0;
        let total = 0;
        for (let x = inner.left + 4; x < inner.right; x += 16) {
          for (let y = inner.top + 4; y < inner.bottom; y += 16) {
            total++;
            if (rects.some((r) => x >= r.left - nearPx && x <= r.right + nearPx && y >= r.top - nearPx && y <= r.bottom + nearPx)) hit++;
          }
        }
        const share = hit / total;
        if (share < coverage) {
          issues.push({ ref: mark(panel), rule: "empty-panel", element: name, detail: `${Math.round(share * 100)}% of its ${Math.round(width)}×${Math.round(height)}px inside has content within ${nearPx}px (keep to ${Math.round(coverage * 100)}% or more)`, value: Math.round(share * 100), budget: Math.round(coverage * 100), unit: "%" });
        }
      }
    }

    // wrapped-short-line: an element whose own words are short, drawn on more than one line.
    const limit = innerWidth >= wideScreen ? wideChars : narrowChars;
    const wrapped: Element[] = [];
    for (const el of [panel, ...own]) {
      if (!el.matches("a, button, span, p, li, dt, dd, label, h1, h2, h3, h4, h5, h6, [role^=menuitem], [role=option]") || el.closest("pre, code, kbd, samp, svg")) continue;
      // Words alone: an element with another element in it (beyond an icon or visually hidden text) is judged by its parts.
      if ([...el.children].some((child) => !child.matches('[aria-hidden="true"], svg, img') && drawn(child))) continue;
      const lines = [...el.childNodes].filter((node): node is Text => node.nodeType === 3 && !!node.textContent!.trim());
      const text = words(lines.map((node) => node.textContent).join(" "));
      if (!text || text.length > limit || !drawn(el) || optedOut(el, "wrapped-short-line")) continue;
      const tops: number[] = [];
      for (const r of lines.flatMap(rectsOf)) if (!tops.some((top) => Math.abs(top - r.top) < 4)) tops.push(r.top);
      if (tops.length > 1) wrapped.push(el);
    }
    if (wrapped.length) {
      const shown = wrapped.slice(0, 3).map((el) => quote(words(el.textContent!)));
      const ref = mark(wrapped[0]!);
      for (const el of wrapped.slice(1)) el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${ref}`.trim());
      issues.push({ ref, rule: "wrapped-short-line", element: `${name}: ${shown[0]}`, detail: `${wrapped.length} line${wrapped.length > 1 ? "s" : ""} of ${limit} characters or fewer wrap${wrapped.length > 1 ? "" : "s"} at ${innerWidth}px (${shown.join(", ")}${wrapped.length > 3 ? ", …" : ""})` });
    }

    // boxed-blurb: the outermost rounded, filled or framed box of words with nothing to press in it.
    const background = style.backgroundColor;
    const blurbs: Element[] = [];
    for (const el of own) {
      if (!el.matches("div, p, section, span, aside, article, figure, blockquote") || blurbs.some((blurb) => blurb.contains(el))) continue;
      if (el.closest('a, button, kbd, code, pre, samp, [role=table], [role=alert], [role=status], [role=note], [role^=menuitem], [role=option], [role=tab], [data-ouro=badge], [data-ouro=kbd]')) continue;
      if (el.querySelector("a[href], button, input, select, textarea, [role=button], [tabindex]")) continue;
      const text = words(el.textContent!);
      if (text.length < blurbChars || !drawn(el) || optedOut(el, "boxed-blurb")) continue;
      const s = getComputedStyle(el);
      const filled = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent" && s.backgroundColor !== background;
      const framed = (["Top", "Right", "Bottom", "Left"] as const).every((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none");
      if ((filled || framed) && parseFloat(s.borderTopLeftRadius) >= radius) blurbs.push(el);
    }
    for (const el of blurbs) {
      const text = words(el.textContent!);
      issues.push({ ref: mark(el), rule: "boxed-blurb", element: `${name}: ${quote(text)}`, detail: `a rounded box with a ${getComputedStyle(el).backgroundColor !== background && getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" ? "fill" : "border"} holds words and nothing to press` });
    }

    // panel-off-screen: each piece of content held on the screen by the nearest box around it that scrolls it; failing
    // that, by the page, when the panel isn't fixed to the screen and the page's scroll isn't locked. A panel's box may
    // run past the screen where it draws nothing (a sheet's bleed below its edge), so its content is what is measured.
    if (!optedOut(panel, "panel-off-screen")) {
      const root = document.scrollingElement!;
      const locked = [document.documentElement, document.body].some((el) => /hidden|clip/.test(getComputedStyle(el).overflowY));
      let past = 0;
      for (const { el: start, rect } of content) {
        let bottom = rect.bottom;
        let held = false;
        let fixed = false;
        for (let el: Element | null = start; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) {
            // What a box scrolls is reachable only while the box's own bottom is on the screen.
            bottom = el.getBoundingClientRect().bottom;
            held = true;
            break;
          }
          if (s.position === "fixed") {
            fixed = true;
            break;
          }
        }
        if (!held && !fixed && !locked && root.scrollHeight >= rect.bottom + scrollY - 1) continue;
        past = Math.max(past, Math.round(bottom - innerHeight));
      }
      if (past > 1) {
        issues.push({ ref: mark(panel), rule: "panel-off-screen", element: name, detail: `its content runs ${past}px past the bottom of the ${innerHeight}px screen, with nothing to scroll it into view`, value: past, budget: 1, unit: "px" });
      }
    }

    // panel-clip: each text judged against the nearest box around it, inside the panel, that hides its overflow.
    const clipped = new Map<Element, number>();
    for (const node of clip ? texts : []) {
      const parent = node.parentElement!;
      const ps = getComputedStyle(parent);
      const clamp = ps.getPropertyValue("-webkit-line-clamp");
      if (ps.textOverflow === "ellipsis" || (clamp !== "" && clamp !== "none")) continue;
      let clipper: Element | null = null;
      for (let el: Element | null = parent; el && el !== panel.parentElement; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          clipper = el;
          break;
        }
      }
      if (!clipper || clipped.has(clipper) || optedOut(clipper, "panel-clip")) continue;
      const cs = getComputedStyle(clipper);
      // A box that scrolls shows the rest when scrolled; one folded to nothing, or visually hidden text's 1px box, cuts on purpose.
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY) || clipper.clientWidth <= 2 || clipper.clientHeight <= 2) continue;
      const c = clipper.getBoundingClientRect();
      const left = c.left + clipper.clientLeft;
      const top = c.top + clipper.clientTop;
      const right = left + clipper.clientWidth;
      const bottom = top + clipper.clientHeight;
      const clipsX = cs.overflowX !== "visible";
      const clipsY = cs.overflowY !== "visible";
      let cut = 0;
      for (const r of rectsOf(node)) {
        if (clipsX) cut = Math.max(cut, left - r.left, r.right - right);
        if (clipsY) cut = Math.max(cut, top - r.top, r.bottom - bottom);
      }
      if (cut > 2) clipped.set(clipper, Math.round(cut));
    }
    for (const [clipper, cut] of clipped) {
      issues.push({ ref: mark(clipper), rule: "panel-clip", element: `${name}: ${clipper.tagName.toLowerCase()} ${quote(words(clipper.textContent!))}`, detail: `cuts ${cut}px off its own words (it shows ${clipper.clientWidth}×${clipper.clientHeight}px of ${clipper.scrollWidth}×${clipper.scrollHeight}px)` });
    }
  }
  return issues;
}
