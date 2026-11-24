export { beginTrace, findTransitionFaults, stepTrace, TRANSITION_LIMITS };
export type { TransitionFault, TransitionTrace };

// The transition rules' sides. beginTrace and stepTrace run in the page (Playwright's page.evaluate), so neither may
// close over anything outside itself; findTransitionFaults reads their trace anywhere.
//
// A transition is measured as a person sees it, one frame at a time, the same in Chromium and WebKit: after a press,
// every running CSS transition and Web Animation is paused and set to each frame's time in turn (60 frames a second), and
// each element's box, text lines and opacity are read at every step. No clock is needed, so a slow machine cannot change
// the result. Motion that a script drives frame by frame (requestAnimationFrame, a spring) is not stepped, and an
// element with data-ouro-allow="transition" and a reason is not judged.

/** Per element and frame: left, top, right, bottom, lines of text and effective opacity; absent when it isn't drawn. */
type Reading = [number, number, number, number, number, number];

interface TransitionTrace {
  /** Readings by element id: the page before the press, then the stepped frames. */
  frames: Record<string, Reading>[];
  /** An element's role: animated or inside one ("motion"), an ancestor of one ("ancestor") or neither. */
  roles: Record<string, "motion" | "ancestor" | "other">;
  names: Record<string, string>;
  /** Parents by id, so a finding lands on the outermost element. */
  parents: Record<string, string | undefined>;
  /** Ids of the elements that hold their own text, and of those that opt out. */
  texts: string[];
  allowed: string[];
}

interface TransitionFault {
  rule: "jump" | "backtrack" | "sibling-reflow" | "text-rewrap" | "pop-in";
  element: string;
  detail: string;
}

const TRANSITION_LIMITS = Object.freeze({
  /** Travel, in px, below which an edge isn't judged. */
  travel: 8,
  /** Step size, in px and as a share of travel, that is a jump. */
  jumpPx: 24,
  jumpShare: 0.5,
  /** How far an edge may go back before it arrives, in px and as a share of its travel. */
  backPx: 2,
  backShare: 0.1,
  /** The area, in px², of a box whose appearing in one frame is a pop. */
  popArea: 100,
  /** Gap between frames, in ms, past which a stutter shows. */
  frameMs: 50,
});

// Before the press: the page's readings as frame zero, kept for stepTrace.
function beginTrace(): void {
  const ids = new WeakMap<Element, string>();
  let next = 0;
  const read = (): Record<string, Reading> => {
    const out: Record<string, Reading> = {};
    const opacity = new Map<Element, number>();
    let count = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (el.getClientRects().length === 0 || count++ > 800) continue;
      const style = getComputedStyle(el);
      const own = style.visibility === "hidden" ? 0 : Number(style.opacity);
      // querySelectorAll("body *") only returns elements under body, so a match's parentElement is never null;
      // Map#get(null) would read as a miss (undefined) all the same, so the fallback covers both.
      const parent = opacity.get(el.parentElement!) ?? 1;
      opacity.set(el, parent * own);
      const r = el.getBoundingClientRect();
      const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
      const tops = new Set<number>();
      for (const n of text) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const box of range.getClientRects()) tops.add(Math.round(box.top / 4));
      }
      if (!ids.has(el)) ids.set(el, `e${next++}`);
      out[ids.get(el)!] = [r.left, r.top, r.right, r.bottom, tops.size, Math.round(parent * own * 100) / 100];
      (el as unknown as { __ouroText?: boolean }).__ouroText = text.length > 0;
    }
    return out;
  };
  (window as unknown as { __ouroTrace: unknown }).__ouroTrace = { read, ids, first: read() };
}

// After the press: waits a frame for the transitions to start, then steps them and returns every frame.
async function stepTrace(): Promise<TransitionTrace> {
  const state = (window as unknown as { __ouroTrace: { read: () => Record<string, Reading>; ids: WeakMap<Element, string>; first: Record<string, Reading> } }).__ouroTrace;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  const animations = document.getAnimations().filter((a) => Number.isFinite(a.effect!.getComputedTiming().endTime as number) && (a.effect as KeyframeEffect).target);
  const end = Math.min(2000, Math.max(0, ...animations.map((a) => a.effect!.getComputedTiming().endTime as number)));
  for (const a of animations) a.pause();
  const frames = [state.first];
  const steps = animations.length ? Math.ceil(end / (1000 / 60)) : 0;
  for (let i = 0; i <= steps; i++) {
    for (const a of animations) a.currentTime = Math.min(i * (1000 / 60), a.effect!.getComputedTiming().endTime as number);
    frames.push(state.read());
  }
  for (const a of animations) a.finish();
  const targets = animations.map((a) => (a.effect as KeyframeEffect).target!);
  const roles: TransitionTrace["roles"] = {};
  const names: TransitionTrace["names"] = {};
  const parents: TransitionTrace["parents"] = {};
  const texts: string[] = [];
  const allowed: string[] = [];
  for (const el of document.querySelectorAll("body *")) {
    const id = state.ids.get(el);
    if (!id) continue;
    // Same here: a WeakMap#get of a non-object (a null parentElement, which querySelectorAll("body *") never gives) just
    // reads as undefined, so no separate null check is needed.
    parents[id] = state.ids.get(el.parentElement!);
    roles[id] = targets.some((t) => el === t || el.contains(t) ? el !== t : false) ? "ancestor" : targets.some((t) => t.contains(el)) ? "motion" : "other";
    names[id] = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 2).join(".")}` : ""}`;
    if ((el as unknown as { __ouroText?: boolean }).__ouroText) texts.push(id);
    const allow = el.closest("[data-ouro-allow~=transition], [data-ouro-allow~=all]");
    if (allow && (allow.getAttribute("data-ouro-allow-why") ?? "").trim()) allowed.push(id);
  }
  return { frames: animations.length ? frames : [], roles, names, parents, texts, allowed };
}

// The faults a trace holds, at most one of each kind for an element, and none on an element whose parent has the same
// one. A trace with no animation has no frames to judge.
function findTransitionFaults(trace: TransitionTrace): TransitionFault[] {
  const L = TRANSITION_LIMITS;
  const found: (TransitionFault & { id: string })[] = [];
  const stepped = trace.frames.slice(1);
  const skip = new Set(trace.allowed);
  const px = (n: number) => `${Math.round(n)}px`;
  const area = (s?: Reading) => (s ? (s[2] - s[0]) * (s[3] - s[1]) : 0);
  for (const id of Object.keys(trace.roles).filter((key) => !skip.has(key))) {
    const element = trace.names[id]!;
    const role = trace.roles[id];
    const series = stepped.map((f) => f[id]);
    const present = series.filter((s): s is Reading => !!s);
    const whole = present.length === series.length;
    const add = (rule: TransitionFault["rule"], detail: string) => void (found.some((f) => f.id === id && f.rule === rule) || found.push({ id, rule, element, detail }));
    for (const [edge, label] of [[0, "left edge"], [1, "top edge"], [2, "right edge"], [3, "bottom edge"]] as const) {
      const pts = present.map((s) => s[edge]);
      const net = pts[pts.length - 1]! - pts[0]!;
      const travel = Math.abs(net);
      if (role !== "motion" || travel < L.travel) continue;
      const deltas = pts.slice(1).map((v, i) => v - pts[i]!);
      const limit = Math.max(L.jumpPx, L.jumpShare * travel);
      const biggest = Math.max(...deltas.map(Math.abs));
      // Going back counts only before the edge first arrives within 1px of where it ends.
      const arrived = pts.findIndex((v) => Math.abs(v - pts[pts.length - 1]!) <= 1);
      const back = deltas.slice(0, arrived).filter((d) => Math.sign(d) === -Math.sign(net)).reduce((sum, d) => sum + Math.abs(d), 0);
      if (biggest >= limit) add("jump", `its ${label} moved ${px(biggest)} in one frame of a ${px(travel)} move (over ${px(limit)})`);
      else if (back > Math.max(L.backPx, L.backShare * travel)) add("backtrack", `its ${label} went back ${px(back)} before it arrived, on a ${px(travel)} move`);
    }
    const moved = present.some((s, i) => i > 0 && s.slice(0, 4).some((v, k) => Math.abs(v - present[i - 1]![k]!) >= 1));
    if (role === "other" && whole && moved) add("sibling-reflow", "it moved or resized while something else was in motion: a transition must not make the page lay out again around it");
    const lines = [...new Set(present.map((s) => s[4]))];
    if (trace.texts.includes(id) && whole && lines.length > 1) add("text-rewrap", `its text re-wrapped mid-transition, between ${lines.join(" and ")} lines`);
    const shown = series.map((s) => (s ? s[5] : 0));
    const big = trace.texts.includes(id) || series.some((s) => area(s) >= L.popArea);
    // The last frame may end a thing; every frame before it must show a change gradually.
    const step = big ? shown.slice(1, -1).findIndex((v, i) => Math.abs(v - shown[i]!) >= 0.8) : -1;
    if (stepped.length >= 3 && step >= 0) add("pop-in", `it went from ${shown[step] ? "shown" : "hidden"} to ${shown[step + 1] ? "shown" : "hidden"} within one frame of a ${stepped.length}-frame transition`);
  }
  return found.filter((f) => !found.some((g) => g.id === trace.parents[f.id] && g.rule === f.rule)).map(({ rule, element, detail }) => ({ rule, element, detail }));
}
