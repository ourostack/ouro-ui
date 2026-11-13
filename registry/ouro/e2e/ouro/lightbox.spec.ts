import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("opens on the photo pressed, steps with the arrow keys and gives focus back on Escape", async ({ page }) => {
  await openStory(page, "display-lightbox--photos");
  const thumbnails = page.getByRole("list", { name: "Coast photos" }).getByRole("button");
  await expect(thumbnails).toHaveCount(4);
  await thumbnails.nth(1).click();
  const viewer = page.getByRole("dialog", { name: "Coast photos" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("2 of 4", { exact: true })).toBeVisible();
  // Focus starts on the images once the viewer has opened; the arrow keys step from there.
  await expect(viewer.getByRole("region", { name: "Coast photos" }).locator("[data-ouro-carousel-viewport]")).toBeFocused();
  await expect(viewer.getByRole("group", { name: "2 of 4" }).getByRole("img")).toHaveAccessibleName("Tall cliffs at noon over a harbour, in a portrait frame");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-ouro-announcer]")).toHaveText("3 of 4");
  await expect(viewer.getByRole("group", { name: "3 of 4" })).toBeInViewport();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("[data-ouro-announcer]")).toHaveText("2 of 4");
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(thumbnails.nth(1)).toBeFocused();
});

test("closes from the button beside the position and goes round with loop", async ({ page }) => {
  await openStory(page, "display-lightbox--loop-with-originals");
  await page.getByRole("list", { name: "Coast photos" }).getByRole("button").nth(2).click();
  const viewer = page.getByRole("dialog", { name: "Coast photos" });
  await expect(viewer.getByRole("link", { name: "Open original" })).toHaveAttribute("href", "https://example.com/photos/coast-3.jpg");
  await viewer.getByRole("button", { name: "Next image" }).click();
  await expect(viewer.getByText("1 of 3", { exact: true })).toBeVisible();
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toBeHidden();
});

test("opens the viewer alone from the app's own thumbnails and gives focus back to the one used", async ({ page }) => {
  await openStory(page, "display-lightbox--before-and-after");
  const after = page.getByRole("button", { name: "See after" });
  await after.focus();
  await page.keyboard.press("Enter");
  const viewer = page.getByRole("dialog", { name: "Coast, before and after, 2 of 2" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("After", { exact: true })).toBeVisible();
  await expect(viewer.getByRole("region", { name: "Coast, before and after" }).locator("[data-ouro-carousel-viewport]")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "Coast, before and after, 1 of 2" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(after).toBeFocused();
});

test("draws a wide photo across a phone's width, and zooms it with a double-click and back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "display-lightbox--photos");
  await page.getByRole("list", { name: "Coast photos" }).getByRole("button").first().click();
  const viewer = page.getByRole("dialog", { name: "Coast photos, 1 of 4" });
  const photo = viewer.getByRole("group", { name: "1 of 4" }).getByRole("img");
  await expect(photo).toBeVisible();
  // Once the viewer has grown to its full size.
  await expect.poll(async () => (await photo.boundingBox())!.width).toBeGreaterThanOrEqual(360);
  await photo.dblclick();
  const zoomed = viewer.getByRole("group", { name: "Zoom" });
  await expect(zoomed).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Zoom" })).toHaveAttribute("aria-pressed", "true");
  await zoomed.dblclick();
  await expect(zoomed).toBeHidden();
});
