import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { describeRows, describeStories, rows } from "./control-suite.tsx";
import { censusExclusions, collectControls, controlRole, interactiveSelector } from "./controls.ts";
import { cleanupStories, renderStory } from "./stories.tsx";

// The control marker checks (test/control-suite.tsx) at a desktop width and a phone width, where
// some controls move into sheets; test/controls.touch.test.tsx runs them on a touch phone.

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupStories();
});

const sizes = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

describe("finding controls", () => {
  it("collects every control outside the harness, leaving out only Base UI's focus guards", async () => {
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
    // A screen reader's Dismiss button, such as the one Base UI adds to a combobox, is a control:
    // only Base UI's focus guards (censusExclusions) are left out.
    expect(collectControls(host).map((element) => element.textContent || element.getAttribute("aria-label"))).toEqual(["Inside", "Link", "Dismiss"]);
    expect(collectControls().map((element) => element.textContent || element.getAttribute("aria-label"))).toEqual(["Inside", "Link", "Dismiss"]);
    expect(censusExclusions).toEqual(["[data-base-ui-focus-guard]"]);
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

describeRows(
  "every declared part is marked",
  rows.filter((row) => !row.touch),
  sizes,
);
describeStories((size) => `no control is left unmarked at ${size!.width} px`, sizes);
