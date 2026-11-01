import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("draws a message's tokens and emoji text as the catalogue's images, named for screen readers", async ({ page }) => {
  await openStory(page, "chat-emoji--in-messages");
  const party = page.getByRole("img", { name: "Party popper" }).first();
  await expect(party).toBeVisible();
  await expect(party).toHaveJSProperty("complete", true);
  await expect(page.getByRole("img", { name: "Waving hand" })).toBeVisible();
  await expect(page.getByText(":unknown: stays text")).toBeVisible();
  await expect(page.getByText(":party:")).toHaveCount(0);
});

test("plays an animated emoji while its button is under the mouse, and shows it still again after", async ({ page }) => {
  await openStory(page, "chat-emoji--in-buttons");
  const button = page.getByRole("button", { name: "Party popper" });
  const image = button.locator("img");
  const still = await image.getAttribute("src");
  await button.hover();
  await expect(image).not.toHaveAttribute("src", still!);
  await page.mouse.move(0, 0);
  await expect(image).toHaveAttribute("src", still!);
});

test("keeps an animated emoji still with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStory(page, "chat-emoji--in-buttons");
  const button = page.getByRole("button", { name: "Party popper" });
  const image = button.locator("img");
  const still = await image.getAttribute("src");
  await button.hover();
  await button.focus();
  await expect(image).toHaveAttribute("src", still!);
});
