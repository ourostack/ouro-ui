import { expect, test } from "vitest";
import { commands, page } from "vitest/browser";

test("the touch project reports a coarse pointer at 390x844", () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(innerWidth).toBe(390);
});

// On a mobile page, a turn to landscape zooms the page and turning back leaves the zoom,
// which used to send every later touch to the wrong point.
test("touchDrag lands on its target after a turn to landscape and back", async () => {
  await page.viewport(844, 390);
  await page.viewport(390, 844);
  const zoom = () => window.parent.visualViewport?.scale;
  await expect.poll(zoom).toBeGreaterThan(1);
  const target = document.createElement("div");
  target.style.cssText = "position:fixed;left:150px;top:700px;width:90px;height:60px;touch-action:none;";
  document.body.append(target);
  let hits = 0;
  target.addEventListener("touchstart", () => hits++);
  await commands.touchDrag({ from: [195, 730], to: [195, 760], steps: 2 });
  target.remove();
  expect(hits).toBe(1);
  expect(zoom()).toBe(1);
});
