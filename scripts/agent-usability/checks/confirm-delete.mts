import { expect, type Page } from "@playwright/test";
import { axeScan, calls, control, expectAnnounced, fitsPhone, openDialog, watchBusy, type ScreenChecks } from "./helpers.mts";

const trigger = (page: Page, name: string) => control(page, `Delete ${name}`);

async function open(page: Page, name: string) {
  await trigger(page, name).click();
  await expect(openDialog(page), "the confirmation dialog opens").toBeVisible();
  return openDialog(page);
}

const ready = (page: Page) => expect(trigger(page, "Weeknight dinners")).toBeVisible({ timeout: 10_000 });

export const confirmDelete: ScreenChecks = {
  ready,
  states: [{ name: "dialog-open", reach: (page) => open(page, "Weeknight dinners").then(() => undefined) }],
  judgedElsewhere: { 7: axeScan },
  checks: [
    {
      id: "dialog-names-the-cookbook",
      title: 'Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook',
      covers: [1, 2],
      viewport: "desktop",
      async run(page) {
        await expect(page.getByText(/\b12 recipes\b/).first(), "the recipe count shows").toBeVisible();
        const dialog = await open(page, "Weeknight dinners");
        await expect(dialog).toHaveAccessibleName(/Delete Weeknight dinners\?/);
        await expect(dialog, "the dialog says the recipes stay in the library").toContainText(/library/i);
        await expect(control(dialog, /^cancel$/i)).toBeVisible();
        await expect(control(dialog, /^delete cookbook$/i)).toBeVisible();
      },
    },
    {
      id: "focus-starts-on-cancel",
      title: "Focus starts on Cancel",
      covers: [3],
      viewport: "desktop",
      async run(page) {
        const dialog = await open(page, "Weeknight dinners");
        await expect(control(dialog, /^cancel$/i)).toBeFocused();
      },
    },
    {
      id: "cancel-and-escape-keep-it",
      title: "Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it",
      covers: [3],
      viewport: "desktop",
      async run(page) {
        await open(page, "Weeknight dinners");
        await page.keyboard.press("Escape");
        await expect(openDialog(page), "Escape closes the dialog").toBeHidden();
        await expect(trigger(page, "Weeknight dinners"), "focus returns after Escape").toBeFocused();
        const dialog = await open(page, "Weeknight dinners");
        await control(dialog, /^cancel$/i).click();
        await expect(openDialog(page), "Cancel closes the dialog").toBeHidden();
        await expect(trigger(page, "Weeknight dinners"), "focus returns after Cancel").toBeFocused();
        expect(await calls(page, "deleteCookbook"), "nothing was deleted").toEqual([]);
      },
    },
    {
      id: "deletes-once-and-announces",
      title: "Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it",
      covers: [4],
      viewport: "desktop",
      async run(page) {
        const dialog = await open(page, "Weeknight dinners");
        const confirm = await control(dialog, /^delete cookbook$/i).elementHandle();
        if (!confirm) throw new Error("no Delete cookbook button");
        const busy = await watchBusy(confirm, dialog);
        await confirm.click();
        await busy();
        await confirm.evaluate((button) => (button as HTMLElement).click());
        await expect(openDialog(page), "the dialog closes after the delete").toBeHidden({ timeout: 5000 });
        expect(await calls(page, "deleteCookbook"), "deleteCookbook ran once, for this cookbook").toEqual([["weeknight"]]);
        await expect(page.getByRole("button", { name: "Delete Weeknight dinners" }), "the cookbook left the list").toHaveCount(0);
        await expectAnnounced(page, "Weeknight dinners deleted");
      },
    },
    {
      id: "refusal-stays-in-dialog",
      title: "When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays",
      covers: [5],
      viewport: "desktop",
      async run(page) {
        const dialog = await open(page, "Holiday baking");
        await control(dialog, /^delete cookbook$/i).click();
        await expect(dialog.getByText(/shared with 3 people/), "the server's message shows in the dialog").toBeVisible({ timeout: 5000 });
        await expect(openDialog(page)).toBeVisible();
        await expect(page.getByRole("button", { name: "Delete Holiday baking", includeHidden: true })).toHaveCount(1);
      },
    },
    fitsPhone(6),
  ],
};
