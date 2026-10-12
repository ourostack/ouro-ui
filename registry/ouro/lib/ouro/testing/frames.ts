export { holdFrames };
export type { HeldFrames };

/** Animation frames held by `holdFrames`. */
interface HeldFrames {
  /** Lets `ms` pass and runs the frames asked for so far, once. Frames they ask for wait for the next step. */
  step(ms?: number): void;
  /** Steps `ms` at a time until `done` returns true; throws after 2000 steps. */
  until(done: () => boolean, ms?: number): void;
  /** Gives frames and the clock back to the browser, and asks it for the frames still waiting. */
  release(): void;
}

/**
 * Holds `requestAnimationFrame` and `performance.now()` still, so a test decides when a
 * frame runs and what time it is. A spring or any other frame-driven motion then stands
 * exactly where the test left it, however slow the machine: assert on it mid-flight,
 * catch it with a pointer, then `until` it has come to rest.
 *
 * While frames are held, nothing that waits for a real frame resolves, `expect.poll`
 * included when it waits on motion: step instead. Always `release()` in `afterEach`.
 *
 * @example
 * const frames = holdFrames();
 * await release(finger);
 * frames.step(16);
 * expect(row.hasAttribute("data-ouro-settling")).toBe(true);
 * frames.until(() => !row.hasAttribute("data-ouro-settling"));
 * frames.release();
 */
function holdFrames(): HeldFrames {
  const real = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame, now: performance.now };
  const waiting = new Map<number, FrameRequestCallback>();
  let time = performance.now();
  let last = 0;
  let held = true;
  // Held frames count down from -1, so they never share a handle with a frame the browser
  // was asked for before the hold: cancelling one of those still reaches the browser.
  window.requestAnimationFrame = (callback) => {
    waiting.set(--last, callback);
    return last;
  };
  window.cancelAnimationFrame = (handle) => {
    if (!waiting.delete(handle)) real.cancel.call(window, handle);
  };
  performance.now = () => time;
  const step = (ms = 16) => {
    if (!held) throw new Error("holdFrames: these frames were released");
    time += ms;
    const due = [...waiting];
    for (const [handle, callback] of due) {
      // A frame an earlier one cancelled does not run.
      if (waiting.delete(handle)) callback(time);
    }
  };
  return {
    step,
    until(done, ms = 16) {
      for (let count = 0; !done(); count++) {
        if (count === 2000) throw new Error(`holdFrames: still not done after ${count} steps of ${ms}ms`);
        step(ms);
      }
    },
    release() {
      if (!held) return;
      held = false;
      window.requestAnimationFrame = real.request;
      window.cancelAnimationFrame = real.cancel;
      performance.now = real.now;
      for (const callback of waiting.values()) requestAnimationFrame(callback);
      waiting.clear();
    },
  };
}
