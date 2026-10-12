import { expect, type Locator, type Page } from "@playwright/test";
import { calls, control, expectAnnounced, expectUnavailable, looksAndFit, reachable, swipe, type ScreenChecks } from "./helpers.mts";

// The first titles of src/api/recipes.ts, in list order: page 1 is 1-10, page 2 starts at 11,
// and page 5 holds 41-47.
const first = [
  "Crispy chickpea salad",
  "Lemon garlic roast chicken",
  "Weeknight beef ragu",
  "Miso glazed salmon",
  "Spiced lentil soup",
  "Shakshuka with feta",
  "Mushroom risotto",
  "Black bean tacos",
  "Thai green curry",
  "Buttermilk pancakes",
];
const eleventh = "Roasted tomato soup";
const fortyFirst = "Tuna nicoise";

const title = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
const pagination = (page: Page) => page.getByRole("navigation", { name: /pagination/i });
const pageControl = (nav: Locator, number: number) => control(nav, new RegExp(`^(go to )?(page )?${number}$`, "i"));

/** The row's vertical band, from its title, so revealed actions can be told apart from other rows'. */
async function band(page: Page, text: string) {
  const box = await title(page, text).first().boundingBox();
  if (!box) throw new Error(`"${text}" has no box`);
  const y = box.y + box.height / 2;
  return { y, top: y - 36, bottom: y + 36 };
}

const action = (page: Page, name: "archive" | "delete") => page.getByRole("button", { name: new RegExp(`^${name}\\b`, "i") });

async function swipeOpen(page: Page, text: string) {
  const row = await band(page, text);
  const width = page.viewportSize()!.width;
  expect(await reachable(action(page, "delete"), row), "Delete is hidden before the swipe").toBe(0);
  await swipe(page, [width - 24, row.y], [width * 0.25, row.y]);
  await expect.poll(() => reachable(action(page, "delete"), row), { message: "swiping left reveals Delete" }).toBe(1);
  await expect.poll(() => reachable(action(page, "archive"), row), { message: "swiping left reveals Archive" }).toBe(1);
  return row;
}

async function openActions(page: Page, text: string) {
  const button = control(page, `Actions for ${text}`);
  await button.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu").filter({ visible: true }).first();
  await expect(menu, "Enter opens a menu").toBeVisible();
  return menu;
}

export const recipeList: ScreenChecks = {
  ready: (page) => expect(title(page, first[0]!).first()).toBeVisible({ timeout: 10_000 }),
  states: [{ name: "actions-menu-open", reach: (page) => openActions(page, first[0]!).then(() => undefined) }],
  judgedElsewhere: { 6: `the loading state by the screenshots; the rest by ${looksAndFit}` },
  checks: [
    {
      id: "ten-per-page",
      title: "The first page shows the first 10 recipes with their time and servings",
      covers: [1],
      viewport: "desktop",
      async run(page) {
        for (const text of first) await expect(title(page, text).first(), `"${text}" is on page 1`).toBeVisible();
        await expect(title(page, eleventh), "the 11th recipe is not on page 1").toHaveCount(0);
        await expect(page.locator("body")).toContainText("15 min");
        await expect(page.locator("body")).toContainText("Serves 2");
      },
    },
    {
      id: "pagination",
      title: "Pagination marks the current page, moves between pages, and disables Previous and Next at the ends",
      covers: [2],
      viewport: "desktop",
      async run(page) {
        const nav = pagination(page);
        await expect(nav, 'a navigation landmark labelled "Pagination"').toBeVisible();
        await expect(pageControl(nav, 1)).toHaveAttribute("aria-current", "page");
        await expectUnavailable(control(nav, /previous/i), "Previous is disabled on the first page");
        await control(nav, /next/i).click();
        await expect(title(page, eleventh).first(), "Next shows page 2").toBeVisible();
        await expect(title(page, first[0]!)).toHaveCount(0);
        await expect(pageControl(nav, 2)).toHaveAttribute("aria-current", "page");
        await expect(pageControl(nav, 1)).not.toHaveAttribute("aria-current", "page");
        await pageControl(nav, 5).click();
        await expect(title(page, fortyFirst).first(), "page 5 shows the last recipes").toBeVisible();
        await expect(title(page, "Lemon drizzle cake").first()).toBeVisible();
        await expectUnavailable(control(nav, /next/i), "Next is disabled on the last page");
      },
    },
    {
      id: "swipe-reveals-actions",
      title: "Swiping a row left reveals Archive and Delete, and swiping back hides them",
      covers: [3],
      viewport: "phone",
      async run(page) {
        const row = await swipeOpen(page, first[0]!);
        const width = page.viewportSize()!.width;
        await swipe(page, [width * 0.25, row.y], [width - 24, row.y]);
        await expect.poll(() => reachable(action(page, "delete"), row), { message: "swiping back hides Delete" }).toBe(0);
      },
    },
    {
      id: "swipe-delete",
      title: "Tapping the revealed Delete deletes the recipe, removes the row and announces it",
      covers: [3, 5],
      viewport: "phone",
      async run(page) {
        const row = await swipeOpen(page, first[0]!);
        const box = await action(page, "delete").evaluateAll((buttons, area) => {
          const button = buttons.find((element) => {
            const rect = element.getBoundingClientRect();
            const y = rect.top + rect.height / 2;
            return rect.width > 0 && y >= area.top && y <= area.bottom;
          });
          const rect = button?.getBoundingClientRect();
          return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
        }, row);
        if (!box) throw new Error("no revealed Delete button");
        await page.touchscreen.tap(box.x, box.y);
        await expect.poll(() => calls(page, "deleteRecipe"), { message: "deleteRecipe ran for the row" }).toEqual([["recipe-1"]]);
        await expect(title(page, first[0]!), "the row left the list").toHaveCount(0);
        await expectAnnounced(page, `${first[0]} deleted`);
      },
    },
    {
      id: "actions-menu-archives",
      title: '"Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it',
      covers: [4, 5],
      viewport: "desktop",
      async run(page) {
        const menu = await openActions(page, first[1]!);
        await expect.poll(() => menu.evaluate((element) => element.contains(document.activeElement)), { message: "focus moves into the menu" }).toBe(true);
        await expect(menu.getByRole("menuitem", { name: /^delete\b/i })).toBeVisible();
        await menu.getByRole("menuitem", { name: /^archive\b/i }).click();
        await expect.poll(() => calls(page, "archiveRecipe"), { message: "archiveRecipe ran for the row" }).toEqual([["recipe-2"]]);
        await expect(title(page, first[1]!), "the row left the list").toHaveCount(0);
        await expectAnnounced(page, `${first[1]} archived`);
      },
    },
    {
      id: "actions-menu-by-keyboard",
      title: "The actions menu works with the keyboard alone: arrow to Delete, press Enter",
      covers: [4, 5],
      viewport: "desktop",
      async run(page) {
        await openActions(page, first[2]!);
        for (let presses = 0; presses < 4; presses++) {
          const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
          if (/^delete\b/i.test(focused)) break;
          await page.keyboard.press("ArrowDown");
        }
        await page.keyboard.press("Enter");
        await expect.poll(() => calls(page, "deleteRecipe"), { message: "Enter on Delete deletes the recipe" }).toEqual([["recipe-3"]]);
        await expect(title(page, first[2]!)).toHaveCount(0);
      },
    },
  ],
};
