import { expect, test } from "../ouro-fixtures";
import { openStory, settledBox } from "./story";

test("the picture rests above the call's controls, and Option and an arrow key move it to the next corner and announce it", async ({ page }) => {
  await openStory(page, "layout-snappip--in-call");
  const pip = page.getByRole("group", { name: "Your camera" });
  await expect(pip).toHaveAttribute("data-corner", "bottom-right");
  await expect(pip).toHaveAttribute("data-ax-action", "move");
  const stage = (await page.getByTestId("stage").boundingBox())!;
  const band = (await page.getByTestId("controls-band").boundingBox())!;
  const rest = await settledBox(pip);
  expect(stage.x + stage.width - (rest.x + rest.width)).toBeCloseTo(16, 0);
  expect(band.y - (rest.y + rest.height)).toBeCloseTo(16, 0);
  await pip.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(pip).toHaveAttribute("data-corner", "top-right");
  await expect(page.locator("[data-ouro-announcer]")).toHaveText("Top right");
  await expect(pip).not.toHaveAttribute("data-ouro-settling");
  const top = await settledBox(pip);
  expect(top.y - stage.y).toBeCloseTo(16, 0);
  await expect(pip).toBeFocused();
});

test("a mouse throw up and to the left lands in the top-left corner", async ({ page }) => {
  await openStory(page, "layout-snappip--in-call");
  const pip = page.getByRole("group", { name: "Your camera" });
  const stage = (await page.getByTestId("stage").boundingBox())!;
  const from = await settledBox(pip);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + from.width / 2 + 8, stage.y + from.height / 2 + 8, { steps: 6 });
  await page.mouse.up();
  await expect(pip).toHaveAttribute("data-corner", "top-left");
  await expect(pip).not.toHaveAttribute("data-ouro-settling");
  const rest = await settledBox(pip);
  expect(rest.x - stage.x).toBeCloseTo(16, 0);
  expect(rest.y - stage.y).toBeCloseTo(16, 0);
});

test("double-clicking the picture makes it large, in the same corner", async ({ page }) => {
  await openStory(page, "layout-snappip--in-call");
  const pip = page.getByRole("group", { name: "Your camera" });
  const small = await settledBox(pip);
  await pip.dblclick();
  await expect(pip).toHaveAttribute("data-size", "large");
  await expect(pip).not.toHaveAttribute("data-ouro-settling");
  const large = await settledBox(pip);
  expect(large.width).toBeGreaterThan(small.width);
  expect(large.x + large.width).toBeCloseTo(small.x + small.width, 0);
  expect(large.y + large.height).toBeCloseTo(small.y + small.height, 0);
});

test("with reduced motion it jumps to the next corner and never lifts", async ({ page }) => {
  await openStory(page, "layout-snappip--reduced-motion");
  const pip = page.getByRole("group", { name: "Your camera" });
  const stage = (await page.getByTestId("stage").boundingBox())!;
  await pip.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(pip).toHaveAttribute("data-corner", "bottom-left");
  const box = (await pip.boundingBox())!;
  expect(box.x - stage.x).toBeCloseTo(16, 0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(pip).not.toHaveAttribute("data-dragging");
  expect(await pip.evaluate((element) => getComputedStyle(element).scale)).toBe("none");
  await page.mouse.up();
});
