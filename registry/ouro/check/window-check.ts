export { collectWindowBoxes, dragSamples, inTitleBand, judgeDrag, judgeSettled, judgeWindow, toWindow, WINDOW_RULES };
export type { NativeChrome, NativeMeasure, PageBox, PageBoxes, Rect, WindowFinding, WindowCheckOptions };

// Ouro check's window rules: a page as it sits in an app's real native window, judged with no model and no judgement
// call. The page's side is collectWindowBoxes, which runs in the page (page.evaluate, or WebKit's callAsyncJavaScript
// through Ouro Feel's window probe, feel/hosts/window/OuroWindowProbe.swift), so nothing in it may close over anything
// outside the function. The window's side is the probe's measure: the title bar's band and every native chrome element
// (traffic lights, toolbar items) from the window's own accessibility tree. judgeWindow puts the two in one coordinate
// space, window points from the top left, and holds them to these rules:
//
//   chrome-overlap         a page element (text, control or picture) under a native chrome control; zero tolerance
//   under-title-bar        a page element in the band the title bar and toolbar take, where the window drags and the
//                          toolbar's glass blurs what is under it; with the probe's hit test (reach), only one whose
//                          middle the title bar takes, so a click there moves the window instead of reaching the page
//   outside-window         an element that runs past the window's edge where nothing can scroll it into view
//   ghost-layer            the same picture or the same words drawn twice, one over the other
//
// Where the page draws the window's title bar (a TitleBar), judgeDrag holds its band to a native title bar's manners,
// from the app's own answer at points across the band (the probe's drag): every empty point moves the window
// (band-not-draggable), and a press on a control never does (control-drags).
//
// The page's own rules run in the page as they are, in the same window: overlap (overlap-check.ts), clipped-text
// (size-check.ts) and target size (axe's target-size, runAxe); windowBox puts each one's element in window points.
//
// judgeSettled compares a state's first frame with the same state settled: an element that moved more than 2 px, came in
// after the first frame, or faded, is a finding (moved-after-first-frame, popped-in, faded).
//
// An element opts out of a rule with data-ouro-allow="<rule ids>" and data-ouro-allow-why="<reason>", as the other rules
// do; an allow without a reason does not count.

const WINDOW_RULES = [
  "chrome-overlap",
  "under-title-bar",
  "outside-window",
  "ghost-layer",
  "band-not-draggable",
  "control-drags",
  "moved-after-first-frame",
  "popped-in",
  "faded",
] as const;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageBox {
  // A path that names the element the same way in each frame: tag and position under each ancestor.
  id: string;
  kind: "text" | "control" | "image";
  label: string;
  rect: Rect;
  // The part of it drawn: its box cut by every box around it that clips (a scroller, overflow hidden) and by the page's
  // edges. The window rules judge this part; what a scroller hides is not on screen.
  vis: Rect;
  // Whether the element is drawn on top at its middle (the hit test finds it, or an element it holds or that holds it).
  top: boolean;
  // Whether it is drawn on top anywhere: at the middle or a corner of its drawn part.
  seen: boolean;
  // Past the page's edge where nothing scrolls it into view.
  outside?: boolean;
  // A picture's source, or the words, for ghost-layer.
  same?: string;
  opacity: number;
  // Ancestor ids, to tell when one element holds another.
  path: string[];
  // The nearest control that holds it (its id), so parts of one control never count against each other.
  control?: string;
  allow: string[];
  // Set by the runner from the probe's hit test: whether a click at its middle reaches the page, and what takes it if not.
  reach?: { content: boolean; view?: string };
}

interface PageBoxes {
  viewport: { width: number; height: number };
  zoom: number;
  items: PageBox[];
}

interface NativeChrome {
  role: string;
  subrole?: string;
  label?: string | null;
  parent?: string;
  control: boolean;
  frame: Rect;
}

interface NativeMeasure {
  window: { width: number; height: number };
  scale?: number;
  appearance?: string;
  fullScreen?: boolean;
  titleBand: Rect;
  chrome: NativeChrome[];
  content?: Rect;
}

interface WindowFinding {
  rule: (typeof WINDOW_RULES)[number];
  element: string;
  detail: string;
  // Window points from the top left: where to crop.
  box: Rect;
}

interface WindowCheckOptions {
  moveTolerance?: number;
}

// Runs in the page. Collects every visible text run, control and picture, with what the rules need about each.
function collectWindowBoxes(): PageBoxes {
  const CONTROL = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [role=checkbox], [role=switch], [role=radio], [role=combobox], [role=textbox], [role=slider], [contenteditable=''], [contenteditable=true]";
  const IMAGE = "img, svg, canvas, video, [role=img]";
  const ignored = "[hidden], template, script, style, noscript, .visually-hidden, .sr-only";
  const vw = document.documentElement.clientWidth || innerWidth;
  const vh = document.documentElement.clientHeight || innerHeight;
  const ids = new Map<Element, string>();
  const idOf = (el: Element): string => {
    const known = ids.get(el);
    if (known) return known;
    const parent = el.parentElement;
    let id = el.tagName.toLowerCase();
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === el.tagName);
      id = `${idOf(parent)}>${id}${same.length > 1 ? `:${same.indexOf(el) + 1}` : ""}`;
    }
    ids.set(el, id);
    return id;
  };
  const pathOf = (el: Element) => {
    const out: string[] = [];
    for (let n = el.parentElement; n; n = n.parentElement) out.push(idOf(n));
    return out;
  };
  const allowOf = (el: Element) => {
    const out: string[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const why = (n.getAttribute("data-ouro-allow-why") ?? "").trim();
      if (why) out.push(...(n.getAttribute("data-ouro-allow") ?? "").split(/\s+/).filter(Boolean));
    }
    return out;
  };
  const opacityOf = (el: Element) => {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const shown = (el: Element) => {
    if (el.closest(ignored) || el.closest("[aria-hidden=true] svg, [inert]")) return false;
    const s = getComputedStyle(el);
    if (s.visibility !== "visible" || s.display === "none") return false;
    return opacityOf(el) > 0.05;
  };
  const describe = (el: Element, text?: string) => {
    const words = (text ?? el.getAttribute("aria-label") ?? el.getAttribute("alt") ?? el.getAttribute("title") ?? el.textContent!).trim().replace(/\s+/g, " ");
    return `${el.tagName.toLowerCase()}${words ? ` "${words.slice(0, 50)}"` : ""}`;
  };
  const round = (r: { left: number; top: number; width: number; height: number }) => ({
    x: Math.round(r.left * 100) / 100,
    y: Math.round(r.top * 100) / 100,
    width: Math.round(r.width * 100) / 100,
    height: Math.round(r.height * 100) / 100,
  });
  const related = (a: Element, b: Element | null) => !!b && (a === b || a.contains(b) || b.contains(a));
  const topAt = (el: Element, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= vw || y >= vh) return { top: false, by: null as Element | null };
    const hit = document.elementFromPoint(x, y);
    // A label or picture inside the control, or the control's own box: the same target.
    if (related(el, hit)) return { top: true, by: null };
    const control = el.closest(CONTROL);
    if (control && related(control, hit)) return { top: true, by: null };
    return { top: false, by: hit };
  };
  // Wholly outside a box that hides overflow around it: hidden on purpose (a closed drawer), so not drawn.
  const hiddenByClip = (el: Element, r: { left: number; top: number; right: number; bottom: number }) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const c = n.getBoundingClientRect();
      if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) return true;
    }
    return false;
  };
  const scrollable = (el: Element) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)) return true;
    }
    const root = document.scrollingElement;
    return !!root && (root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1);
  };
  // The part of a box drawn: cut by every clipping box around it and the page's edges.
  const visible = (el: Element, r: { left: number; top: number; right: number; bottom: number }) => {
    let left = Math.max(0, r.left), top = Math.max(0, r.top), right = Math.min(vw, r.right), bottom = Math.min(vh, r.bottom);
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const c = n.getBoundingClientRect();
      left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
    }
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  const items: PageBox[] = [];
  const base = (el: Element, kind: PageBox["kind"], label: string, r: DOMRect | { left: number; top: number; width: number; height: number; right: number; bottom: number }) => {
    const control = el.closest(CONTROL);
    const v = visible(el, r);
    const box: PageBox = { id: idOf(el) + (kind === "text" ? "#text" : ""), kind, label, rect: round(r), vis: round(v), top: false, seen: false, opacity: Math.round(opacityOf(el) * 100) / 100, path: pathOf(el), allow: allowOf(el) };
    if (control && control !== el) box.control = idOf(control);
    if (kind === "control") box.control = idOf(el);
    box.top = topAt(el, r.left + r.width / 2, r.top + r.height / 2).top && !hiddenByClip(el, r);
    const inset = (a: number, b: number) => Math.min(2, b / 4) + a;
    box.seen = v.width > 0 && v.height > 0 && (box.top || [[v.left + v.width / 2, v.top + v.height / 2], [inset(v.left, v.width), inset(v.top, v.height)], [v.left + v.width - inset(0, v.width), inset(v.top, v.height)], [inset(v.left, v.width), v.top + v.height - inset(0, v.height)], [v.left + v.width - inset(0, v.width), v.top + v.height - inset(0, v.height)]].some(([x, y]) => topAt(el, x!, y!).top));
    // Cut by the window's edge: partly in the window and partly past it. Wholly past it is nobody's to see (a parked
    // live region, a closed drawer), so it isn't cut.
    const inside = r.right > 0.5 && r.bottom > 0.5 && r.left < vw - 0.5 && r.top < vh - 0.5;
    const past = r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.left < -0.5 || r.top < -0.5;
    if (inside && past && !scrollable(el)) box.outside = true;
    return box;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.currentNode as Element | null; node; node = walker.nextNode() as Element | null) {
    const el = node;
    if (!shown(el)) continue;
    if (el.matches(CONTROL)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        items.push(base(el, "control", describe(el), r));
      }
    }
    if (el.matches(IMAGE) && !el.parentElement?.closest("svg")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const src = el instanceof HTMLImageElement ? el.currentSrc || el.src : el instanceof SVGElement ? el.innerHTML.replace(/\s+/g, " ").slice(0, 400) : "";
        const box = base(el, "image", describe(el), r);
        if (src) box.same = `${el.tagName}:${src}`;
        items.push(box);
      }
    }
    // Its own words: the text nodes directly in it, measured as drawn.
    const texts = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (!texts.length || el.closest("svg")) continue;
    const range = document.createRange();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const t of texts) {
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        left = Math.min(left, r.left); top = Math.min(top, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
      }
    }
    if (!(right > left && bottom > top)) continue;
    const words = texts.map((t) => t.textContent!).join(" ").trim().replace(/\s+/g, " ");
    const r = { left, top, right, bottom, width: right - left, height: bottom - top };
    const box = base(el, "text", describe(el, words), r);
    box.same = `text:${words}`;
    items.push(box);
  }
  return { viewport: { width: vw, height: vh }, zoom: 1, items };
}

// The page's box in window points: the content view's frame plus the page's own zoom.
function toWindow(r: Rect, content: Rect | undefined, zoom = 1): Rect {
  const at = content ?? { x: 0, y: 0, width: 0, height: 0 };
  return { x: at.x + r.x * zoom, y: at.y + r.y * zoom, width: r.width * zoom, height: r.height * zoom };
}

// The page's drawn elements in the title bar's band, and the middle of each in window points: what the runner asks the
// probe's hit test about.
function inTitleBand(native: NativeMeasure, page: PageBoxes): { id: string; point: [number, number] }[] {
  if (native.titleBand.height <= 0) return [];
  return page.items
    .filter((b) => b.top && b.opacity > 0.05)
    .map((b) => ({ b, w: toWindow(b.vis ?? b.rect, native.content, page.zoom || 1) }))
    .filter(({ w }) => meet(w, native.titleBand))
    .map(({ b, w }) => ({ id: b.id, point: [w.x + w.width / 2, Math.min(w.y + w.height / 2, native.titleBand.y + native.titleBand.height - 1)] as [number, number] }));
}

const meet = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  return right - x > 0.01 && bottom - y > 0.01 ? { x, y, width: right - x, height: bottom - y } : null;
};
const area = (r: Rect) => r.width * r.height;
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};
const fmt = (r: Rect) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
const allowed = (b: PageBox, rule: string) => b.allow.includes(rule) || b.allow.includes("all");
const holds = (a: PageBox, b: PageBox) => b.path.includes(a.id.replace(/#text$/, "")) || a.path.includes(b.id.replace(/#text$/, "")) || a.id.replace(/#text$/, "") === b.id.replace(/#text$/, "");

function judgeWindow(native: NativeMeasure, page: PageBoxes): WindowFinding[] {
  const out: WindowFinding[] = [];
  const zoom = page.zoom || 1;
  const items = page.items.map((b) => ({ ...b, win: toWindow(b.vis ?? b.rect, native.content, zoom) }));
  const win: Rect = { x: 0, y: 0, width: native.window.width, height: native.window.height };
  const drawn = items.filter((b) => b.top && b.opacity > 0.05 && meet(b.win, win));
  const chrome = native.chrome.filter((c) => c.control);

  const overChrome = new Set<string>();
  for (const b of drawn) {
    if (allowed(b, "chrome-overlap")) continue;
    for (const c of chrome) {
      const m = meet(b.win, c.frame);
      if (!m) continue;
      overChrome.add(b.id);
      out.push({ rule: "chrome-overlap", element: b.label, detail: `${b.kind} at ${fmt(b.win)} is under the window's ${c.label || c.role} (${c.role}${c.subrole ? ` ${c.subrole}` : ""}) at ${fmt(c.frame)}: ${Math.round(area(m))} pt² overlap`, box: union(b.win, c.frame) });
    }
  }
  if (native.titleBand.height > 0)
    for (const b of drawn) {
      if (overChrome.has(b.id) || allowed(b, "under-title-bar") || b.reach?.content) continue;
      const m = meet(b.win, native.titleBand);
      if (m) out.push({ rule: "under-title-bar", element: b.label, detail: `${b.kind} at ${fmt(b.win)} reaches ${Math.round(m.height)} pt into the title bar's ${Math.round(native.titleBand.height)} pt band${b.reach ? `, and the title bar (${b.reach.view || "its frame"}) takes a click at its middle` : ""}`, box: union(b.win, native.titleBand) });
    }



  for (const b of items) {
    if (b.outside && !allowed(b, "outside-window")) out.push({ rule: "outside-window", element: b.label, detail: `at ${fmt(b.win)}, past the ${Math.round(win.width)}×${Math.round(win.height)} window, and nothing scrolls it into view`, box: b.win });
  }

  const bySame = new Map<string, typeof drawn>();
  for (const b of items) if (b.same && b.seen !== false && b.opacity > 0.05 && meet(b.win, win)) bySame.set(b.same, [...(bySame.get(b.same) ?? []), b]);
  for (const group of bySame.values())
    for (const [i, a] of group.entries())
      for (const b of group.slice(i + 1)) {
        if (holds(a, b) || allowed(a, "ghost-layer") || allowed(b, "ghost-layer")) continue;
        const m = meet(a.win, b.win);
        if (m && area(m) >= 0.25 * Math.min(area(a.win), area(b.win))) out.push({ rule: "ghost-layer", element: a.label, detail: `drawn twice: at ${fmt(a.win)} and at ${fmt(b.win)}`, box: union(a.win, b.win) });
      }
  return out;
}

function judgeSettled(native: NativeMeasure, first: PageBoxes, settled: PageBoxes, { moveTolerance = 2 }: WindowCheckOptions = {}): WindowFinding[] {
  const out: WindowFinding[] = [];
  const zoom = settled.zoom || 1;
  const win: Rect = { x: 0, y: 0, width: native.window.width, height: native.window.height };
  const before = new Map(first.items.map((b) => [b.id, b]));
  for (const b of settled.items) {
    if (!b.top || b.opacity <= 0.05) continue;
    const at = toWindow(b.rect, native.content, zoom);
    if (!meet(at, win)) continue;
    const a = before.get(b.id);
    if (!a || !a.top || a.opacity <= 0.05) {
      if (!allowed(b, "popped-in")) out.push({ rule: "popped-in", element: b.label, detail: `not drawn in the first frame; drawn at ${fmt(at)} once settled`, box: at });
      continue;
    }
    const was = toWindow(a.rect, native.content, zoom);
    const moved = Math.max(Math.abs(at.x - was.x), Math.abs(at.y - was.y), Math.abs(at.width - was.width), Math.abs(at.height - was.height));
    if (moved > moveTolerance && !allowed(b, "moved-after-first-frame")) out.push({ rule: "moved-after-first-frame", element: b.label, detail: `from ${fmt(was)} in the first frame to ${fmt(at)} settled`, box: union(was, at) });
    if (Math.abs(a.opacity - b.opacity) > 0.05 && !allowed(b, "faded")) out.push({ rule: "faded", element: b.label, detail: `opacity ${a.opacity} in the first frame, ${b.opacity} settled`, box: at });
  }
  return out;
}

// Points across a page-drawn title bar's band (window points), to ask the app whether a press there moves the window:
// every `step` along its middle, and along lines 4 points inside its top and bottom edges.
function dragSamples(band: Rect, step = 12): [number, number][] {
  const out: [number, number][] = [];
  for (const y of [band.y + 4, band.y + band.height / 2, band.y + band.height - 4])
    for (let x = band.x + step / 2; x < band.x + band.width; x += step) out.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  return out;
}

function judgeDrag(native: NativeMeasure, page: PageBoxes, samples: { point: [number, number]; drags: boolean }[]): WindowFinding[] {
  const zoom = page.zoom || 1;
  const controls = page.items.filter((b) => b.kind === "control" && b.top && b.opacity > 0.05).map((b) => ({ b, w: toWindow(b.vis ?? b.rect, native.content, zoom) }));
  const chrome = native.chrome.filter((c) => c.control).map((c) => c.frame);
  const at = (r: Rect, [x, y]: [number, number]) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  const out: WindowFinding[] = [];
  const said = new Set<string>();
  for (const { point, drags } of samples) {
    if (chrome.some((r) => at(r, point))) continue;
    const hit = controls.find(({ w }) => at(w, point));
    if (hit && drags && !allowed(hit.b, "control-drags") && !said.has(hit.b.id)) {
      said.add(hit.b.id);
      out.push({ rule: "control-drags", element: hit.b.label, detail: `a press at ${point.join(",")} moves the window instead of reaching the control`, box: hit.w });
    }
    // A full-screen window doesn't move, so its bar's empty part rightly doesn't drag it.
    if (!hit && !drags && !native.fullScreen) {
      const key = `empty@${Math.round(point[0] / 48)}`;
      if (said.has(key)) continue;
      said.add(key);
      out.push({ rule: "band-not-draggable", element: "the title bar's empty part", detail: `a press at ${point.join(",")}, on no control, doesn't move the window`, box: { x: point[0] - 6, y: point[1] - 6, width: 12, height: 12 } });
    }
  }
  return out;
}
