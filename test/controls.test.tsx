import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import matrix from "./generated/control-matrix.json";
import { collectControls, controlRole, interactiveSelector } from "./controls.ts";
import { cleanupStories, closeOverlay, openOverlay, overlayOpeners, renderStory, settle, stories, story } from "./stories.tsx";

// Every element a person can focus or operate in a story carries `data-ouro-control` (the
// registry item that rendered it) and `data-ouro-part` (which of that item's parts it is), and
// every part an item declares in its component.json `controls` is found by that identity.
// The rows come from test/generated/control-matrix.json (`pnpm controls:matrix`), so this test
// never reads the manifests itself.

interface ControlRow {
  item: string;
  stem: string;
  mode: string;
  part: string;
  role: string;
  portal: boolean;
  stories: string[];
}

const rows = matrix as ControlRow[];

/** The parts each item declares, by item name. */
const declared = new Map<string, Set<string>>();
for (const row of rows) declared.set(row.item, (declared.get(row.item) ?? new Set()).add(row.part));

/** The widths the stories render at: a desktop, and a phone, where some controls move into sheets. */
const widths = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

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

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupStories();
});

describe("finding controls", () => {
  it("collects every control outside the harness, leaving out what Base UI renders on its own", async () => {
    const host = await renderStory(() => (
      <div>
        <button type="button">Inside</button>
        <a href="#here">Link</a>
        <input type="hidden" name="secret" />
        <div tabIndex={-1}>Not in the tab order</div>
        <span tabIndex={0} data-base-ui-focus-guard="" aria-hidden="true" />
        <span role="button" aria-label="Dismiss" />
        <div data-test-harness="">
          <button type="button">Harness</button>
        </div>
      </div>
    ));
    expect(collectControls(host).map((element) => element.textContent)).toEqual(["Inside", "Link"]);
    expect(collectControls().map((element) => element.textContent)).toEqual(["Inside", "Link"]);
    expect(interactiveSelector).toContain('[role="option"]');
  });

  it("names each control's role, explicit or implied by its element", async () => {
    const host = await renderStory(() => (
      <div>
        <a href="#a">a</a>
        <button type="button">b</button>
        <input aria-label="text" />
        <input aria-label="search" type="search" />
        <input aria-label="listed" list="choices" />
        <input aria-label="check" type="checkbox" />
        <input aria-label="radio" type="radio" />
        <input aria-label="range" type="range" />
        <input aria-label="number" type="number" />
        <input aria-label="file" type="file" />
        <input aria-label="submit" type="submit" />
        <input aria-label="color" type="color" />
        <select aria-label="one">
          <option>x</option>
        </select>
        <select aria-label="many" multiple>
          <option>x</option>
        </select>
        <textarea aria-label="area" />
        <div contentEditable suppressContentEditableWarning aria-label="editor" />
        <div tabIndex={0}>scroller</div>
        <div role="treeitem group" tabIndex={0} aria-selected="false">first role wins</div>
      </div>
    ));
    expect([...host.querySelectorAll(interactiveSelector)].map(controlRole)).toEqual([
      "link",
      "button",
      "textbox",
      "searchbox",
      "combobox",
      "checkbox",
      "radio",
      "slider",
      "spinbutton",
      "button",
      "button",
      "textbox",
      "combobox",
      "listbox",
      "textbox",
      "textbox",
      "generic",
      "treeitem",
    ]);
  });
});

describe("every declared part is marked", () => {
  it("has rows", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows)("$item $stem $mode $part is marked", async (row) => {
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
    for (const { width, height } of widths) {
      await page.viewport(width, height);
      for (const id of row.stories) {
        const host = await renderStory(story(id));
        await settle();
        if (found(host)) return;
        if (row.portal) {
          for (const opener of overlayOpeners(id, host)) {
            await openOverlay(opener);
            const hit = found(host);
            await closeOverlay();
            if (hit) return;
          }
        }
        await cleanupStories();
      }
    }
    expect.fail(`no element in ${row.stories.join(", ")} matches ${locator} with role "${row.role}"${misplaced.length ? `\n${misplaced.join("\n")}` : ""}`);
  });
});

describe.each(widths)("no control is left unmarked at $width px", ({ width, height }) => {
  it.each(stories)("$id leaves no control unmarked", async ({ id, Story }) => {
    await page.viewport(width, height);
    const host = await renderStory(Story);
    await settle();
    const found = unmarked("closed");
    const harnessed = harnessedRoots(host);
    for (const opener of overlayOpeners(id, host)) {
      await openOverlay(opener);
      found.push(...unmarked(`with "${opener.name}" open`));
      harnessed.push(...harnessedRoots(host));
      await closeOverlay();
    }
    expect(found.join("\n")).toBe("");
    expect(harnessed.join("\n"), "a [data-test-harness] element holds a component").toBe("");
  });
});
