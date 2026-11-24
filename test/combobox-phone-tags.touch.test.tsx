import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanupStories, renderStory, story } from "./stories.tsx";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer, where a
// Combobox with `multiple` shows its picks as chips beside the field's button.

afterEach(async () => {
  await cleanupStories();
});

it("draws the Combobox/PhoneTags story's field with its four chips on two rows", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  await renderStory(story("Combobox/PhoneTags"));
  const field = document.querySelector<HTMLElement>("[data-ouro-combobox-field]")!;
  const chips = [...field.querySelectorAll("[data-ouro-combobox-chip]")];
  expect(chips.map((chip) => chip.querySelector("span")!.textContent)).toEqual(["Weeknight", "Quick lunch", "Vegan", "One pot"]);
  expect(new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size).toBe(2);
  const shot = new Image();
  shot.src = `data:image/png;base64,${await page.screenshot({ save: false, element: field, animations: "disabled" })}`;
  await shot.decode();
  expect(shot.naturalHeight).toBeGreaterThan(shot.naturalWidth / 8);
});

it("starts the Combobox/PhoneCapsules story's chips past each capsule's curved end", async () => {
  await renderStory(story("Combobox/PhoneCapsules"));
  const fields = [...document.querySelectorAll<HTMLElement>("[data-ouro-combobox-field]")];
  expect(fields.map((field) => field.querySelectorAll("[data-ouro-combobox-chip]").length)).toEqual([1, 4]);
  for (const field of fields) {
    const box = field.getBoundingClientRect();
    const radius = Number.parseFloat(getComputedStyle(field.querySelector("[data-ouro-combobox-trigger]")!).borderTopLeftRadius);
    expect(radius).toBe(22);
    for (const chip of field.querySelectorAll("[data-ouro-combobox-chip]")) expect(chip.getBoundingClientRect().left - box.left).toBeGreaterThanOrEqual(radius - 0.05);
  }
  const shot = new Image();
  shot.src = `data:image/png;base64,${await page.screenshot({ save: false, element: document.querySelector<HTMLElement>("[data-ouro-capsules]")!, animations: "disabled" })}`;
  await shot.decode();
  expect(shot.naturalHeight).toBeGreaterThan(100);
});
