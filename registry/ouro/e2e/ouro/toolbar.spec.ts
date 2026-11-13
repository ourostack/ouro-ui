import { expect, test } from "../ouro-fixtures";
import { holdClock, openStory, pressTab } from "./story";

test("is one tab stop whose arrow keys move between controls, and presses a toggle", async ({ page }) => {
  await openStory(page, "actions-toolbar--labeled");
  const toolbar = page.getByRole("toolbar", { name: "Document" });
  await toolbar.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Redo" })).toBeFocused();
  await expect(toolbar.getByRole("button", { name: "Redo" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("End");
  const outline = toolbar.getByRole("button", { name: "Show outline" });
  await expect(outline).toBeFocused();
  await expect(outline).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(outline).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Home");
  await expect(toolbar.getByRole("button", { name: "Undo" })).toBeFocused();
});

test("moves what does not fit into the More menu, with toggles as checkbox items", async ({ page }) => {
  await openStory(page, "actions-toolbar--overflow");
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  const more = toolbar.getByRole("button", { name: "More" });
  await expect(more).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Quote" })).toHaveCount(0);
  await more.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Quote" })).toBeVisible();
  const code = menu.getByRole("menuitemcheckbox", { name: /Code/ });
  await expect(code).toHaveAttribute("aria-checked", "false");
  await code.click();
  await expect(code).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
});

test("keeps the caret in the message when a control is clicked", async ({ page }) => {
  await openStory(page, "actions-toolbar--composer");
  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("Lunch at noon");
  await message.focus();
  await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bold" }).click();
  await expect(message).toBeFocused();
  await expect(page.getByText("Bold on, italic off")).toBeVisible();
});

test("floats as glass over the call, and turns solid with a defined edge for more contrast", async ({ page }) => {
  await openStory(page, "actions-toolbar--floating");
  const toolbar = page.getByRole("toolbar", { name: "Call controls" });
  await expect(toolbar).toHaveCSS("backdrop-filter", /^blur\(/);
  const before = (await toolbar.boundingBox())!;
  await page.emulateMedia({ contrast: "more" });
  await expect(toolbar).toHaveCSS("backdrop-filter", "none");
  await expect(toolbar).toHaveCSS("box-shadow", / 0px 0px 0px 2px/);
  expect((await toolbar.boundingBox())!.height).toBe(before.height);
});

test("fades after the pointer rests, stays reachable, and comes back on a move over the stage or when Tab reaches it", async ({ page }) => {
  await page.clock.install();
  await openStory(page, "actions-toolbar--auto-hide");
  await holdClock(page);
  const toolbar = page.getByRole("toolbar", { name: "Call controls" });
  const stage = page.getByRole("group", { name: "Design review" });
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.clock.runFor(3000);
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  await expect(page.getByText("Controls faded")).toBeVisible();
  // Faded, it is still there for assistive technology, and keys elsewhere leave it be.
  await expect(toolbar.getByRole("button", { name: "Mute" })).toHaveCount(1);
  await page.keyboard.press("Shift");
  await page.keyboard.press("Space");
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  await page.mouse.move(box.x + 60, box.y + 40);
  await expect(toolbar).not.toHaveAttribute("data-hidden");
  await expect(page.getByText("Controls showing")).toBeVisible();
  await page.clock.runFor(3000);
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  await pressTab(page);
  await expect(toolbar.getByRole("button", { name: "Mute" })).toBeFocused();
  await expect(toolbar).not.toHaveAttribute("data-hidden");
  // Keyboard focus holds it however long the pointer rests.
  await page.clock.runFor(10_000);
  await expect(toolbar).not.toHaveAttribute("data-hidden");
  // Back to the mouse: neither the focus on Mute nor the tooltip Tab showed holds it, and the tooltip goes with it.
  await page.evaluate(() => {
    const bar = document.querySelector('[data-ouro="toolbar"]')!;
    const observer = new MutationObserver(() => {
      if (!bar.hasAttribute("data-hidden")) return;
      observer.disconnect();
      // Mute's trigger has data-popup-open while its tooltip is open.
      (window as unknown as { openAtFade?: boolean }).openAtFade = bar.querySelector("[data-popup-open]") !== null;
    });
    observer.observe(bar, { attributes: true, attributeFilter: ["data-hidden"] });
  });
  await page.mouse.move(box.x + 80, box.y + 40);
  await page.clock.runFor(3000);
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  // The bar fades in the commit that closes its tooltip, so none is still open as it fades.
  expect(await page.evaluate(() => (window as unknown as { openAtFade?: boolean }).openAtFade)).toBe(false);
  await expect(toolbar.getByRole("button", { name: "Mute" })).toBeFocused();
  // The tooltip leaves on an animation frame it asks for only once React has run the close, which a
  // loaded runner can do after any set run of the held clock (ourostack/ouro-ui#902): let the clock
  // run and wait for it to go.
  await page.clock.resume();
  await expect(page.locator('[data-ouro="tooltip"]')).toHaveCount(0);
});

test("comes back for the app's own mute shortcut, and for no other key", async ({ page }) => {
  await page.clock.install();
  await openStory(page, "actions-toolbar--auto-hide");
  await holdClock(page);
  const toolbar = page.getByRole("toolbar", { name: "Call controls" });
  const box = (await page.getByRole("group", { name: "Design review" }).boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + 40);
  await page.clock.runFor(3000);
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  await page.keyboard.press("m");
  await page.keyboard.press("Shift+M");
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  await page.keyboard.press("ControlOrMeta+Shift+M");
  await expect(toolbar).not.toHaveAttribute("data-hidden");
  await expect(toolbar.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
  await page.clock.runFor(3000);
  await expect(toolbar).toHaveAttribute("data-hidden", "");
});
