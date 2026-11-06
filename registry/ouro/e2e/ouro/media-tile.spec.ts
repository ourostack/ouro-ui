import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("each tile in a grid reads as one sentence, and Pin pins it", async ({ page }) => {
  await openStory(page, "display-mediatile--grid-of-four");
  await expect(page.getByRole("group", { name: "Mara Lind, speaking, camera on" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Jonas Ek, muted, camera off" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Priya Raman, camera on, hand raised" })).toBeVisible();
  const theo = page.getByRole("group", { name: "Theo Okafor, muted, camera on, poor connection" });
  await expect(theo).toBeVisible();
  const pin = theo.getByRole("button", { name: "Pin" });
  await expect(pin).toHaveAttribute("data-ax-action", "pin");
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Theo Okafor, muted, camera on, poor connection, pinned" })).toBeVisible();
});

test("a share is never cropped, and says who presents", async ({ page }) => {
  await openStory(page, "display-mediatile--share-contain");
  const tile = page.getByRole("group", { name: "Theo Okafor, presenting, shared screen" });
  await expect(tile).toBeVisible();
  await expect(tile.locator("img")).toHaveCSS("object-fit", "contain");
  await expect(tile).toContainText("Presenting");
  await expect(tile.locator('[data-ouro-part="ring"]')).toHaveCount(0);
});

test("with reduced motion, the ring turns on steady, with no fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStory(page, "display-mediatile--reduced-motion");
  const ring = page.locator('[data-ouro-part="ring"]');
  await expect(ring).toHaveCSS("opacity", "0");
  await page.getByRole("switch", { name: "Mara is speaking" }).click();
  await expect(page.getByRole("group", { name: "Mara Lind, speaking, camera on" })).toBeVisible();
  await expect(ring).toHaveCSS("opacity", "1");
  await expect(ring).toHaveCSS("transition-property", "none");
});
