import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";

// Two tests in order. Chromium drops a page's touch emulation after a screenshot that reaches
// beyond the viewport, which is what Vitest takes when a test fails on a tall page. The
// `ouro-touch` setup (testing/touch-setup.ts) turns it back on before every test, so one
// failure does not fail every later test that needs a coarse pointer.

const nodes: Element[] = [];
afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
});

const phone = () => ({
  coarse: matchMedia("(pointer: coarse)").matches,
  hover: matchMedia("(any-hover: hover)").matches,
  touchPoints: navigator.maxTouchPoints,
});

test("a test takes a screenshot of a page taller than the phone", async () => {
  expect(phone()).toEqual({ coarse: true, hover: false, touchPoints: 1 });
  const tall = document.createElement("div");
  tall.style.height = "2500px";
  document.body.append(tall);
  nodes.push(tall);
  await page.screenshot({ save: false });
});

test("the next test is still on a touch phone", () => {
  expect(phone()).toEqual({ coarse: true, hover: false, touchPoints: 1 });
});
