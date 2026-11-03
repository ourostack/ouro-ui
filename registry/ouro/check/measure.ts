export { findLoadingIssues, interactionSince, listenForMeasures, markPressables, pressPoint };
export type { LoadingBudgets, Measures, Pressable };

import type { PageIssue } from "./size-check.ts";

// The measured rules' in-page side. Playwright runs these functions in the page (page.evaluate and
// context.addInitScript), so none of them may close over anything outside itself.
//
//   layout-shift   how far the page moved under the reader while it loaded: its cumulative layout shift, the
//                  largest burst of shifts no input caused, as browsers score it
//   first-content  how long the page took to draw its largest text or picture, its first useful content; a skeleton
//                  draws neither, so a page that shows one first is timed to what replaces it
//   inp            how long a press took to paint: for each control the app lists for pressing, the longest event of
//                  its press, from the press to the next frame drawn after its handlers ran
//
// An element opts out with data-ouro-allow="<rule>" and a reason in data-ouro-allow-why, as the other rules do.

interface Measures {
  shift: number;
  shiftNode: Node | null;
  paint: number;
  paintNode: Element | null;
  events: { start: number; duration: number }[];
  /** Adds a layout-shift entry to the score: kept apart so a test can feed it shifts. */
  add: (entry: { value: number; startTime: number; hadRecentInput: boolean; sources: { node: Node | null }[] }) => void;
}

interface LoadingBudgets {
  "layout-shift": number;
  "first-content": number;
}

interface Pressable {
  ref: string;
  element: string;
}

// An init script: records layout shifts, the largest content drawn, and the events of each press, from the page's start.
function listenForMeasures(): void {
  // The burst under way: its score, when it began and its last shift, and the node of its largest shift.
  let burst = 0;
  let first = -Infinity;
  let last = -Infinity;
  let worst = 0;
  let worstNode: Node | null = null;
  const m: Measures = {
    shift: 0,
    shiftNode: null,
    paint: 0,
    paintNode: null,
    events: [],
    add(entry) {
      if (entry.hadRecentInput) return;
      // A burst ends after a second without a shift, or five seconds after it began.
      if (entry.startTime - last > 1000 || entry.startTime - first > 5000) {
        burst = 0;
        first = entry.startTime;
        worst = 0;
        worstNode = null;
      }
      burst += entry.value;
      last = entry.startTime;
      const node = entry.sources.map((source) => source.node).find(Boolean);
      if (node && entry.value > worst) {
        worst = entry.value;
        worstNode = node;
      }
      // The score is the largest burst's, and the node the one that moved most in that burst.
      if (burst > m.shift) {
        m.shift = burst;
        m.shiftNode = worstNode;
      }
    },
  };
  (window as unknown as { __ouroCheckMeasures: Measures }).__ouroCheckMeasures = m;
  new PerformanceObserver((list) => list.getEntries().forEach((entry) => m.add(entry as unknown as Parameters<Measures["add"]>[0]))).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { element: Element | null })[]) {
      m.paint = entry.startTime;
      m.paintNode = entry.element;
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  // A press's events have an interactionId; a pointer passing over does not.
  new PerformanceObserver((list) => {
    const presses = (list.getEntries() as (PerformanceEntry & { interactionId: number })[]).filter((entry) => entry.interactionId);
    m.events.push(...presses.map((entry) => ({ start: entry.startTime, duration: entry.duration })));
  }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
}

// The loading rules, read once the page is ready and its pictures decoded, and two frames later, when the browser has
// reported what the last of them drew: a finding for a page that shifted more than its budget, marked on the element
// that moved most, and one for a page whose largest content drew later than its budget, marked on that content.
async function findLoadingIssues(budgets: LoadingBudgets): Promise<PageIssue[]> {
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 50))));
  const m = (window as unknown as { __ouroCheckMeasures: Measures }).__ouroCheckMeasures;
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const why = '[data-ouro-allow-why]:not([data-ouro-allow-why=""])';
  const words = (el: Element) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ");
  const name = (el: Element) => {
    const w = words(el);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}${w ? ` "${w.slice(0, 40)}${w.length > 40 ? "…" : ""}"` : ""}`;
  };
  const report = (rule: keyof LoadingBudgets, node: Node | null, value: number, detail: string) => {
    const found = node instanceof Element ? node : (node?.parentElement ?? null);
    // Content that has left the page since is named as the page, and pictured as the screen.
    const el = found?.isConnected ? found : document.body;
    if (el.closest(`[data-ouro-allow~="${rule}"]${why}, [data-ouro-allow~="all"]${why}`)) return;
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const ref = `m${counter.__ouroCheckRef}`;
    el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${ref}`.trim());
    issues.push({ ref, rule, element: el === document.body ? "the page" : name(el), detail, value, budget: budgets[rule], unit: rule === "layout-shift" ? "" : "ms" });
  };
  const shift = Math.round(m.shift * 1000) / 1000;
  if (shift > budgets["layout-shift"]) report("layout-shift", m.shiftNode, shift, `shifted ${shift} while loading, over the budget of ${budgets["layout-shift"]}`);
  const paint = Math.round(m.paint);
  if (paint > budgets["first-content"]) report("first-content", m.paintNode, paint, `${paint} ms to its largest content, over the budget of ${budgets["first-content"]} ms`);
  return issues;
}

// Marks the first `limit` controls listed for pressing, shown and enabled, and names each: the ones ouro-check.json's
// "press" selectors match, and the ones marked data-ouro-check-press. Pressing is opt-in because a press does what it
// says, on whatever server the app talks to. Even when listed, it never marks a control with a destructive tone or
// inside one (Ouro's and shadcn's destructive classes, or data-tone or data-variant "destructive"), one marked
// data-ouro-check-no-press, a link, whatever its role, which would leave the page, or a form's submit button, inside
// the form or tied to it by its form attribute, which would send it.
function markPressables({ limit, press }: { limit: number; press: string[] }): Pressable[] {
  const counter = window as unknown as { __ouroCheckRef?: number };
  // A reason of spaces is no reason: trimmed in place, so the selectors below see it empty.
  for (const el of document.querySelectorAll("[data-ouro-allow-why]")) el.setAttribute("data-ouro-allow-why", el.getAttribute("data-ouro-allow-why")!.trim());
  const why = '[data-ouro-allow-why]:not([data-ouro-allow-why=""])';
  const never = `a[href], area[href], [data-ouro-check-no-press], [data-tone="destructive"], [data-variant="destructive"], [class*="destructive"], [data-ouro-allow~="inp"]${why}, [data-ouro-allow~="all"]${why}`;
  const words = (el: Element) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ");
  const name = (el: Element) => {
    const w = words(el);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}${w ? ` "${w.slice(0, 40)}${w.length > 40 ? "…" : ""}"` : ""}`;
  };
  const pressable = (el: Element) => {
    if (el.matches(':disabled, [aria-disabled="true"]') || el.closest(never)) return false;
    if (el.matches("button") && (el as HTMLButtonElement).form && (el as HTMLButtonElement).type === "submit") return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  return [...document.querySelectorAll([...press, "[data-ouro-check-press]"].join(", "))]
    .filter(pressable)
    .slice(0, limit)
    .map((el) => {
      counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
      const ref = `p${counter.__ouroCheckRef}`;
      el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${ref}`.trim());
      return { ref, element: name(el) };
    });
}

// Where to press a marked control, in the screen's coordinates once it is scrolled into view; null when it has left
// the page, or something else covers its middle.
function pressPoint(ref: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-ouro-check-ref~="${ref}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
}

// The longest event of the presses since `since` (performance.now()), in ms, once two frames have drawn; 0 when every
// one took less than 16 ms, the shortest the browser reports.
async function interactionSince(since: number): Promise<number> {
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 50))));
  const { events } = (window as unknown as { __ouroCheckMeasures: Measures }).__ouroCheckMeasures;
  return Math.max(0, ...events.filter((e) => e.start >= since).map((e) => e.duration));
}
