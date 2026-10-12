import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("typing a hex moves the swatch, and leaving tidies the text", async ({ page }) => {
  await openStory(page, "forms-colorfield--states");
  const text = page.getByRole("textbox", { name: "Accent color" });
  const swatch = page.getByLabel("Pick a color").first();
  await expect(text).toHaveValue("#3366ff");
  await text.fill("F80");
  await expect(swatch).toHaveValue("#ff8800");
  await text.press("Tab");
  await expect(text).toHaveValue("#ff8800");
});
