import { expect, test } from "vitest";
import { commands } from "vitest/browser";

test("the touch project reports a coarse pointer at 390x844", () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(innerWidth).toBe(390);
});

test("swipe scrolls what is under the finger with real touch input", async () => {
  const scroller = document.createElement("div");
  scroller.style.cssText = "position:fixed;inset:0;overflow-y:auto;";
  scroller.innerHTML = '<div style="height:3000px"></div>';
  document.body.append(scroller);
  scroller.setAttribute("data-scroller", "");
  // A tap first, as in the Select sheet test: on Linux CI, a swipe that was the page's first
  // touch input did not scroll.
  await commands.tap("[data-scroller]");
  const events: string[] = [];
  scroller.addEventListener("pointerdown", (event) => events.push(event.pointerType));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await commands.swipe({ from: [200, 600], to: [200, 200], steps: 8 });
  await expect.poll(() => scroller.scrollTop).toBeGreaterThan(100);
  scroller.remove();
  expect(events).toEqual(["touch"]);
});
