import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { demos } from "../site/src/docs/demos.tsx";
import "../site/src/styles.css";
import { cleanupStories, closeOverlay, openOverlay, overlayOpeners, renderStory, settle, stories } from "./stories.tsx";

// Runs in the `touch` project: Chromium as a phone with a coarse pointer. iOS Safari zooms the
// page when a text control under 16px takes focus, and does not zoom back; Chromium's emulation
// does not reproduce it, so this reads the computed font size of every text-entry control in
// every story (closed and with each overlay open) and every docs demo, in portrait and in
// landscape, where `sm` applies but the pointer is still coarse.

/** Text-entry controls: what iOS zooms into on focus. */
const textEntry =
  'input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="button"], [type="submit"], [type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Stories and demos that fail today, by id, with the component that needs the fix. */
const knownViolations: Record<string, string> = {};

const fix = "Fix: give the control `text-base` on coarse pointers, as TextField does (`text-base sm:pointer-fine:text-sm`).";

/** A control a person can focus: rendered, not hidden from assistive technology, larger than a visually hidden 1px box. */
function focusable(control: HTMLElement): boolean {
  if (control.closest('[aria-hidden="true"], [inert]')) return false;
  const box = control.getBoundingClientRect();
  return box.width > 1 && box.height > 1;
}

/** `input[type=email] "Email"`: the control, as a failure names it. */
function describeControl(control: HTMLElement): string {
  const tag = control.tagName.toLowerCase();
  const type = tag === "input" ? `[type=${(control as HTMLInputElement).type}]` : control.isContentEditable && tag !== "textarea" ? "[contenteditable]" : "";
  const name = control.getAttribute("aria-label") ?? control.getAttribute("placeholder") ?? (control as HTMLInputElement).labels?.[0]?.textContent ?? control.getAttribute("name") ?? "";
  return `${tag}${type}${name ? ` "${name.trim()}"` : ""}`;
}

/** Every focusable text-entry control in the document under 16px, as failure lines. */
function smallControls(where: string): string[] {
  return [...document.querySelectorAll<HTMLElement>(textEntry)]
    .filter(focusable)
    .flatMap((control) => {
      const size = getComputedStyle(control).fontSize;
      return parseFloat(size) < 16 ? [`${where}: ${describeControl(control)} is ${size}, under 16px, so iOS Safari zooms on focus. ${fix}`] : [];
    });
}

const subjects: Array<{ id: string; Subject: ComponentType }> = [
  ...stories.map(({ id, Story }) => ({ id, Subject: Story })),
  ...Object.entries(demos).map(([name, Demo]) => ({ id: `demo/${name}`, Subject: Demo })),
];

afterEach(async () => {
  await cleanupStories();
  await page.viewport(390, 844);
});

it("finds text-entry controls in the TextField stories and demo", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  for (const id of ["TextField/Playground", "demo/text-field"]) {
    const subject = subjects.find((entry) => entry.id === id);
    expect(subject, id).toBeDefined();
    await renderStory(subject!.Subject);
    expect(document.querySelectorAll(textEntry).length, id).toBeGreaterThan(0);
    await cleanupStories();
  }
});

describe.each([
  { orientation: "portrait", width: 390, height: 844 },
  { orientation: "landscape", width: 844, height: 390 },
])("$orientation ($width x $height)", ({ width, height }) => {
  for (const { id, Subject } of subjects) {
    const test = id in knownViolations ? it.fails : it;
    test(`${id} has no text-entry control under 16px`, async () => {
      await page.viewport(width, height);
      expect(matchMedia("(pointer: coarse)").matches).toBe(true);
      const host = await renderStory(Subject);
      await settle();
      const found = smallControls(id);
      // Demos name no plain openers, so only their Base UI triggers open.
      for (const opener of id.startsWith("demo/") ? [...host.querySelectorAll<HTMLElement>("[aria-haspopup]")] : overlayOpeners(id, host)) {
        await openOverlay(opener);
        found.push(...smallControls(`${id} with "${opener.textContent}" open`));
        await closeOverlay();
      }
      expect(found.join("\n")).toBe("");
    });
  }
});
