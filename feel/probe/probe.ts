// Ouro Feel's probe: the one meter every host puts first in the page, before the page's own scripts
// (feel/README.md). It counts and measures; it never reads text, so a report holds counts and
// timings only. Loaded with `data-ouro-feel-bridge="<url>"` on its script tag, it also takes
// commands from that address by long-poll, so a runner can drive a page it does not own.

/** What a case tells the probe to watch. */
export interface WatchOptions {
  /** The case's name, such as `history-prepend` or `scroll`. */
  case: string;
  /** The scrolling list. */
  scroller: Element;
  /** What counts as a row in the list, for the anchor, blank frames and rows mounted. */
  rows: string;
  /** What a loading placeholder is: one in view makes a `blankFramesInset` frame. @default '[data-ouro="skeleton"]' */
  skeleton?: string | undefined;
}

/** One run's measures, by name. */
export type Measures = Record<string, number>;

/** What one run of a case reports. */
export interface RunResult {
  case: string;
  /** Whether the case came to rest before its time ran out. */
  settled: boolean;
  measures: Measures;
  /** The engine's own name for itself. */
  userAgent: string;
}

/** The page's API, `window.ouroFeel`. */
export interface OuroFeel {
  version: 1;
  /** Starts measuring. */
  watch(options: WatchOptions): void;
  /** Tells the probe that input it cannot see (a scripted scroll) moved the list by `px`, down positive, so that move is no jump. */
  inputMoved(px: number): void;
  /** Resolves `true` once nothing in the page has changed for `frames` painted frames in a row, or `false` after `timeoutMs`. */
  rest(frames?: number, timeoutMs?: number): Promise<boolean>;
  /** Resolves after the next frame has painted. */
  painted(): Promise<void>;
  /** Stops measuring and returns the run's measures. */
  stop(settled: boolean): RunResult;
  /** Runs a case the page registered in `window.ouroFeelCases`, and returns its result as JSON. */
  run(name: string): Promise<string>;
}

/** A case the page under test defines: it sets the scene, calls `watch`, acts, waits for rest, then `stop`s. */
export type FeelCase = (feel: OuroFeel) => Promise<RunResult>;

declare global {
  interface Window {
    ouroFeel?: OuroFeel;
    ouroFeelCases?: Record<string, FeelCase>;
  }
}

// The first app gate's definitions, under its names, so it reads the same numbers.
// `jumps`: the reader's row moving 100 px or more in one frame, net of the input's own movement.
// `shifts`: the same, 8 px or more. `blankFrames`: none of 5 points down the list falls in a row's box.
const JUMP_PX = 100;
const SHIFT_PX = 8;
const BLANK_PROBES = 5;
// Its stricter options. `jumpsStrict`: a move over 2 px with no input in the last 300 ms, against
// the wheel, or beyond the wheel's summed |deltaY| in that time. `blankFramesInset`: no row inside
// the list's view inset 40 px, or a placeholder in view.
const STRICT_JUMP_PX = 2;
const INPUT_WINDOW_MS = 300;
const BLANK_INSET_PX = 40;
/** A wheel event that has moved nothing after this long, away from the list's ends, is dead input. */
const DEAD_INPUT_MS = 100;

/**
 * The properties and methods that make the engine lay out (Paul Irish's list,
 * https://gist.github.com/paulirish/5d52fb081b3570c81e3a): reading one with a write pending forces a layout.
 */
const layoutGetters: [object, string][] = [
  [HTMLElement.prototype, "offsetTop"],
  [HTMLElement.prototype, "offsetLeft"],
  [HTMLElement.prototype, "offsetWidth"],
  [HTMLElement.prototype, "offsetHeight"],
  [HTMLElement.prototype, "offsetParent"],
  [HTMLElement.prototype, "innerText"],
  [Element.prototype, "clientTop"],
  [Element.prototype, "clientLeft"],
  [Element.prototype, "clientWidth"],
  [Element.prototype, "clientHeight"],
  [Element.prototype, "scrollTop"],
  [Element.prototype, "scrollLeft"],
  [Element.prototype, "scrollWidth"],
  [Element.prototype, "scrollHeight"],
];
const layoutMethods: [object, string][] = [
  [Element.prototype, "getBoundingClientRect"],
  [Element.prototype, "getClientRects"],
  [Element.prototype, "scrollIntoView"],
  [HTMLElement.prototype, "focus"],
  [Document.prototype, "elementFromPoint"],
  [Document.prototype, "elementsFromPoint"],
];

interface Wheel {
  at: number;
  deltaY: number;
  scrollTop: number;
  resolved: boolean;
}

function install(): OuroFeel {
  /** True while the probe itself reads layout, so its own reads count for nothing. */
  let own = false;
  let watching: WatchOptions | undefined;

  // A write is pending from the moment the DOM changes until the next frame has painted. The
  // observer's records say so synchronously (`takeRecords`), and its callback keeps the flag when
  // a microtask delivers them before the next read.
  let pending = false;
  let changedSinceSample = false;
  let added = 0;
  const observer = new MutationObserver((records) => {
    pending = true;
    changedSinceSample = true;
    countAdded(records);
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });

  function countAdded(records: MutationRecord[]): void {
    if (watching === undefined) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(watching.rows)) added += 1;
        added += node.querySelectorAll(watching.rows).length;
      }
    }
  }

  function writePending(): boolean {
    const records = observer.takeRecords();
    if (records.length > 0) {
      changedSinceSample = true;
      countAdded(records);
    }
    return pending || records.length > 0;
  }

  let layoutReads = 0;
  let forcedLayouts = 0;
  let readsThisFrame = 0;
  let mostReadsInAFrame = 0;

  function read(): void {
    if (own || watching === undefined) return;
    layoutReads += 1;
    readsThisFrame += 1;
    if (writePending()) {
      forcedLayouts += 1;
      pending = false;
    }
  }

  for (const [target, name] of layoutGetters) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor?.get === undefined) continue;
    const get = descriptor.get;
    Object.defineProperty(target, name, {
      ...descriptor,
      get(this: unknown) {
        read();
        return get.call(this);
      },
    });
  }
  for (const [target, name] of layoutMethods) {
    const host = target as Record<string, unknown>;
    const original = host[name];
    if (typeof original !== "function") continue;
    host[name] = function (this: unknown, ...args: unknown[]) {
      read();
      return (original as (...rest: unknown[]) => unknown).apply(this, args);
    };
  }

  /** Runs `fn` as the probe, whose reads count for nothing. */
  function quietly<T>(fn: () => T): T {
    own = true;
    try {
      return fn();
    } finally {
      own = false;
    }
  }

  // Input the probe can see: trusted wheel events, from the OS or the DevTools Input domain alike.
  const wheels: Wheel[] = [];
  addEventListener(
    "wheel",
    (event) => {
      if (watching === undefined) return;
      // Lines and pages, which a mouse wheel may send, as pixels.
      const deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? quietly(() => watching!.scroller.clientHeight) : 1);
      inputSinceSample += deltaY;
      wheelInputs += 1;
      wheels.push({ at: event.timeStamp, deltaY, scrollTop: quietly(() => watching!.scroller.scrollTop), resolved: false });
    },
    { capture: true, passive: true },
  );

  // Frames: a requestAnimationFrame loop marks each frame, and a task posted from it runs once the
  // engine has laid out and painted that frame, which is where the probe samples what the reader saw.
  const afterPaint = new MessageChannel();
  const paintWaiters: (() => void)[] = [];
  let lastFrameAt = 0;
  let longestFrame = 0;
  let frames = 0;
  /** The input's own movement since the last sample, in px down: wheel deltas and scripted scrolls. */
  let inputSinceSample = 0;
  let anchor: Element | undefined;
  let anchorTop = 0;
  let jumps = 0;
  let jumpMaxPx = 0;
  let jumpsStrict = 0;
  let jumpStrictMaxPx = 0;
  let shifts = 0;
  let anchorShiftPx = 0;
  let drift = 0;
  let anchorMovePx = 0;
  let blankFrames = 0;
  let blankFramesInset = 0;
  let deadInput = 0;
  let wheelInputs = 0;
  let quietFrames = 0;

  function frame(at: number): void {
    if (lastFrameAt > 0 && watching !== undefined) longestFrame = Math.max(longestFrame, at - lastFrameAt);
    lastFrameAt = at;
    afterPaint.port2.postMessage(null);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  afterPaint.port1.onmessage = () => {
    // Everything written before this frame was laid out to paint it.
    writePending();
    pending = false;
    const changed = changedSinceSample;
    changedSinceSample = false;
    let moved = false;
    if (watching !== undefined) {
      const options = watching;
      frames += 1;
      mostReadsInAFrame = Math.max(mostReadsInAFrame, readsThisFrame);
      readsThisFrame = 0;
      moved = quietly(() => sample(options));
    }
    quietFrames = changed || moved ? 0 : quietFrames + 1;
    for (const resolve of paintWaiters.splice(0)) resolve();
  };

  /** The list's rows and their boxes, read once a frame: a large list's rows are many, and reading them again is the probe's own cost. */
  function rowBoxes(options: WatchOptions): [Element, DOMRect][] {
    return [...options.scroller.querySelectorAll(options.rows)].map((row) => [row, row.getBoundingClientRect()]);
  }

  /** The row nearest the middle of the list's view, and its top in the view. */
  function middleRow(rows: [Element, DOMRect][], box: DOMRect): [Element, number] | undefined {
    const middle = box.top + box.height / 2;
    let best: [Element, number] | undefined;
    let distance = Infinity;
    for (const [row, rect] of rows) {
      if (rect.bottom < box.top || rect.top > box.bottom) continue;
      const away = Math.abs((rect.top + rect.bottom) / 2 - middle);
      if (away < distance) [best, distance] = [[row, rect.top - box.top], away];
    }
    return best;
  }

  /** Measures the frame just painted; true when the reader's row moved. */
  function sample(options: WatchOptions): boolean {
    const box = options.scroller.getBoundingClientRect();
    const rows = rowBoxes(options);
    const boxOf = new Map(rows);
    const now = performance.now();
    const recent = wheels.filter((wheel) => now - wheel.at <= INPUT_WINDOW_MS);
    const recentInput = recent.reduce((sum, wheel) => sum + wheel.deltaY, 0);
    let moved = false;

    // The anchor: the row at the middle of the view, followed into this frame by element.
    if (anchor?.isConnected) {
      const move = (boxOf.get(anchor) ?? anchor.getBoundingClientRect()).top - box.top - anchorTop;
      moved = move !== 0;
      // Scrolling down (a positive delta) moves content up the screen.
      const net = move + inputSinceSample;
      if (Math.abs(net) >= JUMP_PX) {
        jumps += 1;
        jumpMaxPx = Math.max(jumpMaxPx, Math.abs(net));
        anchorShiftPx += Math.abs(net);
      }
      const summed = recent.reduce((sum, wheel) => sum + Math.abs(wheel.deltaY), 0) + Math.abs(inputSinceSample - recentInput);
      const direction = Math.sign(recentInput || inputSinceSample);
      const unexplained = summed === 0 || (direction !== 0 && Math.sign(move) === direction) || Math.abs(move) > summed;
      if (Math.abs(move) > STRICT_JUMP_PX && unexplained) {
        jumpsStrict += 1;
        jumpStrictMaxPx = Math.max(jumpStrictMaxPx, Math.abs(move));
      }
      if (Math.abs(net) >= SHIFT_PX) shifts += 1;
      drift += net;
      anchorMovePx = Math.max(anchorMovePx, Math.abs(drift));
    }
    inputSinceSample = 0;
    const next = middleRow(rows, box);
    anchor = next?.[0];
    anchorTop = next?.[1] ?? 0;

    // Dead input: a wheel event that has moved nothing for 100 ms, away from the list's ends.
    const scrollTop = options.scroller.scrollTop;
    const atEnd = scrollTop <= 0 || scrollTop >= options.scroller.scrollHeight - options.scroller.clientHeight - 1;
    for (const wheel of wheels) {
      if (wheel.resolved) continue;
      if (scrollTop !== wheel.scrollTop || atEnd) wheel.resolved = true;
      else if (now - wheel.at >= DEAD_INPUT_MS) {
        wheel.resolved = true;
        deadInput += 1;
      }
    }
    const keep = wheels.filter((wheel) => !wheel.resolved || now - wheel.at <= INPUT_WINDOW_MS);
    wheels.length = 0;
    wheels.push(...keep);

    // Blank frames, only while the list holds rows. Read from the rows' boxes, not hit testing: a list that turns off
    // pointer events while it scrolls still shows its rows.
    if (rows.length > 0) {
      const x = box.left + box.width / 2;
      let blank = true;
      for (let probe = 1; probe <= BLANK_PROBES && blank; probe++) {
        const y = box.top + (box.height * probe) / (BLANK_PROBES + 1);
        blank = !rows.some(([, rect]) => rect.width > 0 && rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom);
      }
      if (blank) blankFrames += 1;
      const inset = { top: box.top + BLANK_INSET_PX, bottom: box.bottom - BLANK_INSET_PX, left: box.left + BLANK_INSET_PX, right: box.right - BLANK_INSET_PX };
      const inside = (rect: DOMRect) => rect.bottom > inset.top && rect.top < inset.bottom && rect.right > inset.left && rect.left < inset.right;
      const placeholder = [...options.scroller.querySelectorAll(options.skeleton ?? '[data-ouro="skeleton"]')].some((element) => inside(element.getBoundingClientRect()));
      if (placeholder || !rows.some(([, rect]) => inside(rect))) blankFramesInset += 1;
    }
    return moved;
  }

  const feel: OuroFeel = {
    version: 1,
    watch(options) {
      watching = options;
      layoutReads = forcedLayouts = readsThisFrame = mostReadsInAFrame = 0;
      jumps = jumpMaxPx = jumpsStrict = jumpStrictMaxPx = shifts = anchorShiftPx = drift = anchorMovePx = 0;
      blankFrames = blankFramesInset = deadInput = wheelInputs = frames = added = 0;
      longestFrame = 0;
      inputSinceSample = 0;
      wheels.length = 0;
      const start = quietly(() => middleRow(rowBoxes(options), options.scroller.getBoundingClientRect()));
      anchor = start?.[0];
      anchorTop = start?.[1] ?? 0;
      writePending();
      pending = false;
    },
    inputMoved(px) {
      inputSinceSample += px;
    },
    painted() {
      return new Promise((resolve) => paintWaiters.push(resolve));
    },
    async rest(frameCount = 30, timeoutMs = 15_000) {
      const deadline = performance.now() + timeoutMs;
      quietFrames = 0;
      while (quietFrames < frameCount) {
        if (performance.now() > deadline) return false;
        await feel.painted();
      }
      return true;
    },
    stop(settled) {
      const result: RunResult = {
        case: watching?.case ?? "",
        settled,
        measures: {
          frames,
          blankFrames,
          blankFramesInset,
          jumps,
          jumpMaxPx: Math.round(jumpMaxPx * 10) / 10,
          jumpsStrict,
          jumpStrictMaxPx: Math.round(jumpStrictMaxPx * 10) / 10,
          shifts,
          anchorShiftPx: Math.round(anchorShiftPx),
          anchorMovePx: Math.round(anchorMovePx * 10) / 10,
          deadInput,
          wheelInputs,
          forcedLayouts,
          layoutReads,
          layoutReadsPerFrame: mostReadsInAFrame,
          rowsMounted: added,
          longestFrameMs: Math.round(longestFrame),
        },
        userAgent: navigator.userAgent,
      };
      watching = undefined;
      return result;
    },
    async run(name) {
      if (document.readyState !== "complete") await new Promise((resolve) => addEventListener("load", resolve, { once: true }));
      const run = window.ouroFeelCases?.[name];
      if (run === undefined) throw new Error(`Ouro Feel: this page defines no case "${name}". It defines: ${Object.keys(window.ouroFeelCases ?? {}).join(", ") || "none"}.`);
      return JSON.stringify(await run(feel));
    },
  };
  return feel;
}

/** A command from the runner, by long-poll. */
type Command = { id: number; type: "run"; case: string } | { id: number; type: "title"; title: string };

/** Takes commands from the runner at `base` until it stops answering. */
async function bridge(feel: OuroFeel, base: string): Promise<void> {
  const post = (path: string, body: unknown) => fetch(new URL(path, base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  await post("hello", { userAgent: navigator.userAgent });
  for (;;) {
    let command: Command;
    try {
      const response = await fetch(new URL("next", base), { cache: "no-store" });
      if (response.status === 204) continue;
      if (!response.ok) return;
      command = (await response.json()) as Command;
    } catch {
      return;
    }
    let reply: object;
    try {
      if (command.type === "run") reply = { ok: true, result: JSON.parse(await feel.run(command.case)) as RunResult };
      else {
        document.title = command.title;
        await feel.painted();
        reply = { ok: true };
      }
    } catch (error) {
      reply = { ok: false, error: String(error) };
    }
    await post("result", { id: command.id, ...reply });
  }
}

const base = (document.currentScript as HTMLScriptElement | null)?.dataset.ouroFeelBridge;
if (window.ouroFeel === undefined) {
  window.ouroFeel = install();
  if (base) void bridge(window.ouroFeel, new URL(base, location.href).href);
}
