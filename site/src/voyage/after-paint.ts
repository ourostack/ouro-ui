import { startTransition, useEffect, useState } from "react";

/**
 * A value that follows `value` once the frame that shows the change has painted: what a press
 * changes besides its own control (the porthole's picture, the yard's job list) follows it, so the
 * press paints first (site/e2e/*.latency.spec.ts). The porthole's picture is mostly SVG layers of
 * engraved drawings, and a change to them (the sea's depth, a bubble) lays out the drawing again:
 * tens of milliseconds on a slow CPU. As a deferred render (`useDeferredValue`) React may commit it
 * before the browser paints the press, whenever the next frame is further off than React's render,
 * and then that frame does that work first. Set from a task after the press's frame instead
 * (afterPaint), it always lands after the press.
 */
export function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = useState(value);
  useEffect(() => afterPaint(() => startTransition(() => setShown(value))), [value]);
  return shown;
}

/**
 * Runs `then` in a task after the next frame, the one that shows a press, and returns a cancel.
 * That frame is already handed to the compositor to draw, so `then` doesn't hold it up; a task a
 * frame later still would leave the work closer to the next press.
 */
export function afterPaint(then: () => void): () => void {
  let timer = 0;
  const frame = requestAnimationFrame(() => {
    timer = window.setTimeout(then);
  });
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}
