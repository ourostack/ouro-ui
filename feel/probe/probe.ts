// Ouro Feel's probe: the one meter every host puts first in the page, before the page's own scripts
// (feel/README.md). It counts and measures; it never reads text, so a report holds counts and
// timings only. Loaded with `data-ouro-feel-bridge="<url>"` on its script tag, it also takes
// commands from that address by long-poll, so a runner can drive a page it does not own.

/** What a case tells the probe to watch. */
export interface WatchOptions {
  /** The case's name, such as `history-prepend` or `scroll`. */
  case: string;
  /**
   * The scrolling list, or a selector that finds it. A selector is looked up again each frame, so a list put in another's place
   * (an app that opens another conversation in a new list) is the one measured.
   */
  scroller: Element | string;
  /** What counts as a row in the list, for the anchor, blank frames and rows mounted. */
  rows: string;
  /**
   * The attribute that names a row, such as `data-message-id`: the reader's row is followed by it where the page draws the row
   * again as a new element. @default "id"
   */
  rowId?: string | undefined;
  /** What a loading placeholder is: one in view makes a `blankFramesInset` frame. @default "[data-ouro='skeleton'], [aria-busy='true'] [data-ouro='skeleton']" */
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
// A chat app's frame meter's definitions, under its names. `lateFrames`: gaps between frames of 1.5 refreshes or more, where the
// refresh is the median gap, given at least 30 gaps. `longFrames`: gaps over 50 ms. `over16Share`: the share of gaps over 16.7 ms.
const LATE_REFRESHES = 1.5;
const REFRESH_GAPS = 30;
const LONG_FRAME_MS = 50;
const FRAME_60HZ_MS = 16.7;

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
}

/** A wheel event waiting for the list to move its way: when it came, how many frames had been sampled then, and which way. */
interface Motion {
  at: number;
  frame: number;
  direction: number;
}

/** A chat app's frame meter's placeholders: one in view makes a `blankFramesInset` frame. */
const PLACEHOLDERS = "[data-ouro='skeleton'], [aria-busy='true'] [data-ouro='skeleton']";
/** A move of the list under this many px between two frames is none, as the frame meter counts. */
const MOVE_PX = 0.5;

/** The value at the 95th percentile of `values`, which are not empty. */
function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
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

  /** The list being watched now: a selector finds it again, as the page may have put another in its place. */
  function listOf(options: WatchOptions): Element | null {
    return typeof options.scroller === "string" ? document.querySelector(options.scroller) : options.scroller;
  }

  // Input the probe can see: trusted wheel events, from the OS or the DevTools Input domain alike.
  const wheels: Wheel[] = [];
  const motions: Motion[] = [];
  addEventListener(
    "wheel",
    (event) => {
      const list = watching === undefined ? null : listOf(watching);
      if (list === null) return;
      // Lines and pages, which a mouse wheel may send, as pixels.
      const deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? quietly(() => list.clientHeight) : 1);
      inputSinceSample += deltaY;
      wheelInputs += 1;
      // The event's own time, or when it was seen where an engine gives none or one in the future.
      const now = performance.now();
      const at = event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
      wheels.push({ at, deltaY });
      // Where the list was in the last frame sampled, before this input: an engine that scrolls off the main thread may have
      // moved it already by the time the event is dispatched. A wheel that list cannot move, at its end that way, is neither a
      // motion nor dead input.
      const direction = Math.sign(deltaY);
      if (direction === 0) return;
      const [top, max] = sampled ?? quietly(() => [list.scrollTop, list.scrollHeight - list.clientHeight]);
      if ((direction < 0 && top <= MOVE_PX) || (direction > 0 && top >= max - MOVE_PX)) inputAtEdge += 1;
      else motions.push({ at, frame: frames, direction });
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
  /** The gaps between frames while watching, and how long each wheel event took to move the list, in ms and in frames. */
  const gaps: number[] = [];
  /** Where the list was in the last frame sampled, and how far it could scroll: what a wheel event's movement is measured from. */
  let sampled: [number, number] | undefined;
  let inputAtEdge = 0;
  const toMotionMs: number[] = [];
  const toMotionFrames: number[] = [];

  // The loop runs only while there is something to do (a case watching, or a paint someone waits for), so a page with the probe
  // loaded and nothing watched asks for no frames, and idles as it would without it.
  let looping = false;
  function loop(): void {
    if (looping) return;
    looping = true;
    lastFrameAt = 0;
    requestAnimationFrame(frame);
  }
  function frame(at: number): void {
    if (lastFrameAt > 0 && watching !== undefined) {
      longestFrame = Math.max(longestFrame, at - lastFrameAt);
      gaps.push(at - lastFrameAt);
    }
    lastFrameAt = at;
    afterPaint.port2.postMessage(null);
    if (watching !== undefined || paintWaiters.length > 0) requestAnimationFrame(frame);
    else looping = false;
  }

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

  /** Every row and its box. */
  function allRowBoxes(found: NodeListOf<Element>): [Element, DOMRect][] {
    return [...found].map((row) => [row, row.getBoundingClientRect()]);
  }

  /**
   * The rows in the list's view and their boxes, read once a frame. Every measure reads only the rows in view (the anchor
   * reads its own box when it has left it), so the probe reads those and not every row the list holds, which was most of
   * its cost a frame (ourostack/ouro-ui#2107). Rows follow the list's direction in document order, down or up (a list
   * drawn bottom to top), so a binary search finds the first in view. A row that draws nothing (display: none) has no
   * place to search by, and a view with no row in it is what the blank-frame measure needs to see, so either reads every
   * row, as before.
   */
  function rowBoxes(list: Element, rows: string, box: DOMRect): [Element, DOMRect][] {
    const found = list.querySelectorAll(rows);
    const count = found.length;
    if (count < 2) return allRowBoxes(found);
    const boxes = new Map<number, DOMRect>();
    const rectAt = (index: number) => {
      let rect = boxes.get(index);
      if (rect === undefined) boxes.set(index, (rect = found[index]!.getBoundingClientRect()));
      return rect;
    };
    const drawsNothing = (rect: DOMRect) => rect.width === 0 && rect.height === 0;
    const down = rectAt(0).top <= rectAt(count - 1).top;
    // The row at a place in the list's visual order, top to bottom.
    const at = (place: number) => (down ? place : count - 1 - place);
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = (low + high) >> 1;
      const rect = rectAt(at(middle));
      if (drawsNothing(rect)) return allRowBoxes(found);
      if (rect.bottom < box.top) low = middle + 1;
      else high = middle;
    }
    const seen: [Element, DOMRect][] = [];
    for (let place = low; place < count; place++) {
      const rect = rectAt(at(place));
      if (drawsNothing(rect)) return allRowBoxes(found);
      if (rect.top > box.bottom) break;
      seen.push([found[at(place)]!, rect]);
    }
    return seen.length > 0 ? seen : allRowBoxes(found);
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

  /** Measures the frame just painted; true when the reader's row moved. A frame with no list in the page is a blank one. */
  function sample(options: WatchOptions): boolean {
    const list = listOf(options);
    if (list === null) {
      blankFramesInset += 1;
      return false;
    }
    const box = list.getBoundingClientRect();
    const rows = rowBoxes(list, options.rows, box);
    const boxOf = new Map(rows);
    const now = performance.now();
    const recent = wheels.filter((wheel) => now - wheel.at <= INPUT_WINDOW_MS);
    const recentInput = recent.reduce((sum, wheel) => sum + wheel.deltaY, 0);
    let moved = false;

    // The anchor: the row at the middle of the view, followed into this frame by element, or by its id where the page drew it again
    // as a new element (a row re-keyed, or the list drawn again). One that moved out of view is found among all the list's rows,
    // which reads no layout but its own box.
    const name = options.rowId ?? "id";
    const named = anchor?.getAttribute(name);
    const sameName = (row: Element) => row.getAttribute(name) === named;
    const followed = anchor?.isConnected
      ? anchor
      : named
        ? (rows.find(([row]) => sameName(row))?.[0] ?? Array.from(list.querySelectorAll(options.rows)).find(sameName))
        : undefined;
    if (followed !== undefined) {
      const move = (boxOf.get(followed) ?? followed.getBoundingClientRect()).top - box.top - anchorTop;
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

    // Input to motion: from a wheel event to the start of the first frame whose scroll moved its way from the frame before.
    // Dead input: one that took 100 ms or more, or never moved the list.
    const scrollTop = list.scrollTop;
    const delta = scrollTop - (sampled?.[0] ?? scrollTop);
    for (let index = motions.length - 1; index >= 0; index--) {
      const motion = motions[index]!;
      // As the meter does, a wheel waits for a frame that began after it.
      if (motion.at > lastFrameAt || Math.sign(delta) !== motion.direction || Math.abs(delta) < MOVE_PX) continue;
      const ms = Math.max(0, lastFrameAt - motion.at);
      toMotionMs.push(ms);
      toMotionFrames.push(frames - motion.frame);
      if (ms >= DEAD_INPUT_MS) deadInput += 1;
      motions.splice(index, 1);
    }
    const keep = wheels.filter((wheel) => now - wheel.at <= INPUT_WINDOW_MS);
    wheels.length = 0;
    wheels.push(...keep);
    sampled = [scrollTop, list.scrollHeight - list.clientHeight];

    // Blank frames, as a chat app's frame meter counts them (blankFramesInset): no row with height in the view less 40 px at its
    // top and bottom, or a placeholder anywhere in it, in any frame, rows or none. Read from the rows' boxes, not hit testing: a
    // list that turns off pointer events while it scrolls still shows its rows.
    const inTop = box.top + BLANK_INSET_PX;
    const inBottom = box.bottom - BLANK_INSET_PX;
    const content = rows.some(([, rect]) => rect.height > 0 && rect.bottom > inTop && rect.top < inBottom);
    const placeholder = [...list.querySelectorAll(options.skeleton ?? PLACEHOLDERS)].some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > box.top && rect.top < box.bottom;
    });
    if (!content || placeholder) blankFramesInset += 1;
    // The first gate's blank frames, while the list holds rows.
    if (rows.length > 0) {
      const x = box.left + box.width / 2;
      let blank = true;
      for (let probe = 1; probe <= BLANK_PROBES && blank; probe++) {
        const y = box.top + (box.height * probe) / (BLANK_PROBES + 1);
        blank = !rows.some(([, rect]) => rect.width > 0 && rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom);
      }
      if (blank) blankFrames += 1;
    }
    return moved;
  }

  /** The frame meter's late and long frames; the refresh and late frames only once there are enough gaps to tell the refresh. */
  function frameTimes(): Measures {
    const measures: Measures = {
      longFrames: gaps.filter((gap) => gap > LONG_FRAME_MS).length,
      over16Share: gaps.length === 0 ? 0 : Math.round((gaps.filter((gap) => gap > FRAME_60HZ_MS).length / gaps.length) * 1000) / 1000,
    };
    if (gaps.length >= REFRESH_GAPS) {
      // The median as the frame meter takes it: the lower middle of an even count.
      const refresh = [...gaps].sort((a, b) => a - b)[Math.ceil(gaps.length / 2) - 1]!;
      measures.refreshMs = Math.round(refresh * 10) / 10;
      measures.lateFrames = gaps.filter((gap) => gap >= LATE_REFRESHES * refresh).length;
    }
    return measures;
  }

  /** The wheel events that never moved the list: those a frame began after, as the meter leaves out one that none did. */
  function neverMoved(): Motion[] {
    return motions.filter((motion) => motion.at <= lastFrameAt);
  }

  /**
   * How long wheel events took to move the list, at the 95th percentile and at most, as the frame meter takes them: one that never
   * moved it counts until the last frame, in ms, and as never in frames, which leaves the frames out once it reaches them.
   */
  function inputToMotion(): Measures {
    const never = neverMoved();
    const measures: Measures = { inputNeverMoved: never.length, inputAtEdge };
    const ms = [...toMotionMs, ...never.map((motion) => lastFrameAt - motion.at)];
    if (ms.length === 0) return measures;
    const counted = [...toMotionFrames, ...never.map(() => Infinity)];
    measures.inputToMotionP95Ms = Math.round(p95(ms));
    measures.inputToMotionMaxMs = Math.round(Math.max(...ms));
    if (p95(counted) !== Infinity) measures.inputToMotionP95Frames = p95(counted);
    if (Math.max(...counted) !== Infinity) measures.inputToMotionMaxFrames = Math.max(...counted);
    return measures;
  }

  const feel: OuroFeel = {
    version: 1,
    watch(options) {
      watching = options;
      layoutReads = forcedLayouts = readsThisFrame = mostReadsInAFrame = 0;
      jumps = jumpMaxPx = jumpsStrict = jumpStrictMaxPx = shifts = anchorShiftPx = drift = anchorMovePx = 0;
      blankFrames = blankFramesInset = deadInput = wheelInputs = frames = added = 0;
      longestFrame = 0;
      gaps.length = motions.length = toMotionMs.length = toMotionFrames.length = 0;
      inputSinceSample = 0;
      wheels.length = 0;
      const list = listOf(options);
      const start = list === null ? undefined : quietly(() => {
        const box = list.getBoundingClientRect();
        return middleRow(rowBoxes(list, options.rows, box), box);
      });
      // The first wheel event's movement is measured from where the list is now, before any frame is sampled.
      sampled = list === null ? undefined : quietly(() => [list.scrollTop, list.scrollHeight - list.clientHeight]);
      inputAtEdge = 0;
      anchor = start?.[0];
      anchorTop = start?.[1] ?? 0;
      writePending();
      pending = false;
      loop();
    },
    inputMoved(px) {
      inputSinceSample += px;
    },
    painted() {
      const done = new Promise<void>((resolve) => paintWaiters.push(resolve));
      loop();
      return done;
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
          // Those that moved the list 100 ms or more after they came, and those that never moved it.
          deadInput: deadInput + neverMoved().length,
          wheelInputs,
          forcedLayouts,
          layoutReads,
          layoutReadsPerFrame: mostReadsInAFrame,
          rowsMounted: added,
          longestFrameMs: Math.round(longestFrame),
          ...frameTimes(),
          ...inputToMotion(),
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

/**
 * The least time between two polls that found no command. A service that answers at once when it has none would otherwise have
 * the page ask again without pause, which keeps the page busy and changes what it measures.
 */
const POLL_FLOOR_MS = 1000;

/** A command from the runner, by long-poll. */
type Command = { id: number; type: "run"; case: string } | { id: number; type: "title"; title: string };

/** Takes commands from the runner at `base` until it stops answering. */
async function bridge(feel: OuroFeel, base: string): Promise<void> {
  const post = (path: string, body: unknown) => fetch(new URL(path, base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  await post("hello", { userAgent: navigator.userAgent });
  for (;;) {
    let command: Command;
    try {
      const asked = performance.now();
      const response = await fetch(new URL("next", base), { cache: "no-store" });
      if (response.status === 204) {
        const waited = performance.now() - asked;
        if (waited < POLL_FLOOR_MS) await new Promise((resume) => setTimeout(resume, POLL_FLOOR_MS - waited));
        continue;
      }
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
