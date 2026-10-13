import { expect, type Page } from "@playwright/test";
import { axeScan, calls, control, expectAnnounced, expectInvalidWith, field, fitsPhone, watchBusy, type ScreenChecks } from "./helpers.mts";

const taken = "That email is already used by another account.";
const save = (page: Page) => control(page, /^save changes$/i);

async function saveAndWait(page: Page) {
  const before = (await calls(page, "saveSettings")).length;
  await save(page).click();
  await expect.poll(async () => (await calls(page, "saveSettings")).length, { message: "Save changes sends the form" }).toBe(before + 1);
}

/** Fails unless the message sits under the field: below its top edge and within 120px of its bottom. */
async function expectUnder(page: Page, label: string, message: string) {
  const control = await field(page, label).boundingBox();
  const text = await page.getByText(message).filter({ visible: true }).first().boundingBox();
  if (!control || !text) throw new Error(`"${message}" or the ${label} field has no box`);
  expect(text.y, `"${message}" is under the ${label} field`).toBeGreaterThanOrEqual(control.y + control.height / 2);
  expect(text.y, `"${message}" is close to the ${label} field`).toBeLessThanOrEqual(control.y + control.height + 120);
}

const ready = (page: Page) => expect(field(page, "Display name")).toHaveValue("Ada Lovelace", { timeout: 10_000 });

export const settingsForm: ScreenChecks = {
  ready,
  states: [
    {
      name: "server-errors",
      async reach(page) {
        await field(page, "Email").fill("taken@example.com");
        await field(page, "Username").fill("Ada L");
        await saveAndWait(page);
        await expect(page.getByText(taken).first()).toBeVisible();
      },
    },
  ],
  judgedElsewhere: { 7: axeScan },
  checks: [
    {
      id: "fields-labelled-in-order",
      title: "The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint",
      covers: [1],
      viewport: "desktop",
      async run(page) {
        const labels = ["Display name", "Email", "Username", "Bio", "Time zone", "Email me product news"];
        for (const label of labels) await expect(field(page, label), `a field labelled "${label}"`).toBeVisible();
        const order = await Promise.all(labels.map((label) => field(page, label).elementHandle()));
        const inOrder = await page.evaluate(
          (elements) => elements.every((element, index) => index === 0 || Boolean(elements[index - 1]!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)),
          order,
        );
        expect(inOrder, "the fields come in the order the task gives").toBe(true);
        await expect(field(page, "Email")).toHaveValue("ada@example.com");
        await expect(field(page, "Username")).toHaveValue("ada");
        await expect(field(page, "Bio")).toHaveValue("Cooks for a crowd on Sundays.");
        await expect(field(page, "Email me product news")).toBeChecked();
        const zone = await field(page, "Time zone").evaluate((element) => `${(element as HTMLSelectElement).value ?? ""} ${element.textContent ?? ""}`);
        expect(zone, "Time zone shows the saved zone").toMatch(/London/);
        await expect(page.getByText("Up to 160 characters.").first(), "Bio's hint").toBeVisible();
      },
    },
    {
      id: "saves-once",
      title: "While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter",
      covers: [2],
      viewport: "desktop",
      async run(page) {
        await field(page, "Email").fill("ada@example.org");
        const button = await save(page).elementHandle();
        if (!button) throw new Error("no Save changes button");
        const busy = await watchBusy(button);
        await button.click();
        await busy();
        await button.evaluate((element) => (element as HTMLElement).click());
        await field(page, "Display name").press("Enter");
        await expect(page.getByText("Settings saved").first()).toBeVisible({ timeout: 5000 });
        expect(await calls(page, "saveSettings"), "saveSettings ran once").toHaveLength(1);
      },
    },
    {
      id: "server-error-on-its-field",
      title: "A server error shows under its field, marks it invalid, is read with it, and focus moves there",
      covers: [3],
      viewport: "desktop",
      async run(page) {
        await field(page, "Email").fill("taken@example.com");
        await saveAndWait(page);
        await expect(page.getByText(taken).first()).toBeVisible();
        await expectInvalidWith(field(page, "Email"), /already used by another account/);
        await expect(field(page, "Email")).toBeFocused();
        await expectUnder(page, "Email", taken);
      },
    },
    {
      id: "focus-on-first-error",
      title: "With two errors, each shows on its field and focus moves to the first",
      covers: [3],
      viewport: "desktop",
      async run(page) {
        await field(page, "Username").fill("Ada L");
        await field(page, "Email").fill("taken@example.com");
        await saveAndWait(page);
        await expectInvalidWith(field(page, "Username"), /3 to 20 lowercase/);
        await expectInvalidWith(field(page, "Email"), /already used by another account/);
        await expect(field(page, "Email"), "focus is on Email, the first field with an error").toBeFocused();
        await expectUnder(page, "Username", "Use 3 to 20 lowercase letters, numbers or dashes.");
      },
    },
    {
      id: "fixed-errors-clear",
      title: "Correcting the field and saving again clears its error",
      covers: [4],
      viewport: "desktop",
      async run(page) {
        await field(page, "Email").fill("taken@example.com");
        await saveAndWait(page);
        await expect(page.getByText(taken).first()).toBeVisible();
        await field(page, "Email").fill("ada@example.net");
        await saveAndWait(page);
        await expect(page.getByText("Settings saved").first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(taken).filter({ visible: true })).toHaveCount(0);
        await expect(field(page, "Email")).not.toHaveAttribute("aria-invalid", "true");
      },
    },
    {
      id: "announces-saved",
      title: '"Settings saved" appears in a live region after a successful save',
      covers: [5],
      viewport: "desktop",
      async run(page) {
        await field(page, "Bio").fill("Bakes bread on Saturdays.");
        await saveAndWait(page);
        await expect(page.getByText("Settings saved").first()).toBeVisible({ timeout: 5000 });
        await expectAnnounced(page, "Settings saved");
      },
    },
    fitsPhone(6),
  ],
};
