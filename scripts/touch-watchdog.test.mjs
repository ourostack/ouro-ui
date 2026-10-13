import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers";
import vm from "node:vm";
import { touchStep } from "../registry/ouro/lib/ouro/testing/commands.ts";

const drain = () => new Promise((resolve) => setImmediate(resolve));

function frozenFrame() {
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
  const frame = {
    url: () => view.location.href,
    async evaluate(source) { return vm.runInContext(source, context); },
  };
  let suppress = false;
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
      if (!suppress) {
        const type = params.type.toLowerCase();
        listeners.get(type)?.({ type, target, changedTouches: [{ clientX: last.x, clientY: last.y }] });
      }
      return {};
    },
  };
  const subscriptions = new Set();
  const page = {
    frames: () => [frame],
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
  };
}

for (const missing of ["touchEnd", "touchMove"]) {
  test(`touchStep rejects a missing ${missing} at its provider deadline with frozen page timers`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
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
