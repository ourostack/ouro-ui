import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import { clearTimeout, setTimeout } from "node:timers";
import { touchStep } from "../registry/ouro/lib/ouro/testing/commands.ts";

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
 * frame that turned busy after its watch started.
 */
function stage({ url = "about:srcdoc", listAfter = 150, listedUrl = "", onPage = false, delays = {}, stuck } = {}) {
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
          return undefined;
        }
        const action = /\)\("(\w+)"/.exec(call)[1];
        if (action === "expect") {
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
      if (method === "Input.dispatchTouchEvent") {
        sent.push({ type: params.type, targetListed: listed.includes(target), targetArmed: target.armed, targetDrew: target.drew });
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
        if (!of.id) throw new Error("This frame does not have a separate CDP session, it is a part of the parent frame's session");
        return { send: async () => ({ frameTree: { frame: { id: of.id } } }), detach: async () => {} };
      },
    }),
  });
  const ctx = { page, provider: { name: "playwright" } };
  const start = () => {
    timer = setTimeout(list, listAfter);
    return touchStep(ctx, { type: "touchStart", x: 100, y: 350 });
  };
  return { ctx, sent, target, tests, start, stop: () => clearTimeout(timer) };
}

test("a touchstart on a frame in another process that Playwright lists late waits for that frame's watcher, then reaches it", async () => {
  const { sent, target, start, stop } = stage();
  try {
    await start();
    assert.deepEqual(sent, [{ type: "touchStart", targetListed: true, targetArmed: true, targetDrew: true }]);
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
      /^Error: touchStep: could not watch the frame at \(100, 350\) within 5000ms, so the touchStart was not sent\. The frame there is a frame in another process, at about:srcdoc, and it has no watcher\. Playwright lists http:\/\/localhost:63315\/, http:\/\/localhost:63315\/__vitest_test__\/\.$/,
    );
    assert.ok(Date.now() - started >= 5000);
    assert.deepEqual(sent, []);
  } finally {
    stop();
  }
});

test("a frame in another process is found by Chromium's id for it, whatever address Playwright lists it with", async () => {
  const { sent, target, start, stop } = stage({ url: "https://embed.example/a", listedUrl: "https://embed.example/a/", listAfter: 0 });
  try {
    await start();
    assert.deepEqual(sent, [{ type: "touchStart", targetListed: true, targetArmed: true, targetDrew: true }]);
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

test("a touch command that takes longer than a second logs its steps, when each frame's watch answered and how late Node ran", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    await tapOnPage({ delays: { "Input.dispatchTouchEvent": 1100 } });
    assert.equal(warn.mock.callCount(), 2);
    const [message] = warn.mock.calls[0].arguments;
    assert.match(
      message,
      /^touchStep: the touchStart at \(100, 50\) took \d+ms\. Steps: \+\d+ms asked Chromium: layout \d+ms, hit test \d+ms, node \d+ms, watcher \d+ms, frame id \d+ms, released \d+ms; \+\d+ms the frame at the point: true, the test page; \+\d+ms watched; \+\d+ms sent; \+\d+ms handled by http:\/\/localhost:63315\/__vitest_test__\/; \+\d+ms tidied, waiting for http:\/\/localhost:63315\/__vitest_test__\/\. Watches: http:\/\/localhost:63315\/ answered at \+\d+ms; http:\/\/localhost:63315\/__vitest_test__\/ answered at \+\d+ms\. Node's event loop ran up to \d+ms late\.$/,
    );
  } finally {
    warn.mock.restore();
  }
});
