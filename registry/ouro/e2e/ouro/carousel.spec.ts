import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("steps through the slides with Next and Previous and stops at the ends", async ({ page }) => {
  await openStory(page, "display-carousel--photos");
  const carousel = page.getByRole("region", { name: "Featured recipes" });
  await expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
  const previous = carousel.getByRole("button", { name: "Previous slide" });
  const next = carousel.getByRole("button", { name: "Next slide" });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(previous).toBeEnabled();
  await expect(page.locator("[data-ouro-announcer]")).toHaveText("Slide 2 of 5");
  for (let step = 0; step < 3; step++) await next.click();
  await expect(next).toBeDisabled();
  await expect(previous).toBeFocused();
  await expect(page.locator("[data-ouro-announcer]")).toHaveText("Slide 5 of 5");
  const slide = carousel.getByRole("group", { name: "Slide 5 of 5" });
  await expect(slide).toBeInViewport();
});

test("wraps around with loop", async ({ page }) => {
  await openStory(page, "display-carousel--several-per-view");
  const carousel = page.getByRole("region", { name: "Featured recipes" });
  await carousel.getByRole("button", { name: "Previous slide" }).click();
  await expect(page.locator("[data-ouro-announcer]")).toHaveText("Slide 4 of 5");
  await expect(carousel.getByRole("group", { name: "Slide 5 of 5" })).toBeInViewport();
});
