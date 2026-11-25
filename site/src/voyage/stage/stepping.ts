import type { SceneState } from "./scene";

/** A change of depth smaller than this many fathoms is a step of the lever; a dive or a surfacing is larger. */
const STEP = 30;

/** How long a change fades in the picture (stage.css --stage-fade is the slow duration), with some to spare. */
const FADE_MS = 700;

/** What the picture shows besides the depth and when it changed, as one string: its values are all primitives, so equal strings are equal states. */
const same = (state: SceneState): string => String(Object.values({ ...state, depth: 0, changedAt: 0 }));

/** When the picture's last change is done fading. Loaded with the first press of the depth lever, so the page's own fades are allowed to finish first. */
let fading = performance.now() + FADE_MS;

/**
 * Marks the picture's root as stepping (data-stepping, which stage.css reads) when the change from `before` to `state` is a small step of the depth lever
 * and nothing else: its change is too small to need fading in, and a fade is an animation the page starts, runs and repaints for each step. A step that
 * comes while an earlier change is still fading is no step, so it does not cut that fade short, and does not extend the wait. It is set on the root
 * before the browser works out the new style, so the step's transitions never start. This lives apart from the picture (scene.tsx) so the home page's
 * first load does not pay for it: it loads with the first press of the depth lever, whose own fade is the one the page shows today. `before` is the
 * caller's own record of the state shown immediately before `state`, tracked synchronously on every render regardless of when this module has loaded,
 * so a press that arrives while the module is still loading is never silently dropped from the history this reads. The fading window reads
 * `state.changedAt` rather than its own clock, because the picture's own commit (and so this call) is delayed by a frame and a task (useAfterPaint),
 * independently for each change: two presses close together can still arrive here far apart, which would wrongly start a new fade for the second one.
 */
export function markStep(root: HTMLElement | null, before: SceneState | undefined, state: SceneState): void {
  const gap = Math.abs(state.depth - (before?.depth ?? NaN));
  const small = gap > 0 && gap < STEP && same(state) === same(before!);
  const now = state.changedAt;
  if (!small) fading = now + FADE_MS;
  root?.toggleAttribute("data-stepping", small && now >= fading);
}
