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

/** Per element and frame: left, top, right, bottom, lines of text, effective opacity and a flag for clipped text; absent when it isn't drawn. */
type Reading = [number, number, number, number, number, number, number];

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
  /** The eased progress of an animated element's own simple animation at the stepped frames, by id for its box and by id with ":fade" for its opacity. */
  progress: Record<string, number[]>;
  allowed: string[];
}

interface TransitionFault {
  rule: "jump" | "backtrack" | "sibling-reflow" | "text-rewrap" | "pop-in" | "overshoot" | "off-curve" | "opacity-step" | "label-clip";
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
  /** How far, in px, an edge may pass its final value, or stray from its own easing curve. */
  curvePx: 2,
  /** How much more opacity than its own curve gives may change in one frame. */
  opacityStep: 0.1,
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
      out[ids.get(el)!] = [r.left, r.top, r.right, r.bottom, tops.size, Math.round(parent * own * 100) / 100, text.length > 0 && style.overflowX !== "visible" && el.scrollWidth > el.clientWidth ? 1 : 0];
      (el as unknown as { __ouroText?: boolean }).__ouroText = text.length > 0;
    }
    return out;
  };
  (window as unknown as { __ouroTrace: unknown }).__ouroTrace = { read, ids, first: read(), before: new Set(document.getAnimations()) };
}

// After the press: waits a frame for the transitions to start, then steps them and returns every frame.
async function stepTrace(): Promise<TransitionTrace> {
  const state = (window as unknown as { __ouroTrace: { read: () => Record<string, Reading>; ids: WeakMap<Element, string>; first: Record<string, Reading>; before: Set<Animation> } }).__ouroTrace;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  // An animation that started after the press belongs to the trace even when a stalled frame ran it to its end before this
  // step; only one that was already there before the press is left out.
  const animations = document.getAnimations().filter((a) => (a.playState !== "finished" || !state.before.has(a)) && Number.isFinite(a.effect!.getComputedTiming().endTime as number) && (a.effect as KeyframeEffect).target);
  const end = Math.min(2000, Math.max(0, ...animations.map((a) => a.effect!.getComputedTiming().endTime as number)));
  for (const a of animations) a.pause();
  // Per element, the longest two-keyframe animation of its box and the longest of its opacity give the curves its edges
  // and its fade are held to.
  const timed = new Map<string, Animation>();
  for (const a of animations) {
    const effect = a.effect as KeyframeEffect;
    const id = state.ids.get(effect.target!);
    const fade = Object.keys(effect.getKeyframes()[0]!).every((k) => ["offset", "easing", "composite", "computedOffset", "opacity"].includes(k));
    const key = `${id}${fade ? ":fade" : ""}`;
    const held = timed.get(key);
    if (id && effect.getKeyframes().length === 2 && (!held || (effect.getComputedTiming().endTime as number) > (held.effect!.getComputedTiming().endTime as number))) timed.set(key, a);
  }
  const progress: TransitionTrace["progress"] = {};
  for (const key of timed.keys()) progress[key] = [];
  const frames = [state.first];
  const steps = animations.length ? Math.ceil(end / (1000 / 60)) : 0;
  for (let i = 0; i <= steps; i++) {
    for (const a of animations) a.currentTime = Math.min(i * (1000 / 60), a.effect!.getComputedTiming().endTime as number);
    frames.push(state.read());
    for (const [key, a] of timed) {
      const eased = a.effect!.getComputedTiming().progress ?? Number(a.currentTime === a.effect!.getComputedTiming().endTime);
      // A CSS animation's timing function lives on its keyframes, so run the progress through it too.
      const between = new Animation(new KeyframeEffect(null, null, { duration: 1, fill: "both", easing: (a.effect as KeyframeEffect).getKeyframes()[0]!.easing }));
      between.currentTime = eased;
      progress[key]!.push(between.effect!.getComputedTiming().progress!);
    }
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
  return { frames: animations.length ? frames : [], roles, names, parents, texts, progress, allowed };
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
    const pace = trace.progress[id];
    const lines = [...new Set(present.map((s) => s[4]))];
    const fadePace = trace.progress[`${id}:fade`];
    const add = (rule: TransitionFault["rule"], detail: string) => void (found.some((f) => f.id === id && f.rule === rule) || found.push({ id, rule, element, detail }));
    for (const [edge, label] of [[0, "left edge"], [1, "top edge"], [2, "right edge"], [3, "bottom edge"]] as const) {
      const pts = present.map((s) => s[edge]);
      const net = pts[pts.length - 1]! - pts[0]!;
      const travel = Math.abs(net);
      if (role !== "motion" || travel < L.travel) continue;
      const deltas = pts.slice(1).map((v, i) => v - pts[i]!);
      const limit = Math.max(L.jumpPx, L.jumpShare * travel);
      const past = Math.max(...pts.map((v) => (v - pts[pts.length - 1]!) * Math.sign(net)));
      const stray = whole && pace && lines.length === 1 ? Math.max(...pts.map((v, i) => Math.abs(v - (pts[0]! + net * pace[i]!)))) : 0;
      const biggest = Math.max(...deltas.map(Math.abs));
      // Going back counts only before the edge first arrives within 1px of where it ends.
      const arrived = pts.findIndex((v) => Math.abs(v - pts[pts.length - 1]!) <= 1);
      const back = deltas.slice(0, arrived).filter((d) => Math.sign(d) === -Math.sign(net)).reduce((sum, d) => sum + Math.abs(d), 0);
      if (biggest >= limit) add("jump", `its ${label} moved ${px(biggest)} in one frame of a ${px(travel)} move (over ${px(limit)})`);
      else if (past > L.curvePx) add("overshoot", `its ${label} went ${px(past)} past where it ends, on a ${px(travel)} move`);
      else if (back > Math.max(L.backPx, L.backShare * travel)) add("backtrack", `its ${label} went back ${px(back)} before it arrived, on a ${px(travel)} move`);
      else if (stray > L.curvePx) add("off-curve", `its ${label} was ${px(stray)} off its own easing curve, on a ${px(travel)} move: something other than the transition is moving it`);
    }
    const moved = present.some((s, i) => i > 0 && s.slice(0, 4).some((v, k) => Math.abs(v - present[i - 1]![k]!) >= 1));
    if (role === "other" && whole && moved) add("sibling-reflow", "it moved or resized while something else was in motion: a transition must not make the page lay out again around it");
    if (trace.texts.includes(id) && whole && lines.length > 1) add("text-rewrap", `its text re-wrapped mid-transition, between ${lines.join(" and ")} lines`);
    const shown = series.map((s) => (s ? s[5] : 0));
    const big = trace.texts.includes(id) || series.some((s) => area(s) >= L.popArea);
    // The last frame may end a thing; every frame before it must show a change gradually.
    const fade = whole && fadePace ? Math.max(...shown.map((v, i) => (i ? Math.abs(v - shown[i - 1]!) - Math.abs(shown[shown.length - 1]! - shown[0]!) * Math.abs(fadePace[i]! - fadePace[i - 1]!) : 0))) : 0;
    const step = big ? shown.slice(1, -1).findIndex((v, i) => Math.abs(v - shown[i]!) >= 0.8) : -1;
    if (stepped.length >= 3 && step >= 0) add("pop-in", `it went from ${shown[step] ? "shown" : "hidden"} to ${shown[step + 1] ? "shown" : "hidden"} within one frame of a ${stepped.length}-frame transition`);
    else if (fade > L.opacityStep) add("opacity-step", `its opacity changed ${fade.toFixed(2)} more than its easing gives in one frame (keep to ${L.opacityStep}): fade it gradually`);
    if (trace.texts.includes(id) && series.some((s) => s?.[6]) && !series[series.length - 1]?.[6]) add("label-clip", "its text was cut off by its own box while the box moved, though it fits at the end: size the box to its text, or clip with the text's own fade");
  }
  return found.filter((f) => !found.some((g) => g.id === trace.parents[f.id] && g.rule === f.rule)).map(({ rule, element, detail }) => ({ rule, element, detail }));
}
