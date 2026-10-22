import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a briefing is a region with its heading, its rows as terms and details, and the agent's note", async ({ page }) => {
  await openStory(page, "display-briefingcard--with-note");
  const card = page.getByRole("region", { name: "Weekly sync" });
  await expect(card.getByRole("heading", { name: "Weekly sync" })).toBeVisible();
  await expect(card.getByRole("term")).toHaveText(["Chat", "Last time", "Waiting on you"]);
  await expect(card.getByRole("link", { name: "Notes from last week" })).toBeVisible();
  await expect(card.getByRole("article", { name: "Note Ouro Agent" })).toBeVisible();
});
