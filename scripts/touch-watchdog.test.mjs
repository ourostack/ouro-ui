import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { setImmediate } from "node:timers";
import vm from "node:vm";
import { touchDrag, touchStep } from "../registry/ouro/lib/ouro/testing/commands.ts";

const drain = () => new Promise((resolve) => setImmediate(resolve));

function frozenFrame({ unreachableOtherFrame = false } = {}) {
  const listeners = new Map();
  const target = { addEventListener() {}, removeEventListener() {} };
  const view = {
    document: { readyState: "complete" },
    location: { href: "https://touch-fixture.invalid/frame" },
    visualViewport: { offsetLeft: 0, offsetTop: 0 },
    length: 0,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  view.parent = view;
  const context = vm.createContext({
    window: view,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  let loseAfterMove = false;
  let unreachable = false;
  let replaceAfterMove = false;
  const frame = {
    url: () => view.location.href,
    async evaluate(source) {
      if (unreachable) throw new Error("frame transport unavailable");
      return vm.runInContext(source, context);
    },
  };
  let suppress = false;
  let canceledInput;
  let last = { x: 100, y: 100 };
  const session = {
    async send(method, params = {}) {
      if (method === "Page.getLayoutMetrics") return { cssVisualViewport: { pageX: 0, pageY: 0 } };
      if (method === "DOM.getNodeForLocation") return { backendNodeId: 1 };
      if (method === "DOM.resolveNode") return { object: { objectId: "touch-fixture-node" } };
      if (method === "Runtime.callFunctionOn") return { result: { value: { watched: Boolean(view.__ouroTouch), where: view.location.href } } };
      if (method === "Runtime.releaseObject") return {};
      assert.equal(method, "Input.dispatchTouchEvent");
      if (params.touchPoints[0]) last = params.touchPoints[0];
      if (params.type === "touchMove" && loseAfterMove) {
        unreachable = true;
        return {};
      }
      if (params.type === "touchMove" && replaceAfterMove) {
        assert.equal(view.__ouroTouch.expected.type, "touchmove");
        view.document = { readyState: "complete" };
        return {};
      }
      if (!suppress) {
        const type = params.type === canceledInput ? "touchcancel" : params.type.toLowerCase();
        listeners.get(type)?.({ type, target, changedTouches: [{ clientX: last.x, clientY: last.y }] });
      }
      return {};
    },
  };
  const subscriptions = new Set();
  const page = {
    frames: () => unreachableOtherFrame ? [frame, {
      url: () => "https://touch-fixture.invalid/unrelated-frame",
      async evaluate() { throw new Error("unrelated frame unavailable"); },
    }] : [frame],
    on(name) { subscriptions.add(name); return this; },
    off(name) { subscriptions.delete(name); return this; },
    context: () => ({
      browser: () => ({ browserType: () => ({ name: () => "chromium" }) }),
      newCDPSession: async () => session,
    }),
  };
  return {
    ctx: { page, provider: { name: "playwright" } },
    view,
    subscriptions,
    suppress(value) { suppress = value; },
    cancelInput(type) { canceledInput = type; },
    replaceDocument() { view.document = { readyState: "complete" }; },
    replaceDocumentAfterMove(value) { replaceAfterMove = value; },
    loseMoveObservations(value) {
      loseAfterMove = value;
      if (!value) unreachable = false;
    },
  };
}

for (const durationMs of [undefined, 600]) {
  test(`touchDrag ${durationMs === undefined ? "keeps untimed input sequential" : "queues timed input before waiting for replies"}`, async () => {
    const h = frozenFrame();
    const session = await h.ctx.page.context().newCDPSession();
    const send = session.send.bind(session);
    let release;
    const reply = new Promise((resolve) => { release = resolve; });
    const packets = [];
    session.send = async (method, params) => {
      if (method === "Input.dispatchTouchEvent") packets.push(params);
      const value = await send(method, params);
      if (method === "Input.dispatchTouchEvent" && params.type === "touchStart") await reply;
      return value;
    };
    let completed = false;
    const pending = touchDrag(h.ctx, { from: [100, 100], to: [140, 100], steps: 10, ...(durationMs === undefined ? {} : { durationMs }) });
    void pending.then(() => { completed = true; });
    try {
      await drain();
      const types = ["touchStart", ...Array(10).fill("touchMove"), "touchEnd"];
      assert.deepEqual(packets.map((packet) => packet.type), durationMs === undefined ? ["touchStart"] : types);
      assert.equal(completed, false, "the command must await the delayed reply even when the page saw touchEnd");
      if (durationMs !== undefined) {
        assert.equal(packets.at(-1).timestamp, packets[0].timestamp + durationMs / 1000);
        assert.deepEqual(packets.at(-2).touchPoints, [{ x: 140, y: 100, id: 1 }]);
        assert.deepEqual(packets.at(-1).touchPoints, []);
      }
    } finally {
      release();
      await pending;
    }
    assert.equal(h.view.__ouroTouch, undefined);
    assert.equal(h.subscriptions.size, 0);
    if (durationMs === undefined) assert.ok(packets.every((packet) => !Object.hasOwn(packet, "timestamp")));
  });
}

test("touchStep rejects unknown first-move observations instead of declaring Chromium slop", async () => {
  const h = frozenFrame();
  await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
  h.loseMoveObservations(true);
  await assert.rejects(touchStep(h.ctx, { type: "touchMove", x: 101, y: 100 }), (error) => {
    assert.match(error.message, /the page did not handle the touchMove/);
    assert.match(error.message, /Failed calls:.*frame transport unavailable/);
    return true;
  });
  h.loseMoveObservations(false);
  await touchStep(h.ctx, { type: "touchEnd" });
  await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
  await touchStep(h.ctx, { type: "touchEnd" });
  assert.equal(h.view.__ouroTouch, undefined);
  assert.equal(h.subscriptions.size, 0);
});

test("touchStep rejects a canceled first move instead of declaring Chromium slop", async () => {
  const h = frozenFrame();
  await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
  h.cancelInput("touchMove");
  await assert.rejects(touchStep(h.ctx, { type: "touchMove", x: 101, y: 100 }), (error) => {
    assert.match(error.message, /the page did not handle the touchMove/);
    assert.match(error.message, /It handled: touchcancel/);
    return true;
  });
  h.cancelInput(undefined);
  await touchStep(h.ctx, { type: "touchEnd" });
  assert.equal(h.view.__ouroTouch, undefined);
  assert.equal(h.subscriptions.size, 0);
});

test("touchStep accepts touchcancel as the gesture's terminal event", async () => {
  const h = frozenFrame();
  await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
  h.cancelInput("touchEnd");
  await touchStep(h.ctx, { type: "touchEnd" });
  assert.equal(h.view.__ouroTouch, undefined);
  assert.equal(h.subscriptions.size, 0);
});

for (const boundary of ["before watch startup", "at input acknowledgment"]) {
  test(`touchStep rejects a target document replaced ${boundary} instead of declaring slop`, async () => {
    const h = frozenFrame();
    await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
    if (boundary === "before watch startup") {
      h.replaceDocument();
      h.suppress(true);
    } else h.replaceDocumentAfterMove(true);
    await assert.rejects(touchStep(h.ctx, { type: "touchMove", x: 101, y: 100 }), /the page did not handle the touchMove/);
    h.replaceDocumentAfterMove(false);
    h.suppress(false);
    await touchStep(h.ctx, { type: "touchEnd" });
    await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
    await touchStep(h.ctx, { type: "touchEnd" });
    assert.equal(h.view.__ouroTouch, undefined);
    assert.equal(h.subscriptions.size, 0);
  });
}

for (const unreachableOtherFrame of [false, true]) {
  test(`touchStep accepts observed first-move slop with ${unreachableOtherFrame ? "an unavailable unrelated frame" : "only its target frame"}`, async () => {
    const h = frozenFrame({ unreachableOtherFrame });
    await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
    h.suppress(true);
    await touchStep(h.ctx, { type: "touchMove", x: 101, y: 100 });
    h.suppress(false);
    await touchStep(h.ctx, { type: "touchEnd" });
    assert.equal(h.view.__ouroTouch, undefined);
    assert.equal(h.subscriptions.size, 0);
  });
}

for (const missing of ["touchEnd", "touchMove"]) {
  test(`touchStep rejects a missing ${missing} at its provider deadline with frozen page timers`, async (t) => {
    // The kit counts its limit on performance.now(); keep that on the mocked clock too.
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    t.mock.method(performance, "now", () => Date.now());
    const h = frozenFrame();
    await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
    await touchStep(h.ctx, { type: "touchMove", x: 150, y: 100 });
    h.suppress(true);
    let outcome;
    const pending = touchStep(h.ctx, missing === "touchEnd" ? { type: missing } : { type: missing, x: 200, y: 100 })
      .then(() => { outcome = "fulfilled"; }, (error) => { outcome = error; });
    await drain();
    t.mock.timers.tick(4999);
    await drain();
    assert.equal(outcome, undefined);
    t.mock.timers.tick(1);
    await drain();
    assert.ok(outcome instanceof Error, `expected rejection at 5000ms, got ${String(outcome)}`);
    assert.match(outcome.message, new RegExp(`did not handle the ${missing}.*within 5000ms`));
    assert.match(outcome.message, /watching, complete/);
    assert.doesNotMatch(outcome.message, /did not answer within 6000ms/);
    assert.notEqual(typeof h.view.__ouroTouch?.resolve, "function");
    await pending;
    h.suppress(false);
    await touchStep(h.ctx, { type: "touchStart", x: 100, y: 100 });
    await touchStep(h.ctx, { type: "touchEnd" });
    assert.equal(h.view.__ouroTouch, undefined);
    assert.equal(h.subscriptions.size, 0);
  });
}
