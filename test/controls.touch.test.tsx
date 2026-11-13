import { afterEach, beforeEach, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { describeRows, describeStories, rows } from "./control-suite.tsx";
import { cleanupStories, openOverlay, overlayOpeners, renderStory, settle, story } from "./stories.tsx";
import { storyScanTimeout } from "./story-axe.ts";

// The control marker checks (test/control-suite.tsx) on a touch phone, where a coarse pointer
// reaches controls a mouse never sees (Combobox's sheet, with its trigger and Done button).

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupStories();
});

it("clicks a clipped message action without losing the intended row", async () => {
  await renderStory(() => (
    <button type="button" aria-label="Previous story" style={{ position: "fixed", left: 0, top: 0, width: 66, height: 44 }}>
      Previous
    </button>
  ));
  await userEvent.hover(page.getByRole("button", { name: "Previous story" }));
  await userEvent.keyboard("{Shift}");
  await cleanupStories();
  const host = await renderStory(story("Message/Chat"));
  await settle();
  const row = host.querySelector<HTMLElement>('[data-ouro="message"]')!;
  const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  await userEvent.hover(row.querySelector<HTMLElement>("[data-ouro-message-content]")!);
  await expect.poll(() => row.querySelector('button[aria-label="More actions"]')).not.toBeNull();
  await settle();
  const opener = overlayOpeners("Message/Chat", host).find((candidate) => candidate.name === "More actions");
  expect(opener?.element?.closest('[data-ouro="message"]')).toBe(row);
  const trigger = opener!.element!;
  expect(trigger.getBoundingClientRect().top).toBeLessThan(scroller.getBoundingClientRect().top);
  const presses: { target: Element | null; row: Element | null; trusted: boolean }[] = [];
  const pressed = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    presses.push({ target, row: target?.closest('[data-ouro="message"]') ?? null, trusted: event.isTrusted });
  };
  host.addEventListener("pointerdown", pressed, true);
  try {
    const popup = await openOverlay(opener!);
    expect(popup.getAttribute("aria-label")).toBe("Message actions for Mara Quill");
    expect(presses).toEqual([{ target: trigger, row, trusted: true }]);
  } finally {
    host.removeEventListener("pointerdown", pressed, true);
  }
}, storyScanTimeout);

describeRows(
  "every declared part is marked on a touch phone",
  rows.filter((row) => row.touch),
  [undefined],
);
describeStories(() => "no control is left unmarked on a touch phone", [undefined]);
