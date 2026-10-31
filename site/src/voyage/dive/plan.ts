/**
 * The Dive moment in the theme sample (repaint.tsx): what pressing Dive plays, as plain data, so
 * the scene (dive.tsx) only draws it. The checklist decides the details: a hatch left open lets the
 * sea in with a splash, an untested lantern flickers, a harpooner nobody woke sleeps through it all.
 */

/** How deep she goes, in fathoms (the dialog's promise). */
export const DIVE_DEPTH = 300;

/** The stretches of a dive, in milliseconds, with motion: the water rises, she goes down, stays, comes up. */
export const MOTION = {
  flood: 600,
  descend: 2200,
  deep: 1400,
  surface: 1000,
} as const;
/** With reduced motion nothing moves: the deep fades in, holds still, and fades out. */
export const STILL = { fadeIn: 400, hold: 2600, fadeOut: 400 } as const;
/** How long a dive ended early takes to clear the window. */
export const LEAVE = 300;

export type Phase = "flood" | "descend" | "deep" | "surface" | "done";

/** Where a dive with motion stands this many milliseconds in: its stretch, and the depth gauge's reading. */
export function moment(elapsed: number): { phase: Phase; fathoms: number } {
  const { flood, descend, deep, surface } = MOTION;
  if (elapsed < flood) return { phase: "flood", fathoms: 0 };
  if (elapsed < flood + descend)
    return {
      phase: "descend",
      fathoms: Math.round(DIVE_DEPTH * ease((elapsed - flood) / descend)),
    };
  if (elapsed < flood + descend + deep) return { phase: "deep", fathoms: DIVE_DEPTH };
  if (elapsed < flood + descend + deep + surface) {
    return {
      phase: "surface",
      fathoms: Math.round(DIVE_DEPTH * (1 - ease((elapsed - flood - descend - deep) / surface))),
    };
  }
  return { phase: "done", fathoms: 0 };
}

/** The whole dive's length, with motion or without. */
export const length = (reduced: boolean): number => (reduced ? STILL.fadeIn + STILL.hold + STILL.fadeOut : MOTION.flood + MOTION.descend + MOTION.deep + MOTION.surface);

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export interface DivePlan {
  /** The hatch was left open: the sea comes in with a splash. */
  splash: boolean;
  /** Nobody tested the lantern: it flickers. */
  flicker: boolean;
  /** Nobody woke the harpooner: he sleeps through the dive. */
  sleeper: boolean;
  /** What the crew says when she is back up: the toast, and the one thing screen readers hear. */
  line: { title: string; description: string };
}

/** The dive the checklist makes: the details of the scene, and the crew's line at the end. */
export function planDive(checked: ReadonlySet<string>): DivePlan {
  const splash = !checked.has("hatch");
  const flicker = !checked.has("lights");
  const sleeper = !checked.has("harpooner");
  const title = splash ? "Back up, and a little wet" : "Back from the deep";
  let description: string;
  if (splash) description = "Ned, the harpooner: Someone left the hatch open. I'm soaked, and I'm still against this.";
  else if (flicker) description = "Conseil, the helper: The lantern flickered the whole way. Lucky the fish bring their own lights.";
  else if (sleeper) description = "Conseil, the helper: Ned slept through the whole dive. He'd still like it noted that he's against it.";
  else if (!checked.has("tanks")) description = "Conseil, the helper: I filled the ballast tanks on the way down. You're welcome.";
  else description = "Captain Nemo: Hatch shut, lantern bright, Ned awake. The fish glowed, just as I promised.";
  return { splash, flicker, sleeper, line: { title, description } };
}
