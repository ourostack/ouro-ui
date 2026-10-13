import { expect, type Page } from "@playwright/test";
import { axeScan, calls, control, expectFocusWithin, fitsPhone, openDialog, type ScreenChecks } from "./helpers.mts";

const opener = (page: Page) => control(page, /^search commands/i);
const palette = (page: Page) => openDialog(page);

async function openFromButton(page: Page) {
  await opener(page).click();
  await expect(palette(page), "the palette opens").toBeVisible();
  return palette(page);
}

/** Fails unless focus is in a text field inside the palette. */
async function expectSearchFocused(page: Page) {
  await expect
    .poll(
      () =>
        palette(page).evaluate((dialog) => {
          const active = document.activeElement;
          return Boolean(active && dialog.contains(active) && active.matches("input, textarea, [role='combobox'], [role='searchbox'], [role='textbox']"));
        }),
      { message: "the search field has focus" },
    )
    .toBe(true);
}

const ready = (page: Page) => expect(opener(page)).toBeVisible({ timeout: 10_000 });

export const commandPalette: ScreenChecks = {
  ready,
  states: [{ name: "palette-open", reach: (page) => openFromButton(page).then(() => undefined) }],
  judgedElsewhere: { 8: axeScan },
  checks: [
    {
      id: "button-opens-with-search-focused",
      title: '"Search commands" opens a modal dialog titled "Command palette" with the search field focused',
      covers: [1, 2],
      viewport: "desktop",
      async run(page) {
        const dialog = await openFromButton(page);
        await expect(dialog).toHaveAccessibleName(/command palette/i);
        await expectSearchFocused(page);
      },
    },
    {
      id: "shortcuts-open",
      title: "Ctrl+K and ⌘K open the palette",
      covers: [1],
      viewport: "desktop",
      async run(page) {
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.keyboard.press("Control+k");
        await expect(palette(page), "Ctrl+K opens the palette").toBeVisible();
        await expectSearchFocused(page);
        await page.keyboard.press("Escape");
        await expect(palette(page)).toBeHidden();
        await page.keyboard.press("Meta+k");
        await expect(palette(page), "⌘K opens the palette").toBeVisible();
      },
    },
    {
      id: "filters-by-label",
      title: "Typing filters by label ignoring case, hides empty groups, and says when nothing matches",
      covers: [3],
      viewport: "desktop",
      async run(page) {
        const dialog = await openFromButton(page);
        await expect(dialog.getByText("Account", { exact: true }).first(), "group headings show").toBeVisible();
        await page.keyboard.type("SHOP");
        await expect(dialog.getByText("Go to Shopping list").first()).toBeVisible();
        await expect(dialog.getByText("Go to Settings").filter({ visible: true }), "other commands are filtered out").toHaveCount(0);
        await expect(dialog.getByText("Navigation", { exact: true }).first()).toBeVisible();
        await expect(dialog.getByText("Account", { exact: true }).filter({ visible: true }), "a group with no match disappears").toHaveCount(0);
        await page.locator(":focus").fill("zzz");
        await expect(dialog.getByText("No commands found.").first()).toBeVisible();
      },
    },
    {
      id: "arrows-and-enter-run",
      title: "The first match is highlighted; Down then Enter runs the second, closes the palette and shows it",
      covers: [4, 5],
      viewport: "desktop",
      async run(page) {
        await openFromButton(page);
        await page.keyboard.type("new");
        await expect(palette(page).getByText("New cookbook").first()).toBeVisible();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect.poll(() => calls(page, "runCommand"), { message: "runCommand ran New cookbook" }).toEqual([["new-cookbook"]]);
        await expect(palette(page)).toBeHidden();
        await expect(page.getByText("Last command: New cookbook").first()).toBeVisible();
      },
    },
    {
      id: "click-runs",
      title: "Clicking a command runs it",
      covers: [4, 5],
      viewport: "desktop",
      async run(page) {
        const dialog = await openFromButton(page);
        await dialog.getByText("Go to Recipes").first().click();
        await expect.poll(() => calls(page, "runCommand"), { message: "runCommand ran Go to Recipes" }).toEqual([["go-recipes"]]);
        await expect(palette(page)).toBeHidden();
        await expect(page.getByText("Last command: Go to Recipes").first()).toBeVisible();
      },
    },
    {
      id: "escape-returns-focus",
      title: "Escape closes the palette without running anything and focus returns to the button",
      covers: [6],
      viewport: "desktop",
      async run(page) {
        await openFromButton(page);
        await page.keyboard.press("Escape");
        await expect(palette(page)).toBeHidden();
        await expectFocusWithin(opener(page), "focus returns to Search commands");
        expect(await calls(page, "runCommand")).toEqual([]);
      },
    },
    fitsPhone(7),
  ],
};
