import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import { mock, test } from "node:test";
import { clearTimeout, setTimeout } from "node:timers";
import { DRAG_SLOW_MS, drag, touchDrag, touchStep } from "../registry/ouro/lib/ouro/testing/commands.ts";

// The touch kit's frame logic against a stand-in Chromium page, where Playwright lists a frame
// exactly when the test says. In a real browser the delay before Playwright lists a new frame in
// another process happens only now and then (CI probe run 38385210551), so a browser test of it
// is a smoke test, not a control.

/**
 * A page whose top frame holds the test's own frame, as Vitest's does, and a touch point on a frame
 * in another process given the address `url`, which Chromium's hit test stops at. Playwright lists
 * that frame `listAfter` ms after the touch command starts, with the address `listedUrl`: none for
 * a sandboxed srcdoc frame. A touch Chromium sends to it before its watcher is armed for that touch
 * is lost, as for a busy frame. With `onPage` the point is on the test's own page instead, which
 * handles the touch once its watcher is armed. `delays` holds Chromium's reply time per method, in ms.
 * `stuck` adds a cross-origin frame elsewhere on the page that never answers: "watch" for any call
 * into it, as for a frame whose document never arrives, or "tidy" for its tidying up only, as for a
 * frame that turned busy after its watch started. The frame's own hit test reaches inside it from
 * `hitTestableAfter` ms, and Chromium sends it touches from `routedAfter` ms: until then the test's
 * page gets them, on the frame's element, as in CI. With `reembed`, the page around the frame
 * embeds it afresh at its next draw after the frame first draws, as when the frame's visual
 * properties change; Chromium then sends the frame touches only once it has drawn again, and until
 * then the test's page gets them (a screenshot after the frame draws does this in Chromium).
 * Playwright has no session of its own for the frame until `sessionAfter` ms, when the frame
 * navigates, as for a frame first looked up while it was still in its parent's process. The
 * session comes with that event, not with the clock: Node sets a timer from the event loop's
 * cached time, so under load it can fire before `Date.now()` says its delay has passed
 * (`sessionEarly` ms before, to show it). The frame
 * is busy until `busyUntil` ms: its watch answers only then. With `lost`, Chromium sends the frame's
 * touches nowhere, so the page never handles them. With `busyOnceSent`, the frame turns busy once a
 * touch is sent: no call into it answers after that, its wait and its tidying up included. The
 * frame's own hit test (DOM.getNodeForLocation) never answers the first `hitTestHangs` times it is
 * asked, as in a frame busy running its scripts. With `ackAfter`, Chromium acknowledges a touchStart
 * only that many ms after it is sent. With `ackHangs`, Chromium never acknowledges a
 * touchStart (Input.dispatchTouchEvent), as when a listener that can cancel it is busy in the page.
 */
function stage({ url = "about:srcdoc", listAfter = 150, listedUrl = "", onPage = false, delays = {}, stuck, hitTestableAfter = 0, routedAfter = hitTestableAfter, reembed = false, sessionAfter = 0, busyUntil = 0, lost = false, busyOnceSent = false, sessionEarly = 0, hitTestHangs = 0, ackHangs = false, ackAfter = 0 } = {}) {
  const page = new EventEmitter();
  const sent = [];
  const frame = (name, frameUrl, parent, id) => {
    const self = {
      name,
      id,
      armed: false,
      drew: false,
      sees: undefined,
      waiting: [],
      url: () => frameUrl,
      parentFrame: () => parent,
      async evaluate(call) {
        if (self.never?.(call)) return new Promise(() => {});
        // The kit's wait for the frame to draw, before a touch into a frame in another process.
        if (call.includes("requestAnimationFrame(() => requestAnimationFrame(")) {
          self.drew = true;
          self.onDraw?.();
          return undefined;
        }
        const action = /\)\("(\w+)"/.exec(call)[1];
        if (action === "expect") {
          if (self === target && since() < busyUntil) await new Promise((resolve) => setTimeout(resolve, busyUntil - since()));
          self.armed = true;
          return null;
        }
        if (action === "wait") {
          if (self.sees) return { seen: true, active: true, moved: false, saw: [self.sees] };
          return new Promise((resolve) => self.waiting.push(resolve));
        }
        if (action === "settle") {
          self.armed = false;
          for (const resolve of self.waiting.splice(0)) resolve({ seen: false, active: false, moved: false, saw: [] });
          return null;
        }
        return { href: frameUrl, readyState: "complete", watching: self.armed };
      },
    };
    return self;
  };
  const top = frame("top", "http://localhost:63315/", null);
  const tests = frame("tests", "http://localhost:63315/__vitest_test__/", top);
  // Playwright lists a sandboxed srcdoc frame in another process with no URL.
  const target = frame("target", listedUrl, tests, "TARGET-FRAME-ID");
  const listed = [top, tests];
  if (busyOnceSent) target.never = () => sent.length > 0;
  // "none" before the frame draws, then "pending" until the page around it draws, "stale" until the frame draws again, then "clear".
  let embedding = "none";
  if (reembed) {
    target.onDraw = () => (embedding = embedding === "none" ? "pending" : embedding === "stale" ? "clear" : embedding);
    tests.onDraw = () => (embedding = embedding === "pending" ? "stale" : embedding);
  }
  if (stuck) {
    const other = frame("stuck", "", tests, "STUCK-FRAME-ID");
    other.never = (call) => stuck === "watch" || /\)\("settle"/.test(call);
    listed.push(other);
  }
  const list = () => {
    listed.push(target);
    page.emit("frameattached", target);
  };
  let timer;
  let sessionTimer;
  let hasSession = sessionAfter === 0;
  let hitTests = 0;
  let started = Date.now();
  const since = () => Date.now() - started;
  const session = {
    async send(method, params) {
      if (delays[method]) await new Promise((resolve) => setTimeout(resolve, delays[method]));
      if (onPage && method === "Runtime.callFunctionOn") return { result: { value: { watched: tests.armed, where: "the test page" } } };
      if (onPage && method === "Input.dispatchTouchEvent") {
        sent.push({ type: params.type, at: Date.now() });
        if (tests.armed) {
          tests.sees = params.type.toLowerCase();
          for (const resolve of tests.waiting.splice(0)) resolve({ seen: true, active: params.type === "touchStart", moved: false, saw: [tests.sees] });
        }
        return {};
      }
      if (method === "Page.getLayoutMetrics") return { cssVisualViewport: { pageX: 0, pageY: 0 } };
      if (method === "DOM.getNodeForLocation") return { backendNodeId: 1 };
      if (method === "DOM.resolveNode") return { object: { objectId: "frame-element" } };
      if (method === "Runtime.callFunctionOn") return { result: { value: { watched: "frame", where: `a frame in another process, at ${url}`, url } } };
      if (method === "DOM.describeNode") return { node: { frameId: target.id } };
      // The frame's element: 300 by 100 at the left, 300px down.
      if (method === "DOM.getContentQuads") return { quads: [[0, 300, 300, 300, 300, 400, 0, 400]] };
      if (method === "Input.dispatchTouchEvent") {
        if (ackHangs && params.type === "touchStart") {
          sent.push({ type: params.type, unacknowledged: true });
          return new Promise(() => {});
        }
        if (ackAfter > 0 && params.type === "touchStart") {
          sent.push({ type: params.type, at: since() });
          await new Promise((resolve) => setTimeout(resolve, ackAfter));
          return {};
        }
        sent.push({ type: params.type, targetListed: listed.includes(target), targetArmed: target.armed, targetDrew: target.drew, at: since() });
        if (lost) return {};
        // Until Chromium routes touches into the frame, the page around it gets them, on its element.
        if (params.type === "touchStart" && (since() < routedAfter || embedding === "pending" || embedding === "stale")) {
          tests.sees = "touchstart";
          for (const resolve of tests.waiting.splice(0)) resolve({ seen: true, active: true, moved: false, saw: ["touchstart"] });
          return {};
        }
        // Chromium sends the touch to the frame at the point; one sent before its watcher is armed is lost.
        if (params.type === "touchStart" && target.armed) {
          target.sees = "touchstart";
          for (const resolve of target.waiting.splice(0)) resolve({ seen: true, active: true, moved: false, saw: ["touchstart"] });
        }
        if (params.type === "touchEnd" && target.sees) target.sees = "touchend";
      }
      return {};
    },
  };
  Object.assign(page, {
    frames: () => [...listed],
    off: (event, listener) => page.removeListener(event, listener),
    context: () => ({
      browser: () => ({ browserType: () => ({ name: () => "chromium" }) }),
      // A frame in its parent's process has no session of its own.
      newCDPSession: async (of) => {
        if (of === page) return session;
        if (!of.id || (of === target && !hasSession)) throw new Error("This frame does not have a separate CDP session, it is a part of the parent frame's session");
        return {
          async send(method, params) {
            if (method === "Page.getFrameTree") return { frameTree: { frame: { id: of.id } } };
            if (method === "Page.getLayoutMetrics") return { cssVisualViewport: { pageX: 0, pageY: 0 } };
            if (method === "DOM.getNodeForLocation") {
              // The point, in the frame: (100, 350) on the page is (100, 50) here.
              assert.deepEqual([params.x, params.y], [100, 50]);
              if (hitTests++ < hitTestHangs) return new Promise(() => {});
              if (since() < hitTestableAfter) throw new Error("No node found at given location");
              return { backendNodeId: 7 };
            }
            throw new Error(`unexpected ${method}`);
          },
          detach: async () => {},
        };
      },
    }),
  });
  const ctx = { page, provider: { name: "playwright" } };
  // Starts the stage's clock and timers once, for the first gesture.
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    started = Date.now();
    timer = setTimeout(list, listAfter);
    if (sessionAfter > 0)
      sessionTimer = setTimeout(() => {
        hasSession = true;
        page.emit("framenavigated", target);
      }, sessionAfter - sessionEarly);
  };
  const start = () => {
    begin();
    return touchStep(ctx, { type: "touchStart", x: 100, y: 350 });
  };
  const drag = () => {
    begin();
    return touchDrag(ctx, { from: [100, 350], to: [100, 380], steps: 3 });
  };
  return { ctx, sent, target, tests, start, drag, stop: () => (clearTimeout(timer), clearTimeout(sessionTimer)) };
}

test("a touchstart on a frame in another process that Playwright lists late waits for that frame's watcher, then reaches it", async () => {
  const { sent, target, start, stop } = stage();
  try {
    await start();
    assert.deepEqual(sent.map(({ type, targetListed, targetArmed, targetDrew }) => ({ type, targetListed, targetArmed, targetDrew })), [{ type: "touchStart", targetListed: true, targetArmed: true, targetDrew: true }]);
    assert.equal(target.sees, "touchstart");
  } finally {
    stop();
  }
});

test("a touchstart on a frame in another process that Playwright never lists is refused after the time limit, naming the frames it lists", async () => {
  const { sent, start, stop } = stage({ listAfter: 60_000 });
  try {
    const started = Date.now();
    await assert.rejects(
      start(),
      /^Error: touchStep: could not watch the frame at \(100, 350\) within 5000ms, so the touchStart was not sent\. The frame there is a frame in another process, at about:srcdoc, and it has no watcher\. Playwright lists http:\/\/localhost:63315\/, http:\/\/localhost:63315\/__vitest_test__\/\. Steps: \+\d+ms asked Chromium: .+\.$/,
    );
    assert.ok(Date.now() - started >= 5000);
    assert.deepEqual(sent, []);
  } finally {
    stop();
  }
});

test("a frame with no session of its own when first asked is found once Playwright has one for it", async () => {
  // The event comes 20ms before the clock says 300ms, as a timer set from the event loop's stale time can under load (CI run 39750274493).
  const { sent, target, start, stop } = stage({ listAfter: 0, sessionAfter: 300, sessionEarly: 20 });
  try {
    await start();
    assert.deepEqual(sent.map(({ type }) => type), ["touchStart"]);
    assert.equal(target.sees, "touchstart");
  } finally {
    stop();
  }
});

test("a refused touch logs no trace: its error says why", async () => {
  const warn = mock.method(console, "warn", () => {});
  const { start, stop } = stage({ listAfter: 60_000 });
  try {
    await assert.rejects(start(), /could not watch the frame/);
    assert.equal(warn.mock.callCount(), 0);
  } finally {
    warn.mock.restore();
    stop();
  }
});

test("a touch refused at the time limit is refused no sooner, though Node's timers can fire early", async () => {
  // Node's timers count whole milliseconds of the event loop's cached time, and the kit counted its
  // limit in whole milliseconds of Date.now(), so a refusal could come a millisecond or two early on
  // a precise clock: CI saw one at 4999.8ms. Make every timer the kit sets fire 10ms early, so the
  // test does not depend on how early; this file's own timers come from node:timers and are unchanged.
  const { sent, start, stop } = stage({ listAfter: 60_000 });
  const early = globalThis.setTimeout;
  globalThis.setTimeout = (run, ms = 0, ...args) => early(run, Math.max(0, ms - 10), ...args);
  try {
    const started = performance.now();
    await assert.rejects(start(), /^Error: touchStep: could not watch the frame at \(100, 350\) within 5000ms/);
    assert.ok(performance.now() - started >= 5000, `refused after ${performance.now() - started}ms`);
    assert.deepEqual(sent, []);
  } finally {
    globalThis.setTimeout = early;
    stop();
  }
});

test("a frame in another process is found by Chromium's id for it, whatever address Playwright lists it with", async () => {
  const { sent, target, start, stop } = stage({ url: "https://embed.example/a", listedUrl: "https://embed.example/a/", listAfter: 0 });
  try {
    await start();
    assert.deepEqual(sent.map(({ type, targetListed, targetArmed, targetDrew }) => ({ type, targetListed, targetArmed, targetDrew })), [{ type: "touchStart", targetListed: true, targetArmed: true, targetDrew: true }]);
    assert.equal(target.sees, "touchstart");
  } finally {
    stop();
  }
});


/** Times one touchStart and touchEnd on the test's own page, in ms each. */
async function tapOnPage(options) {
  const { ctx, tests, stop } = stage({ onPage: true, listAfter: 60_000, ...options });
  try {
    let started = Date.now();
    await touchStep(ctx, { type: "touchStart", x: 100, y: 50 });
    const start = Date.now() - started;
    started = Date.now();
    await touchStep(ctx, { type: "touchEnd" });
    return { start, end: Date.now() - started, sees: tests.sees };
  } finally {
    stop();
  }
}

test("a cross-origin frame that never answers its watch holds up no touch elsewhere", async () => {
  const { start, end, sees } = await tapOnPage({ stuck: "watch" });
  assert.equal(sees, "touchend");
  assert.ok(start < 200 && end < 200, `touchStart ${start}ms, touchEnd ${end}ms`);
});

test("a cross-origin frame that never answers its tidying up holds up no touch elsewhere", async () => {
  const { start, end, sees } = await tapOnPage({ stuck: "tidy" });
  assert.equal(sees, "touchend");
  // A kit that waits for every frame's tidying waits a second here, its limit for it.
  assert.ok(start < 200 && end < 200, `touchStart ${start}ms, touchEnd ${end}ms`);
});

test("a touchstart or touchmove the page handled asks nothing more of the frame that handled it, and a lift tidies that frame and waits for it", async () => {
  const { ctx, tests, stop } = stage({ onPage: true, listAfter: 60_000 });
  // Each call into the test's frame, by action; its tidying up takes 800ms.
  const actions = [];
  const evaluate = tests.evaluate;
  tests.evaluate = async (call) => {
    const action = /\)\("(\w+)"/.exec(call)?.[1];
    actions.push(action);
    if (action === "settle") await new Promise((resolve) => setTimeout(resolve, 800));
    return evaluate(call);
  };
  try {
    let started = performance.now();
    await touchStep(ctx, { type: "touchStart", x: 100, y: 50 });
    const start = performance.now() - started;
    assert.deepEqual(actions, ["expect", "wait"]);
    started = performance.now();
    await touchStep(ctx, { type: "touchMove", x: 100, y: 60 });
    const move = performance.now() - started;
    assert.deepEqual(actions.splice(0), ["expect", "wait", "expect", "wait"]);
    assert.ok(start < 400 && move < 400, `touchStart ${start}ms, touchMove ${move}ms`);
    started = performance.now();
    await touchStep(ctx, { type: "touchEnd" });
    assert.deepEqual(actions, ["expect", "wait", "settle"]);
    assert.ok(performance.now() - started >= 790, "a lift waits for the frame's tidying");
  } finally {
    stop();
  }
});

test("a touchstart does not wait for Chromium to let go of the node at its point", async () => {
  const { start, end, sees } = await tapOnPage({ delays: { "Runtime.releaseObject": 1500 } });
  assert.equal(sees, "touchend");
  assert.ok(start < 400, `touchStart ${start}ms`);
  assert.ok(end < 1400, `touchEnd ${end}ms`);
});

test("a touch command that takes longer than a second logs its steps, when each frame's watch answered and how late Node ran", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    await tapOnPage({ delays: { "Input.dispatchTouchEvent": 1100 } });
    assert.equal(warn.mock.callCount(), 2);
    const [message] = warn.mock.calls[0].arguments;
    assert.match(
      message,
      /^touchStep: the touchStart at \(100, 50\) took \d+ms\. Steps: \+\d+ms asked Chromium: layout \d+ms, hit test \d+ms, node \d+ms, watcher \d+ms, frame id \d+ms; \+\d+ms the frame at the point: true, the test page; \+\d+ms watched; \+\d+ms sent; \+\d+ms handled by http:\/\/localhost:63315\/__vitest_test__\/; \+\d+ms tidied, waiting for no frame\. Watches: http:\/\/localhost:63315\/ answered at \+\d+ms; http:\/\/localhost:63315\/__vitest_test__\/ answered at \+\d+ms\. Node's event loop ran up to \d+ms late\.$/,
    );
  } finally {
    warn.mock.restore();
  }
});

test("a touchstart into a frame in another process that is armed and drawn waits until Chromium's hit test there reaches inside it", async () => {
  const { sent, target, start, stop } = stage({ listAfter: 0, hitTestableAfter: 300 });
  try {
    await start();
    assert.equal(target.sees, "touchstart");
    assert.ok(sent[0].at >= 300, `sent at +${sent[0].at}ms`);
  } finally {
    stop();
  }
});

test("a touchstart into a frame in another process waits until that frame has drawn after the page around it has", async () => {
  const { sent, target, start, stop } = stage({ listAfter: 0, reembed: true });
  try {
    await start();
    assert.deepEqual(sent.map(({ type }) => type), ["touchStart"]);
    assert.equal(target.sees, "touchstart");
  } finally {
    stop();
  }
});

test("a touchstart that Chromium sends to the page around a frame in another process throws, and never passes as handled", async () => {
  const { tests, target, start, stop } = stage({ listAfter: 0, routedAfter: 60_000 });
  try {
    await assert.rejects(
      start(),
      /^Error: touchStep: Chromium sent the touchStart at \(100, 350\) to http:\/\/localhost:63315\/__vitest_test__\/, not to the frame in another process there \(a frame with no URL yet\), though that frame's watcher was armed, its hit test there reached inside it and it had drawn after the page around it\. The frame never saw the touch; the finger is lifted before the next gesture\. Steps: .+\.$/,
    );
    assert.equal(tests.sees, "touchstart");
    assert.equal(target.sees, undefined);
  } finally {
    stop();
  }
});

/** Holds Node's event loop, as other work in Vitest's process does, for `ms` from each of `at` ms on. */
function stallNode(stalls) {
  const timers = stalls.map(([at, ms]) =>
    setTimeout(() => {
      const end = performance.now() + ms;
      while (performance.now() < end);
    }, at),
  );
  return () => timers.forEach((timer) => clearTimeout(timer));
}

// CI saw the kit refuse a busy cross-origin frame's touchstart on a shard where Node's event loop
// ran up to 2.5 s late: the 5-second limit is for the browser, and Node's own stalls used it up.
test("a touchstart into a busy frame in another process waits out Node's own stalls, which do not count against the time limit", async () => {
  const { sent, target, start, stop } = stage({
    listAfter: 0,
    busyUntil: 1500,
    delays: { "Page.getLayoutMetrics": 150, "DOM.getNodeForLocation": 150, "DOM.resolveNode": 150, "Runtime.callFunctionOn": 150, "DOM.describeNode": 150, "DOM.getContentQuads": 150 },
  });
  // From inside the kit's second question to Chromium, while the frame is busy, until past the limit.
  const unstall = stallNode([[1100, 4500]]);
  try {
    const started = performance.now();
    await start();
    assert.ok(performance.now() - started > 5000, `took ${performance.now() - started}ms`);
    assert.deepEqual(sent.map(({ type, targetArmed }) => ({ type, targetArmed })), [{ type: "touchStart", targetArmed: true }]);
    assert.equal(target.sees, "touchstart");
  } finally {
    unstall();
    stop();
  }
});

test("a touchstart into a frame that never answers is still refused once the kit has waited the time limit, Node's stalls left out, and the refusal says what it waited on", async () => {
  const { sent, start, stop } = stage({ listAfter: 60_000 });
  const unstall = stallNode([[500, 1000]]);
  try {
    const started = performance.now();
    let held = 0;
    await assert.rejects(start(), (error) => {
      assert.match(error.message, /^touchStep: could not watch the frame at \(100, 350\) within 5000ms, so the touchStart was not sent\. The frame there is a frame in another process, at about:srcdoc, and it has no watcher\. /);
      held = Number(/ Node's event loop was held up for (\d+)ms meanwhile, which the kit's limits leave out\./.exec(error.message)?.[1]);
      assert.ok(held >= 900 && held <= 1100, error.message);
      assert.match(error.message, / Steps: \+\d+ms asked Chromium: /);
      return true;
    });
    // The limit, on top of the stall it left out, and not much more.
    const took = performance.now() - started;
    assert.ok(took >= 5000 + held && took < 6500, `refused after ${took}ms, ${held}ms of them a stall`);
    assert.deepEqual(sent, []);
  } finally {
    unstall();
    stop();
  }
});

/** Holds Node's event loop for `stallMs` after every `gapMs` it runs, until the returned function is called. */
function starveNode(stallMs, gapMs) {
  let stopped = false;
  let timer;
  const stall = () => {
    if (stopped) return;
    const end = performance.now() + stallMs;
    while (performance.now() < end);
    timer = setTimeout(stall, gapMs);
  };
  timer = setTimeout(stall, gapMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** The time limit a touch command has in real time, whatever Node's stalls: twice the 5-second limit. */
const CEILING_MS = 10_000;

test("a touchstart into a frame that never answers is refused at the command's ceiling in real time, however long Node is starved", { timeout: 30_000 }, async () => {
  const { sent, start, stop } = stage({ listAfter: 60_000 });
  const unstarve = starveNode(200, 10);
  try {
    const started = performance.now();
    await assert.rejects(start(), (error) => {
      assert.match(error.message, /^touchStep: could not watch the frame at \(100, 350\) within 5000ms, so the touchStart was not sent\. /);
      assert.match(error.message, / Node's event loop was held up for \d+ms meanwhile, which the kit's limits leave out, up to their ceiling of 10000ms in all, which this command reached\./);
      return true;
    });
    const took = performance.now() - started;
    assert.ok(took >= CEILING_MS - 50 && took < CEILING_MS + 1000, `refused after ${took}ms`);
    assert.deepEqual(sent, []);
  } finally {
    unstarve();
    stop();
  }
});

test("a touch the page never handles is refused within the command's ceiling in real time, however long Node is starved", { timeout: 40_000 }, async () => {
  const { sent, start, stop } = stage({ listAfter: 0, lost: true });
  const unstarve = starveNode(200, 10);
  try {
    const started = performance.now();
    await assert.rejects(start(), /^Error: touchStep: the page did not handle the touchStart at \(100, 350\) within 5000ms\. .* Node's event loop was held up for \d+ms meanwhile, which the kit's limits leave out, up to their ceiling of 10000ms in all, which this command reached\./);
    const took = performance.now() - started;
    // The ceiling, then 2 seconds at most for what the kit reads of the frames after it.
    assert.ok(took < CEILING_MS + 2000, `refused after ${took}ms`);
    assert.deepEqual(sent.map(({ type }) => type), ["touchStart"]);
  } finally {
    unstarve();
    stop();
  }
});

test("a touch into a frame that turns busy once it is sent is refused within the command's ceiling in real time, its wait for the frame included, however long Node is starved", { timeout: 40_000 }, async () => {
  // Its watch answers 3 seconds in, so its wait starts late, and on its own bound would run to 15 seconds.
  const { sent, start, stop } = stage({ listAfter: 0, lost: true, busyOnceSent: true, busyUntil: 3000 });
  const unstarve = starveNode(200, 10);
  try {
    const started = performance.now();
    await assert.rejects(start(), /^Error: touchStep: the page did not handle the touchStart at \(100, 350\) within 5000ms\. /);
    const took = performance.now() - started;
    // The ceiling, then 2 seconds at most for tidying up (and a stall's overshoot): the wait in the busy frame ends at the ceiling too.
    assert.ok(took < CEILING_MS + 2500, `refused after ${took}ms`);
    assert.deepEqual(sent.map(({ type }) => type), ["touchStart"]);
  } finally {
    unstarve();
    stop();
  }
});

test("a frame whose hit test does not answer is asked again, and the touch reaches it once it does", { timeout: 15_000 }, async () => {
  const { sent, target, start, stop } = stage({ listAfter: 0, hitTestHangs: 1 });
  try {
    await start();
    assert.deepEqual(sent.map(({ type }) => type), ["touchStart"]);
    assert.equal(target.sees, "touchstart");
  } finally {
    stop();
  }
});

test("a frame whose hit test never answers is refused at the time limit, not waited on for ever", { timeout: 15_000 }, async () => {
  const { sent, start, stop } = stage({ listAfter: 0, hitTestHangs: Infinity });
  try {
    const started = performance.now();
    await assert.rejects(start(), /^Error: touchStep: could not watch the frame at \(100, 350\) within 5000ms, so the touchStart was not sent\. The frame there is a frame in another process, at about:srcdoc: its watcher is armed, but Chromium's hit test at that point does not reach inside it yet\b/);
    assert.ok(performance.now() - started < 7000);
    assert.deepEqual(sent, []);
  } finally {
    stop();
  }
});

test("a touch Chromium never acknowledges is refused at the time limit, saying so", { timeout: 15_000 }, async () => {
  const { sent, start, stop } = stage({ listAfter: 0, ackHangs: true });
  try {
    const started = performance.now();
    await assert.rejects(start(), /^Error: touchStep: Chromium had not acknowledged the touchStart at \(100, 350\) within 5000ms\b/);
    assert.ok(performance.now() - started < 8000);
    assert.deepEqual(sent.map(({ type }) => type), ["touchStart"]);
  } finally {
    stop();
  }
});

test("a drag refused while Chromium holds its touchStart sends nothing more once Chromium lets go, and its finger is lifted before the next gesture", { timeout: 20_000 }, async () => {
  const { sent, start, drag, stop } = stage({ listAfter: 0, ackAfter: 6000 });
  try {
    await assert.rejects(drag(), /^Error: touchDrag: Chromium had not acknowledged the drag's touches, ending at \(100, 380\), within 5000ms: .* The kit sends nothing more for this gesture, and a finger it left down is lifted before the next one\./);
    // Chromium acknowledges the touchStart a second later; the drag's moves and lift must not follow it.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.deepEqual(sent.map(({ type }) => type), ["touchStart"]);
    // The next gesture lifts the finger the refused drag left down, first.
    await assert.rejects(start(), /Chromium had not acknowledged the touchStart/);
    assert.deepEqual(sent.map(({ type }) => type).slice(0, 3), ["touchStart", "touchEnd", "touchStart"]);
  } finally {
    stop();
  }
});

test("a refusal after many rounds of asking keeps the first and last of its steps, and says how many it left out", async () => {
  const { start, stop } = stage({ listAfter: 0, hitTestableAfter: 60_000 });
  try {
    await assert.rejects(start(), (error) => {
      assert.match(error.message, /its watcher is armed, but Chromium's hit test at that point does not reach inside it yet/);
      const steps = error.message.slice(error.message.indexOf(" Steps: ")).split("; ");
      assert.ok(steps.length <= 30, `${steps.length} steps`);
      assert.match(error.message, /; … \d+ steps left out …; /);
      assert.match(steps.at(-1), /the hit test does not reach inside the frame\.$/);
      return true;
    });
  } finally {
    stop();
  }
});

/**
 * A page whose mouse answers each call at once, except the `hangAt`th (from 1), which answers
 * after `hangMs` (never, by default).
 */
function mousePage(hangAt = 0, hangMs = Infinity) {
  const calls = [];
  const answer = (name) => async () => {
    calls.push(name);
    if (calls.length === hangAt) return Number.isFinite(hangMs) ? new Promise((resolve) => setTimeout(resolve, hangMs)) : new Promise(() => {});
  };
  return { calls, page: { mouse: { move: answer("move"), down: answer("down"), up: answer("up") }, waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } };
}

const STEP = String.raw`(?:the move to the start|the press|move \d+|the release) \d+ms`;

test("a mouse drag the browser stops answering logs the move it is stuck on and each earlier move's time, and is not refused", { timeout: 15_000 }, async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    // The move to the start, the press, move 1, then move 2 never answers.
    const { page } = mousePage(4);
    let ended = false;
    drag({ page }, { from: [10, 10], to: [50, 10], steps: 4, durationMs: 40 }).finally(() => (ended = true));
    await new Promise((resolve) => setTimeout(resolve, DRAG_SLOW_MS + 500));
    assert.equal(ended, false, "the drag is left to the test's own time limit");
    assert.equal(warn.mock.callCount(), 1);
    assert.match(
      warn.mock.calls[0].arguments[0],
      /^drag: still waiting on move 2 after \d+ms, \d+ms into a 40ms drag of 4 moves \(logged at 3040ms\)\. Each step before it, pauses between moves left out: the move to the start \d+ms, the press \d+ms, move 1 \d+ms\.$/,
    );
  } finally {
    warn.mock.restore();
  }
});

test("a mouse drag stalled in the pause after a move names that pause, not the move", { timeout: 15_000 }, async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    const { page } = mousePage();
    page.waitForTimeout = () => new Promise(() => {});
    void drag({ page }, { from: [10, 10], to: [50, 10], steps: 4, durationMs: 40 });
    await new Promise((resolve) => setTimeout(resolve, DRAG_SLOW_MS + 500));
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /^drag: still waiting on the pause after move 1 after \d+ms, .* move 1 \d+ms\.$/);
  } finally {
    warn.mock.restore();
  }
});

test("a slow mouse drag that finishes logs every step's time once it ends", { timeout: 15_000 }, async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    const { calls, page } = mousePage(4, DRAG_SLOW_MS + 300);
    await drag({ page }, { from: [10, 10], to: [50, 10], steps: 4, durationMs: 40 });
    assert.deepEqual(calls, ["move", "down", "move", "move", "move", "move", "up"]);
    assert.equal(warn.mock.callCount(), 2);
    assert.match(warn.mock.calls[0].arguments[0], /^drag: still waiting on move 2 /);
    assert.match(
      warn.mock.calls[1].arguments[0],
      new RegExp(String.raw`^drag: finished after \d+ms, in a 40ms drag of 4 moves \(logged at 3040ms\)\. Each step, pauses between moves left out: ${STEP}(?:, ${STEP}){6}\.$`),
    );
    assert.match(warn.mock.calls[1].arguments[0], /move 2 3[3-9]\d\dms/);
  } finally {
    warn.mock.restore();
  }
});

test("a mouse drag that finishes in time logs nothing", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    const { calls, page } = mousePage();
    await drag({ page }, { from: [10, 10], to: [50, 10], steps: 4, durationMs: 40 });
    assert.deepEqual(calls, ["move", "down", "move", "move", "move", "move", "up"]);
    assert.equal(warn.mock.callCount(), 0);
  } finally {
    warn.mock.restore();
  }
});
