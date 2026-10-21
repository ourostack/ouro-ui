import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
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
 * is lost, as for a busy frame.
 */
function stage({ url = "about:srcdoc", listAfter = 150, listedUrl = "" } = {}) {
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
        // The kit's wait for the frame to draw, before a touch into a frame in another process.
        if (typeof call === "function") {
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
  const list = () => {
    listed.push(target);
    page.emit("frameattached", target);
  };
  let timer;
  const session = {
    async send(method, params) {
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
  return { ctx, sent, target, start, stop: () => clearTimeout(timer) };
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
