import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("a progress bar is named by its label and reports its value", async ({ page }) => {
  await openStory(page, "feedback-progress--states");
  const upload = page.getByRole("progressbar", { name: "Uploading photos" });
  await expect(upload).toHaveAttribute("aria-valuenow", "40");
  await expect(upload).toContainText("40%");
  const importing = page.getByRole("progressbar", { name: "Importing recipes" });
  await expect(importing).not.toHaveAttribute("aria-valuenow");
  await expect(page.getByRole("progressbar", { name: "Hidden label" })).toHaveAttribute("aria-valuenow", "65");
});
