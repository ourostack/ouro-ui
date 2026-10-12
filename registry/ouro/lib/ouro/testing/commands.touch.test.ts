import { expect, test } from "vitest";
import { commands } from "vitest/browser";

test("the touch project reports a coarse pointer at 390x844", () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(innerWidth).toBe(390);
});

test("swipe scrolls what is under the finger with real touch input", async () => {
  // Shaped like the Select sheet's list, which this command scrolls on every runner: rows
  // of text in a box that scrolls, swiped from near its bottom to near its top.
  const scroller = document.createElement("div");
  scroller.setAttribute("data-scroller", "");
  scroller.style.cssText = "height:400px;overflow-y:auto;";
  scroller.innerHTML = Array.from({ length: 40 }, (_, index) => `<div style="height:44px">Row ${index + 1}</div>`).join("");
  document.body.append(scroller);
  await commands.tap("[data-scroller]");
  const events: string[] = [];
  scroller.addEventListener("pointerdown", (event) => events.push(event.pointerType));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const box = scroller.getBoundingClientRect();
  const x = box.left + box.width / 2;
  await commands.swipe({ from: [x, box.bottom - 30], to: [x, box.top + 30], steps: 10 });
  await expect.poll(() => scroller.scrollTop).toBeGreaterThan(100);
  scroller.remove();
  expect(events).toEqual(["touch"]);
});
