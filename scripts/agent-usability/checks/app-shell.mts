import { expect, type Page } from "@playwright/test";
import { axeScan, calls, control, expectFocusWithin, fitsPhone, reachable, type ScreenChecks } from "./helpers.mts";

const pages = [
  ["Home", "#/"],
  ["Recipes", "#/recipes"],
  ["Cookbooks", "#/cookbooks"],
  ["Shopping list", "#/shopping-list"],
  ["Settings", "#/settings"],
] as const;

const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name, exact: true });
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main", exact: true }).filter({ visible: true }).first();
const anyLink = (page: Page, name: string) => page.getByRole("link", { name, exact: true });
const menuButton = (page: Page) => control(page, /^open navigation$/i);

async function openMenu(page: Page) {
  await expect.poll(() => reachable(anyLink(page, "Settings")), { message: "the navigation is folded away on a phone" }).toBe(0);
  await menuButton(page).click();
  await expect.poll(() => reachable(anyLink(page, "Settings")), { message: "Open navigation shows the links" }).toBe(1);
}

// Any heading: the level the task asks for is judged by the checks, not by the wait.
const ready = (page: Page) => expect(page.getByRole("heading").filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

export const appShell: ScreenChecks = {
  ready,
  states: [{ name: "navigation-open", viewport: "phone", reach: openMenu }],
  judgedElsewhere: { 7: axeScan },
  checks: [
    {
      id: "desktop-navigation",
      title: 'At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading',
      covers: [1],
      viewport: "desktop",
      async run(page) {
        const nav = mainNav(page);
        await expect(nav, 'a visible navigation landmark labelled "Main"').toBeVisible();
        for (const [name, hash] of pages) {
          const link = nav.getByRole("link", { name, exact: true });
          await expect(link, `the ${name} link`).toBeVisible();
          await expect(link).toHaveAttribute("href", new RegExp(`${hash.replace(/[#/]/g, "\\$&")}$`));
        }
        await expect(page.getByRole("main"), "one main landmark").toHaveCount(1);
        await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Home", exact: true }), "the main area's level 1 heading names the page").toBeVisible();
      },
    },
    {
      id: "links-mark-current-page",
      title: "Following a link shows its page, marks the link current, and survives a reload",
      covers: [2],
      viewport: "desktop",
      async run(page) {
        const nav = mainNav(page);
        await nav.getByRole("link", { name: "Recipes", exact: true }).click();
        await expect(heading(page, "Recipes")).toBeVisible();
        await expect(nav.getByRole("link", { name: "Recipes", exact: true })).toHaveAttribute("aria-current", "page");
        await expect(nav.getByRole("link", { name: "Home", exact: true })).not.toHaveAttribute("aria-current", "page");
        expect(new URL(page.url()).hash).toBe("#/recipes");
        await page.reload();
        await expect(heading(page, "Recipes"), "the page survives a reload").toBeVisible({ timeout: 10_000 });
      },
    },
    {
      id: "phone-menu",
      title: "At 390px the column is folded behind Open navigation, and choosing a page closes it",
      covers: [3],
      viewport: "phone",
      async run(page) {
        await openMenu(page);
        const settings = anyLink(page, "Settings").filter({ visible: true }).last();
        await settings.click();
        await expect(heading(page, "Settings")).toBeVisible();
        await expect.poll(() => reachable(anyLink(page, "Settings")), { message: "choosing a page closes the navigation" }).toBe(0);
      },
    },
    {
      id: "phone-escape",
      title: "Escape closes the navigation on a phone and focus returns to Open navigation",
      covers: [3],
      viewport: "phone",
      async run(page) {
        await openMenu(page);
        await page.keyboard.press("Escape");
        await expect.poll(() => reachable(anyLink(page, "Settings")), { message: "Escape closes the navigation" }).toBe(0);
        await expectFocusWithin(menuButton(page), "focus returns to Open navigation");
      },
    },
    {
      id: "user-and-sign-out",
      title: "The column shows the user's name and email, and Sign out calls signOut()",
      covers: [4],
      viewport: "desktop",
      async run(page) {
        await expect(page.getByText("Ada Lovelace").filter({ visible: true }).first()).toBeVisible();
        await expect(page.getByText("ada@example.com").filter({ visible: true }).first()).toBeVisible();
        await control(page, /^sign out$/i).click();
        await expect.poll(() => calls(page, "signOut"), { message: "Sign out calls signOut()" }).toHaveLength(1);
      },
    },
    {
      id: "skip-link",
      title: '"Skip to content" is the first Tab stop and moves focus to the main area',
      covers: [5],
      viewport: "desktop",
      async run(page) {
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: /^skip to (main )?content$/i }), "the first Tab stop").toBeFocused();
        await page.keyboard.press("Enter");
        await expectFocusWithin(page.getByRole("main"), "focus moves to the main area");
      },
    },
    fitsPhone(6),
  ],
};
