import type {} from "@vitest/browser-playwright";
import type { CDPSession, Frame, Page } from "playwright";
import type { BrowserCommand } from "vitest/node";

export interface EmulateMediaOptions {
  reducedMotion?: "reduce" | "no-preference";
  colorScheme?: "light" | "dark";
}

export interface DragOptions {
  /** Viewport coordinates of the pointer-down point. */
  from: [number, number];
  /** Viewport coordinates of the pointer-up point. */
  to: [number, number];
  /** Number of intermediate mouse moves. */
  steps: number;
  /** Total time the drag takes, in milliseconds. */
  durationMs: number;
  /**
   * Keep the button pressed after the last move, so a test can inspect the
   * mid-drag state. Release with `commands.pointerPress({ action: "up" })`.
   */
  hold?: boolean;
}

/** Wraps Playwright's `page.emulateMedia` for `prefers-reduced-motion` and `prefers-color-scheme`. */
export const emulateMedia: BrowserCommand<[EmulateMediaOptions]> = async (ctx, options) => {
  await ctx.page.emulateMedia(options);
};

/**
 * Drags with real mouse events through Playwright's `page.mouse`, spreading the
 * moves over `durationMs` so velocity-based gestures see a realistic speed.
 * Coordinates are relative to the top-level page (Vitest renders tests in an
 * iframe, so add the iframe offset when starting from an element's rect).
 */
export const drag: BrowserCommand<[DragOptions]> = async (ctx, { from, to, steps, durationMs, hold }) => {
  const { page } = ctx;
  const pause = steps > 0 ? durationMs / steps : 0;
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    await page.mouse.move(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
    if (pause > 0) await page.waitForTimeout(pause);
  }
  if (!hold) await page.mouse.up();
};

export interface FlickOptions {
  /** Viewport coordinates of the pointer-down point. */
  from: [number, number];
  /** Viewport coordinates of the pointer-up point. */
  to: [number, number];
  /** Number of intermediate mouse moves. */
  steps: number;
  /** Time from press to release, as the page's event timestamps report it, in milliseconds. */
  durationMs: number;
}

/** One CDP session per page, reused across flicks. */
const cdpSessions = new WeakMap<object, CDPSession>();

/**
 * A mouse gesture with exact timing, for velocity tests (Chromium only). It
 * dispatches through CDP `Input.dispatchMouseEvent` with explicit timestamps,
 * so `event.timeStamp` in the page spans exactly `durationMs`, however busy the
 * machine is. `drag` instead spends a round trip and a wait per step, so a "40ms"
 * flick takes about 80ms unloaded and over 150ms on a loaded CI runner, which a
 * velocity check then reads as a slow drag. Use `drag` for slow drags.
 */
export const flick: BrowserCommand<[FlickOptions]> = async (ctx, { from, to, steps, durationMs }) => {
  const { page } = ctx;
  if (ctx.provider.name !== "playwright" || page.context().browser()?.browserType().name() !== "chromium") {
    throw new Error("flick: CDP input is Chromium only; use drag elsewhere");
  }
  let session = cdpSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    cdpSessions.set(page, session);
  }
  const start = Date.now() / 1000;
  const send = (type: "mouseMoved" | "mousePressed" | "mouseReleased", [x, y]: [number, number], atMs: number, buttons: number) =>
    session.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1, timestamp: start + atMs / 1000 });
  await send("mouseMoved", from, 0, 0);
  await send("mousePressed", from, 0, 1);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const point: [number, number] = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    await send("mouseMoved", point, durationMs * t, 1);
  }
  await send("mouseReleased", to, durationMs, 0);
};

/** How long a touch command waits for the page to handle an event before it throws. */
const TOUCH_HANDLED_TIMEOUT_MS = 5000;

/**
 * Runs in every frame of the page, as source text because an app's config for this file may
 * lack DOM types. It keeps `__ouroTouch` on the frame's window while a gesture is under way:
 * passive listeners that record the touch events the frame handles, and at most one expected
 * event. The listeners capture on `window` and, from touchstart on, also sit on the touch's
 * target, because a touch's later events go to that target even after it has left the
 * document, where they no longer reach `window`.
 */
const TOUCH_WATCH = `(action, expected) => {
  const view = window;
  let state = view.__ouroTouch;
  if (action === "inspect") {
    let unwatched = 0;
    for (let index = 0; index < view.length; index++) {
      try {
        if (!view[index].__ouroTouch) unwatched++;
      } catch {}
    }
    return { href: view.location.href, readyState: view.document.readyState, watching: Boolean(state), children: view.length, unwatched };
  }
  // A frame that navigated keeps its window but loses the listeners: watch its new document afresh.
  if (state && state.document !== view.document) {
    state.remove();
    state = undefined;
  }
  if (!state) {
    if (action !== "expect") return { seen: false, moved: false, saw: [] };
    const types = ["touchstart", "touchmove", "touchend", "touchcancel"];
    const options = { capture: true, passive: true };
    state = view.__ouroTouch = { document: view.document, saw: [], handled: new WeakSet(), targets: new Set(), expected: null, seen: false, resolve: null, moved: false };
    // Where this frame's top left is in the top-level page, in CSS pixels, or null if a parent is cross-origin.
    const origin = () => {
      let x = 0, y = 0;
      try {
        for (let frame = view; frame !== frame.parent; frame = frame.parent) {
          const box = frame.frameElement.getBoundingClientRect();
          x += box.left + frame.frameElement.clientLeft;
          y += box.top + frame.frameElement.clientTop;
        }
        return { x, y };
      } catch {
        return null;
      }
    };
    state.listener = (event) => {
      if (state.handled.has(event)) return;
      state.handled.add(event);
      const at = origin();
      // Each changed touch as the point CDP names for it, also on a zoomed page.
      const points = [...event.changedTouches].map((touch) => (at ? [touch.clientX + at.x, touch.clientY + at.y] : null));
      state.saw.push(event.type + points.map((point) => (point ? "(" + Math.round(point[0]) + ", " + Math.round(point[1]) + ")" : "(?)")).join(""));
      if (event.type === "touchstart") state.moved = false;
      if (event.type === "touchmove") state.moved = true;
      if (event.type === "touchstart" && !state.targets.has(event.target)) {
        state.targets.add(event.target);
        for (const type of types.slice(1)) event.target.addEventListener(type, state.listener, { passive: true });
      }
      const want = state.expected;
      if (!want) return;
      if ((event.type === "touchcancel" ? "touchend" : event.type) !== want.type) return;
      if (!points.some((point) => !point || (Math.abs(point[0] - want.x) <= 1 && Math.abs(point[1] - want.y) <= 1))) return;
      state.expected = null;
      state.seen = true;
      if (state.resolve) state.resolve();
    };
    state.remove = () => {
      for (const type of types) view.removeEventListener(type, state.listener, options);
      for (const target of state.targets) for (const type of types.slice(1)) target.removeEventListener(type, state.listener, { passive: true });
      delete view.__ouroTouch;
    };
    for (const type of types) view.addEventListener(type, state.listener, options);
  }
  if (action === "expect") {
    state.expected = expected;
    state.seen = false;
    state.saw = [];
    return { children: view.length };
  }
  if (action === "wait") {
    const result = () => ({ seen: state.seen, moved: state.moved, saw: state.saw });
    // A touchmove before the gesture's first one in this frame is not on its way: see sendTouch.
    if (state.seen || !state.expected || (state.expected.type === "touchmove" && !state.moved)) return result();
    return new Promise((resolve) => {
      const timer = setTimeout(() => state.resolve(), ${TOUCH_HANDLED_TIMEOUT_MS});
      state.resolve = () => {
        clearTimeout(timer);
        state.resolve = null;
        resolve(result());
      };
    });
  }
  // "settle": stop waiting in this frame, and stop watching once the finger is up.
  state.expected = null;
  if (state.resolve) state.resolve();
  if (expected.type === "touchend") state.remove();
  return null;
}`;

interface TouchPoint {
  type: "touchStart" | "touchMove" | "touchEnd";
  x: number;
  y: number;
}
interface TouchSeen {
  /** The frame handled the expected event. */
  seen: boolean;
  /** The frame has handled a touchmove in this gesture. */
  moved: boolean;
  /** The touch events the frame handled while it waited. */
  saw: string[];
}

type TouchWatchAction = "expect" | "wait" | "settle" | "inspect";
/** One frame's answer to a `TOUCH_WATCH` call, or why the call failed. */
interface FrameAnswer<T> {
  frame: Frame;
  url: string;
  action: TouchWatchAction;
  value?: T;
  error?: string;
}
interface FrameState {
  href: string;
  readyState: string;
  watching: boolean;
  children: number;
  unwatched: number;
}

/** Calls `TOUCH_WATCH` in every frame of the page Playwright lists. A failed call is kept, with its reason. */
function watchTouch<T>(page: Page, action: TouchWatchAction, point: TouchPoint): Promise<FrameAnswer<T>>[] {
  const call = `(${TOUCH_WATCH})(${JSON.stringify(action)}, ${JSON.stringify({ ...point, type: point.type.toLowerCase() })})`;
  return page.frames().map((frame) =>
    frame.evaluate<T>(call).then(
      (value) => ({ frame, url: frame.url(), action, value }),
      (error: unknown) => ({ frame, url: frame.url(), action, error: (error instanceof Error ? error.message : String(error)).split("\n")[0]! }),
    ),
  );
}

/**
 * Starts the watch for `expected` in every frame of the page, and resolves once every frame
 * the page has is watched. Playwright learns of a new frame, and of a frame's new document,
 * from Chromium on its own connection, which can lag the page: a test that adds an iframe,
 * awaits its `load` and touches it can get here before Playwright lists the frame, and a
 * touch into a frame with no watcher is never seen. So each watched frame reports how many
 * child frames its window has, and this starts over, when Playwright's frames change, until
 * every frame has that many watched children. It throws if they never agree.
 */
async function watchEveryFrame(command: string, page: Page, expected: TouchPoint): Promise<FrameAnswer<{ children: number }>[]> {
  const deadline = Date.now() + TOUCH_HANDLED_TIMEOUT_MS;
  for (;;) {
    // Listen before asking, so a change during the calls is not missed.
    let changed!: () => void;
    const change = new Promise<void>((resolve) => (changed = resolve));
    page.on("frameattached", changed).on("framenavigated", changed).on("framedetached", changed);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const answers = (await Promise.all(watchTouch<{ children: number }>(page, "expect", expected))).filter(({ frame }) => !frame.isDetached());
      const watched = new Set(answers.filter((answer) => answer.value).map((answer) => answer.frame));
      const behind = answers.filter(({ frame, value }) => !value || frame.childFrames().filter((child) => watched.has(child)).length !== value.children);
      if (behind.length === 0) return answers;
      const expired = new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), Math.max(0, deadline - Date.now()))));
      if (await Promise.race([change.then(() => false), expired])) {
        await Promise.all(watchTouch(page, "settle", expected));
        throw new Error(
          `${command}: could not watch every frame of the page within ${TOUCH_HANDLED_TIMEOUT_MS}ms, so the ${expected.type} was not sent. ` +
            behind
              .map(({ frame, url, value, error }) =>
                value
                  ? `${url} has ${value.children} child frames, and ${frame.childFrames().filter((child) => watched.has(child)).length} of them are watched`
                  : `${url} could not be watched: ${error}`,
              )
              .join("; ") +
            ".",
        );
      }
    } finally {
      clearTimeout(timer);
      page.off("frameattached", changed).off("framenavigated", changed).off("framedetached", changed);
    }
  }
}

/**
 * Sends touch input and resolves once the page has handled the `expected` event, the last
 * one sent. CDP resolves a touch event when Chromium's renderer has queued it for the page.
 * For an event the page can cancel, that is after the page has handled it. Once a swipe
 * scrolls, the page can't cancel the rest of it, and CDP resolves first
 * (`MainThreadEventQueue::HandleEvent` in Chromium's main_thread_event_queue.cc runs the reply
 * right after `QueueEvent`). The page then handles a touchend up to a frame later and a
 * touchmove up to 200ms later: at the start of each frame `DispatchRafAlignedInput` dispatches
 * what is queued, except a touchmove that is alone in the queue less than 200ms after the
 * last one (`kAsyncTouchMoveInterval`).
 *
 * So this watches for the event itself in every frame of the page, matched by the point it
 * was sent to, and throws if the page does not handle it. One event is never on its way: a
 * touchmove that stays within Chromium's slop distance of the touchstart, which Chromium
 * keeps from the page. The page can still cancel such a move, so CDP has already waited for
 * it; it is told apart as a touchmove sent before the page has handled any in this gesture.
 */
async function sendTouch(command: string, page: Page, expected: TouchPoint, send: () => Promise<unknown>) {
  const none: TouchSeen = { seen: false, moved: false, saw: [] };
  const expects = await watchEveryFrame(command, page, expected);
  let results: TouchSeen[];
  let answers: FrameAnswer<TouchSeen>[];
  let states: FrameAnswer<FrameState>[] = [];
  try {
    await send();
    const waits = watchTouch<TouchSeen>(page, "wait", expected);
    // The first frame to see it ends the wait in the others.
    let seen = false;
    const firstSeen = waits.map((wait) => wait.then((answer) => (answer.value?.seen ? (seen = true) : new Promise(() => {}))));
    await Promise.race([Promise.all(waits), ...firstSeen]);
    if (!seen) {
      // Every wait has ended. If that is a failure, say what state each frame is in before the watchers go.
      results = (await Promise.all(waits)).map((answer) => answer.value ?? none);
      if (expected.type !== "touchMove" || results.some((result) => result.moved)) {
        states = await Promise.all(watchTouch<FrameState>(page, "inspect", expected));
      }
    }
    await Promise.all(watchTouch(page, "settle", expected));
    answers = await Promise.all(waits);
    results = answers.map((answer) => answer.value ?? none);
  } catch (error) {
    await Promise.all(watchTouch(page, "settle", expected));
    throw error;
  }
  if (results.some((result) => result.seen)) return;
  if (expected.type === "touchMove" && !results.some((result) => result.moved)) return;
  const saw = results.flatMap((result) => result.saw);
  // What was watched: every frame, and every call into one that failed, with its reason.
  const failed = [...expects, ...answers, ...states].filter((answer) => answer.error !== undefined);
  const frames = states.map(({ url, value }) =>
    value
      ? `${url} (${value.watching ? "watching" : "no watcher"}, ${value.readyState}${value.children > 0 ? `, ${value.children} child frames, ${value.unwatched} of them with no watcher` : ""})`
      : `${url} (not reachable)`,
  );
  throw new Error(
    `${command}: the page did not handle the ${expected.type} at (${Math.round(expected.x)}, ${Math.round(expected.y)}) within ${TOUCH_HANDLED_TIMEOUT_MS}ms. ` +
      `It handled: ${saw.length > 0 ? saw.join(" ") : "no touch events"}. Is the page visible and rendering, and is the point inside it? ` +
      `Watched ${expects.length} ${expects.length === 1 ? "frame" : "frames"} before the touch; at the end: ${frames.join("; ")}. ` +
      `Failed calls: ${failed.length > 0 ? failed.map((answer) => `${answer.action} in ${answer.url}: ${answer.error}`).join("; ") : "none"}.`,
  );
}

export interface TouchDragOptions {
  /** Viewport coordinates where the finger touches down. */
  from: [number, number];
  /** Viewport coordinates where the finger lifts. */
  to: [number, number];
  /** Number of intermediate moves. */
  steps: number;
  /**
   * Time from touch down to lift, as the page's event timestamps report it, in milliseconds.
   * Set it when the gesture's speed matters, as for a swipe over scroll snap points: the
   * browser flings on from the speed at lift. Without it the speed is however fast the test
   * machine sends the moves, which differs from run to run.
   */
  durationMs?: number;
}

/**
 * A one-finger drag with real touch input (Chromium only, through CDP
 * `Input.dispatchTouchEvent`), so the page sees `pointerType: "touch"` pointer events
 * and touch events, as from a phone: a swipe to dismiss. Needs a context with
 * `hasTouch`, as in the `touch` project. Coordinates are relative to the top-level page.
 * It resolves once the page has handled the whole gesture, touchend included, and throws if
 * the page has not within 5 seconds.
 */
export const touchDrag: BrowserCommand<[TouchDragOptions]> = async (ctx, { from, to, steps, durationMs }) => {
  const { page } = ctx;
  if (ctx.provider.name !== "playwright" || page.context().browser()?.browserType().name() !== "chromium") {
    throw new Error("touchDrag: CDP input is Chromium only");
  }
  let session = cdpSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    cdpSessions.set(page, session);
  }
  const start = Date.now() / 1000;
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", [x, y]: [number, number], t: number) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      ...(durationMs === undefined ? {} : { timestamp: start + (durationMs * t) / 1000 }),
    });
  await releaseFinger("touchDrag", page, session);
  await sendTouch("touchDrag", page, { type: "touchEnd", x: to[0], y: to[1] }, async () => {
    await touch("touchStart", from, 0);
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      await touch("touchMove", [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], t);
    }
    await touch("touchEnd", to, 1);
  });
};

export interface PointerPressOptions {
  /** CSS selector of the element to press, inside the test iframe. Not needed for `up`. */
  selector?: string;
  /** `down` moves to the element's center and presses; `up` releases. */
  action: "down" | "up";
}

/**
 * Presses or releases the real mouse over an element, so `:active` styles apply.
 * Coordinates come from Playwright, so the iframe offset is already included.
 */
export const pointerPress: BrowserCommand<[PointerPressOptions]> = async (ctx, { selector, action }) => {
  const { page } = ctx;
  if (action === "up") {
    await page.mouse.up();
    return;
  }
  if (!selector) throw new Error("pointerPress: down needs a selector");
  const box = await ctx.iframe.locator(selector).boundingBox();
  if (!box) throw new Error(`pointerPress: ${selector} is not visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
};

/**
 * Taps an element inside the test iframe with real touch input (Playwright's
 * `locator.tap`), so the page sees `pointerType: "touch"`. Needs a context with
 * `hasTouch`, as in the `touch` project.
 */
export const tap: BrowserCommand<[selector: string]> = async (ctx, selector) => {
  await ctx.iframe.locator(selector).tap();
};

/** The top-level page's zoom (`visualViewport.scale`): 1 unless something zoomed the page. */
export const pageZoom: BrowserCommand<[]> = async (ctx) =>
  // Runs in the page; written without DOM types, which an app's config for this file may lack.
  ctx.page.evaluate(() => (globalThis as { visualViewport?: { scale: number } | null }).visualViewport?.scale ?? 1);

/** One CDP session for a Chromium page, or undefined in another browser. */
async function chromiumSession(ctx: Parameters<BrowserCommand<[]>>[0]): Promise<CDPSession | undefined> {
  const { page } = ctx;
  if (ctx.provider.name !== "playwright" || page.context().browser()?.browserType().name() !== "chromium") return undefined;
  let session = cdpSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    cdpSessions.set(page, session);
  }
  return session;
}

/**
 * Sets the top-level page's zoom back to 1 (Chromium, through CDP; elsewhere it does nothing).
 * In a phone context (`isMobile`), Chromium can zoom the page when the viewport rotates, and
 * rotating back does not undo it; `rotate` in testing/rotate.ts calls this after each resize.
 */
export const resetPageZoom: BrowserCommand<[]> = async (ctx) => {
  await (await chromiumSession(ctx))?.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
};

/** Zooms the top-level page to `scale` (Chromium only), for testing code that checks the zoom. */
export const setPageZoom: BrowserCommand<[scale: number]> = async (ctx, scale) => {
  const session = await chromiumSession(ctx);
  if (!session) throw new Error("setPageZoom: CDP is Chromium only");
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
};

/**
 * Turns the page's touch emulation back on (Chromium, through CDP; elsewhere it does nothing).
 * Chromium drops it, for the rest of the page's life, after a screenshot that reaches beyond
 * the viewport, such as the one Vitest takes when a test fails on a tall page: the page then
 * reports a fine pointer that can hover. The `ouro-touch` project calls this before every test.
 */
export const restoreTouch: BrowserCommand<[]> = async (ctx) => {
  await (await chromiumSession(ctx))?.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
};

export type TouchStepOptions =
  | {
      /** `touchStart` puts the finger down and `touchMove` moves it. */
      type: "touchStart" | "touchMove";
      /** Where the finger is, relative to the top-level page. */
      x: number;
      y: number;
    }
  | { /** Lifts the finger. */ type: "touchEnd"; x?: number; y?: number };

/** Where the finger `touchStep` left down is, for each page that has one, and whether the page handled its touchstart. */
const fingersDown = new WeakMap<object, { x: number; y: number; handled: boolean }>();

/** Lifts a finger `touchStep` left down, so the next gesture starts clean. */
async function releaseFinger(command: string, page: Page, session: CDPSession) {
  const finger = fingersDown.get(page);
  if (!finger) return;
  fingersDown.delete(page);
  const send = () => session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const end = { type: "touchEnd" as const, x: finger.x, y: finger.y };
  if (finger.handled) return sendTouch(command, page, end, send);
  // A page that never handled the touchstart gets no touchend to wait for.
  await send();
  await Promise.all(watchTouch(page, "settle", end));
}

/**
 * One step of a one-finger gesture with real touch input (Chromium only, through CDP), for
 * gestures `touchDrag` can't make: a finger that stops and stays down mid-swipe. The same
 * finger stays down between calls until `touchEnd`. Lift it in a `finally`, so a failed
 * assertion mid-gesture doesn't leave it down; a finger left down anyway is lifted before
 * the next `touchStart` or `touchDrag`.
 *
 * Each step resolves once the page has handled its event, and throws if the page has not
 * within 5 seconds. Once the gesture scrolls the page, Chromium hands the page at most one
 * touchmove every 200ms, so a `touchMove` step can take that long.
 */
export const touchStep: BrowserCommand<[TouchStepOptions]> = async (ctx, step) => {
  const session = await chromiumSession(ctx);
  if (!session) throw new Error("touchStep: CDP input is Chromium only");
  const { page } = ctx;
  if (step.type === "touchEnd") return releaseFinger("touchStep", page, session);
  if (step.type === "touchStart") await releaseFinger("touchStep", page, session);
  const { type, x, y } = step;
  const send = () => session.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x, y, id: 1 }] });
  const last = fingersDown.get(page);
  const finger = { x, y, handled: type === "touchMove" && (last?.handled ?? false) };
  fingersDown.set(page, finger);
  // Chromium sends the page nothing for a move to where the finger already is.
  if (type === "touchMove" && last?.x === x && last.y === y) await send();
  else await sendTouch("touchStep", page, { type, x, y }, send);
  if (type === "touchStart") finger.handled = true;
};

export const commands = { emulateMedia, drag, flick, pageZoom, pointerPress, resetPageZoom, restoreTouch, setPageZoom, tap, touchDrag, touchStep };

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia: (options: EmulateMediaOptions) => Promise<void>;
    drag: (options: DragOptions) => Promise<void>;
    flick: (options: FlickOptions) => Promise<void>;
    tap: (selector: string) => Promise<void>;
    touchDrag: (options: TouchDragOptions) => Promise<void>;
    touchStep: (options: TouchStepOptions) => Promise<void>;
    pointerPress: (options: PointerPressOptions) => Promise<void>;
    pageZoom: () => Promise<number>;
    resetPageZoom: () => Promise<void>;
    restoreTouch: () => Promise<void>;
    setPageZoom: (scale: number) => Promise<void>;
  }
}
