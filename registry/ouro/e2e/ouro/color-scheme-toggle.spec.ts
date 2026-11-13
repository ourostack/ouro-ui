import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("the color scheme toggle switches the page to dark and back, and keeps the choice", async ({ page }) => {
  await openStory(page, "actions-colorschemetoggle--in-context");
  await page.evaluate(() => localStorage.removeItem("ouro-color-scheme"));
  const html = page.locator("html");
  const trigger = page.getByRole("button", { name: "Color scheme" });
  await trigger.click();
  // On a phone width the menu is a bottom sheet that slides up. A press on an option still moving can
  // come up on the next item and drop the click, so wait until the sheet has stopped.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const menu = document.querySelector<HTMLElement>('[role="menu"][data-ouro-presentation]');
        if (!menu || menu.hasAttribute("data-starting-style")) return resolve(false);
        const top = () => menu.getBoundingClientRect().top;
        const idle = () => menu.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running");
        const before = top();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(idle() && top() === before)));
      }),
  );
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("ouro-color-scheme"))).toBe("dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await page.evaluate(() => localStorage.removeItem("ouro-color-scheme"));
});
