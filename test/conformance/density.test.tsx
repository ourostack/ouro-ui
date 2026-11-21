import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupStories, closeOverlay, openOverlay, overlayOpeners, renderStory, settle } from "../stories.tsx";
import { brokenFor, conformanceStories, describeElement, layOut } from "./harness.ts";
import type { StoryEntry } from "../stories.tsx";

// Density. An app sets its density with `--spacing`, and Ouro's fixed sizes (an icon, a thumb, a
// swatch) do not follow it: they are `size-ouro-*`, which read `--ouro-size-*`. Every story renders at
// Tailwind's `--spacing` and at a compact one, closed and with each overlay open, and each icon in an
// Ouro root keeps its rendered size; at a compact `--spacing` (0.15rem, 40% under the default), a control with an icon whose height follows `--spacing`, on a fine
// pointer is at least the icon and 4px tall, so the icon never touches its edges.
// scripts/source-rules.mjs (`numericSizes`) bans the spacing-step size classes in the source.

const roots = "[data-ouro]";

function visibleIcons(): SVGElement[] {
  return Array.from(document.querySelectorAll<SVGElement>(`${roots} svg`)).filter((svg) => {
    const box = svg.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.width <= 64 && !svg.hasAttribute("aria-label") && svg.checkVisibility({ visibilityProperty: true });
  });
}

function sizes(): string[] {
  return visibleIcons().map((svg) => {
    return `${describeElement(svg)} ${svg.clientWidth}x${svg.clientHeight}`;
  });
}

/** The icons whose size changed between two reads of the same page, by position. */
export function resized(before: string[], after: string[]): string[] {
  if (before.length !== after.length) return [];
  return before.flatMap((line, index) => (line === after[index] ? [] : [`${line} became ${after[index]!.slice(after[index]!.lastIndexOf(" ") + 1)}`]));
}

function controlsWithIcons(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-ouro-control]")).filter(
    (control) => control.getBoundingClientRect().height > 0 && control.checkVisibility({ visibilityProperty: true }) && control.querySelector("svg") !== null,
  );
}

/** The height of each control with an icon, in document order. */
function heights(): number[] {
  return controlsWithIcons().map((control) => control.getBoundingClientRect().height);
}

/**
 * The controls with an icon whose height follows `--spacing` and, when compact, is less than 4px more than the icon: a
 * control at a fixed size (a checkbox's box) is the design's, not a floor that went missing.
 */
export function crowded(before: number[]): string[] {
  const controls = controlsWithIcons();
  if (controls.length !== before.length) return [];
  return controls.flatMap((control, index) => {
    const height = control.getBoundingClientRect().height;
    const tallest = Math.max(0, ...Array.from(control.querySelectorAll<SVGElement>("svg")).map((svg) => svg.clientHeight));
    return height < before[index]! - 0.5 && height < tallest + 4 - 0.5 ? [`${describeElement(control)} is ${height.toFixed(1)}px tall around a ${tallest.toFixed(1)}px icon`] : [];
  });
}

function setSpacing(value: string | null) {
  if (value === null) document.documentElement.style.removeProperty("--spacing");
  else document.documentElement.style.setProperty("--spacing", value);
}

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  setSpacing(null);
  await cleanupStories();
});

/** What the check finds for one story: closed, and with each overlay open. */
async function densityProblems({ id, Story, parameters }: StoryEntry): Promise<string[]> {
  const host = await renderStory(Story);
  layOut(host, parameters);
  await settle();
  const found: string[] = [];
  const read = async (where: string) => {
    setSpacing(null);
    const before = sizes();
    const controlHeights = heights();
    setSpacing("0.2rem");
    await settle();
    found.push(...resized(before, sizes()).map((line) => `${where}: ${line}`));
    setSpacing("0.15rem");
    await settle();
    found.push(...crowded(controlHeights).map((line) => `${where}: ${line}`));
    setSpacing(null);
    await settle();
  };
  await read("closed");
  for (const opener of overlayOpeners(id, host, parameters)) {
    await openOverlay(opener);
    await read(`with "${opener.name}" open`);
    await closeOverlay();
  }
  return found;
}

describe("density", () => {
  beforeEach(async () => {
    await page.viewport(1280, 800);
  });

  it.each(conformanceStories)("$id keeps its icons' sizes at a compact --spacing, and a control a little taller than its icon", async (entry) => {
    expect((await densityProblems(entry)).join("\n")).toBe("");
  });
});

describe("density proves it can fail", () => {
  beforeEach(async () => {
    await page.viewport(1280, 800);
  });

  it.each(brokenFor({ SpacingSizedIcon: "became" }))("on $id", async (entry) => {
    expect((await densityProblems(entry)).join("\n")).toContain(entry.expected);
  });
});
