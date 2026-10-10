import { spring } from "motion";

/** A spring as two CSS values: how long it runs and the `linear()` easing that shapes it. */
export type CssSpring = { duration: string; easing: string };

/**
 * Turns Motion's `spring(visualDuration, bounce)` into CSS parts. Motion returns a
 * transition string such as `750ms linear(0, 0.07, ...)`. The spring runs longer than
 * `visualDuration` because it settles after it first reaches the target.
 */
export function cssSpring(visualDuration: number, bounce: number): CssSpring {
  const transition = String(spring(visualDuration, bounce));
  const split = transition.indexOf(" ");
  return { duration: transition.slice(0, split), easing: transition.slice(split + 1) };
}
