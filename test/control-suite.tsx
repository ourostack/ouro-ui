import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import matrix from "./generated/control-matrix.json";
import { collectControls, controlRole } from "./controls.ts";
import { cleanupStories, openOverlay, openPopup, overlayOpeners, renderStory, settle, stories, story } from "./stories.tsx";

// The control marker checks test/controls.test.tsx runs in Chromium and WebKit and
// test/controls.touch.test.tsx runs on a touch phone: every element a person can focus or operate
// in a story carries `data-ouro-control` (the registry item that rendered it) and
// `data-ouro-part` (which of that item's parts it is), and every part an item declares in its
// component.json `controls` is found by that identity. The rows come from
// test/generated/control-matrix.json (`pnpm controls:matrix`), so the browser never reads the
// manifests itself.

export interface ControlRow {
  item: string;
  stem: string;
  mode: string;
  part: string;
  role: string;
  portal: boolean;
  /** Whether only a coarse pointer reaches the part (Combobox's sheet), so the touch project checks it. */
  touch: boolean;
  stories: string[];
}

export const rows = matrix as ControlRow[];

/** The parts each item declares, by item name. */
const declared = new Map<string, Set<string>>();
for (const row of rows) declared.set(row.item, (declared.get(row.item) ?? new Set()).add(row.part));

/** A page size to render at, or `undefined` to keep the project's own (the touch phone's). */
export type Size = { width: number; height: number } | undefined;

/** The start of an element's markup, enough to find it in the story. */
const snippet = (element: Element) => element.outerHTML.slice(0, 120);

/** The controls in the page that lack a known item name or a part their item declares, described with the state they were found in. */
function unmarked(state: string): string[] {
  return collectControls()
    .filter((element) => {
      const item = element.getAttribute("data-ouro-control");
      const part = element.getAttribute("data-ouro-part");
      return item === null || part === null || !declared.get(item)?.has(part);
    })
    .map((element) => `${state}: ${snippet(element)}`);
}

/** Component roots a story's harness wraps: the harness may hold only the story's own controls. */
function harnessedRoots(host: HTMLElement): string[] {
  const found = [...document.querySelectorAll("[data-ouro]")].filter((element) => element.closest("[data-test-harness]")).map(snippet);
  if (host.closest("[data-test-harness]")) found.push(`the story host: ${snippet(host)}`);
  return found;
}

/** Closes every open overlay with Escape, a level at a time, and waits for the page to settle. */
async function closeAll(): Promise<void> {
  for (let level = 0; level < 4 && openPopup(); level++) {
    await userEvent.keyboard("{Escape}");
    await settle();
  }
  expect(openPopup(), "Escape left an overlay open").toBeNull();
}

/**
 * Shows the story's states one at a time and calls `visit` in each until it returns true: closed,
 * with each overlay open, and with each overlay that one opens (a submenu, a Select in a Dialog).
 * Returns whether a visit returned true.
 */
async function visitStates(id: string, host: HTMLElement, visit: (state: string) => boolean): Promise<boolean> {
  if (visit("closed")) return true;
  const top = overlayOpeners(id, host);
  for (let index = 0; index < top.length; index++) {
    const opener = overlayOpeners(id, host)[index]!;
    const popup = await openOverlay(opener);
    if (visit(`with "${opener.name}" open`)) return closeAll().then(() => true);
    const nested = overlayOpeners(id, [popup], {}, false).length;
    for (let inner = 0; inner < nested; inner++) {
      if (inner > 0) await openOverlay(overlayOpeners(id, host)[index]!);
      const second = overlayOpeners(id, [openPopup()!], {}, false)[inner];
      if (!second) continue;
      await second.open();
      await settle();
      const hit = visit(`with "${opener.name}", then "${second.name}" open`);
      await closeAll();
      if (hit) return true;
    }
    await closeAll();
  }
  return false;
}

/** Each row's part, found by its marker and role over the whole page, in the row's stories, at each size. */
export function describeRows(title: string, selected: ControlRow[], sizes: Size[]): void {
  describe(title, () => {
    it("has rows", () => {
      expect(selected.length).toBeGreaterThan(0);
    });

    // A row may look through many stories and their overlays before it finds its part, hence the longer timeout.
    it.each(selected)("$item $stem $mode $part is marked", async (row) => {
      const locator = `[data-ouro-control="${row.item}"][data-ouro-part="${row.part}"]`;
      const misplaced: string[] = [];
      /** Whether the part is in the page with its role, inside the story host or, for a portaled part, outside it. */
      const found = (host: HTMLElement) =>
        [...document.querySelectorAll(locator)].some((element) => {
          if (controlRole(element) !== row.role) return false;
          if (host.contains(element) === row.portal) {
            misplaced.push(`${row.portal ? "inside" : "outside"} the story host, but portal is ${row.portal}: ${snippet(element)}`);
            return false;
          }
          return true;
        });
      // Every story closed first, the cheap look, then each with its overlays open.
      for (const opening of [false, true]) {
        for (const size of sizes) {
          if (size) await page.viewport(size.width, size.height);
          for (const id of row.stories) {
            const host = await renderStory(story(id));
            await settle();
            if (opening ? await visitStates(id, host, () => found(host)) : found(host)) return;
            await cleanupStories();
          }
        }
      }
      expect.fail(`no element in ${row.stories.join(", ")} matches ${locator} with role "${row.role}"${misplaced.length ? `\n${misplaced.join("\n")}` : ""}`);
    }, 60_000);
  });
}

/** Every story, closed and with each overlay open, at each size: no unmarked control, and no component inside a harness. */
export function describeStories(title: (size: Size) => string, sizes: Size[]): void {
  for (const size of sizes) {
    describe(title(size), () => {
      it.each(stories)("$id leaves no control unmarked", async ({ id, Story }) => {
        if (size) await page.viewport(size.width, size.height);
        const host = await renderStory(Story);
        await settle();
        const found: string[] = [];
        const harnessed: string[] = [];
        await visitStates(id, host, (state) => {
          found.push(...unmarked(state));
          harnessed.push(...harnessedRoots(host));
          return false;
        });
        expect(found.join("\n")).toBe("");
        expect(harnessed.join("\n"), "a [data-test-harness] element holds a component").toBe("");
      });
    });
  }
}
