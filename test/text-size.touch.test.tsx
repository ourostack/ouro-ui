import { useEffect, useState, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";
import siteCss from "../site/src/styles.css?inline";
import { accessibleName, cleanupStories, isVisible, overlayOpeners, renderStory, settle, stories, type Opener, type OuroStoryParameters } from "./stories.tsx";

// Runs in the `touch` project: Chromium as a phone with a coarse pointer. iOS Safari zooms the
// page when a text control under 16px takes focus, and does not zoom back; Chromium's emulation
// does not reproduce it, so this reads the computed font size of every text-entry control in
// every story and every docs demo, in portrait and in landscape (where `sm` applies but the
// pointer is still coarse).
//
// Each subject is scanned closed, then with each overlay open, recursively to `maxDepth`, through
// the openers the story tests use (`overlayOpeners` in test/stories.tsx): every `aria-haspopup`
// trigger (dialog, listbox, menu and the rest), every button a story names in
// `parameters.plainOpeners`, and the keys a story names in `parameters.openShortcut`. An opener
// deeper than `maxDepth` fails the test. Each overlay path renders the subject afresh. Stories render with app.css only, as an installed app does; demos
// also get the site's stylesheet, as the docs site renders them.
//
// Out of scope: controls that appear only after typing, after stepping through a flow (a wizard's
// next step, a submitted form) or after any interaction other than opening an overlay.
//
// The scan runs with every CSS transition and animation at zero length. Motion never changes a
// control's font size, only how long an overlay takes to reach its open or closed state, and
// waiting it out cost most of the file's time: below 640px a Menu is a bottom sheet that takes
// 500ms to rise and 200ms to fall, so a story with ten row menus (Reorderable/ScrollsInPlace)
// spent over 7s of a 15s limit on motion in portrait and under 1s in landscape.

/** Text-entry controls: what iOS zooms into on focus. */
const textEntry =
  "input:not(" +
  ["checkbox", "radio", "range", "color", "file", "button", "submit", "reset", "image", "hidden"].map((type) => `[type="${type}"]`).join(", ") +
  '), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

/** Elements an opener opens. */
const popupSelector = '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [role="tree"], [role="grid"]';

/** How many overlays deep the scan opens (an overlay inside an overlay inside an overlay). */
const maxDepth = 3;

/** Turns off CSS motion while a subject is scanned; see the comment at the top. */
const noMotion =
  "*, *::before, *::after, ::backdrop { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }";

/** How long an opener has to show its popup, on a loaded CI runner. */
const openTimeout = 10_000;

/** Stories and demos that fail today, by id, with the component that needs the fix. */
const knownViolations: Record<string, string> = {};

const fix = "Fix: give the control a 16px font on coarse pointers (for example `text-base sm:pointer-fine:text-sm`).";

/** `input[type=email] "Email"`: the control, as a failure names it. */
function describeControl(control: HTMLElement): string {
  const tag = control.tagName.toLowerCase();
  const kind =
    tag === "input"
      ? `[type=${(control as HTMLInputElement).type}]`
      : control.getAttribute("role") === "textbox" && tag !== "textarea"
        ? "[role=textbox]"
        : control.isContentEditable && tag !== "textarea"
          ? "[contenteditable]"
          : "";
  const name = accessibleName(control);
  return `${tag}${kind}${name ? ` "${name}"` : ""}`;
}

/** Whether a tap cannot land on the control: no pointer events, transparent, or a box of 1px or less. */
function untappable(control: HTMLElement): boolean {
  const style = getComputedStyle(control);
  const box = control.getBoundingClientRect();
  return style.pointerEvents === "none" || parseFloat(style.opacity) === 0 || (box.width <= 1 && box.height <= 1);
}

/** Every text-entry control under the roots that is under 16px, or focusable inside `aria-hidden`, as failure lines. */
function smallControls(where: string, roots: ParentNode[] = [document]): string[] {
  const controls = new Set(roots.flatMap((root) => [...root.querySelectorAll<HTMLElement>(textEntry)]));
  return [...controls].flatMap((control) => {
    // Not rendered, not visible, or not reachable at all.
    if (control.closest("[inert]") || !isVisible(control)) return [];
    if (control.closest('[aria-hidden="true"]')) {
      if (control.tabIndex >= 0) {
        return [
          `${where}: ${describeControl(control)} is focusable inside aria-hidden, an accessibility bug: a person can focus it but a screen reader skips it. Fix: remove aria-hidden, or take the control out of the tab order.`,
        ];
      }
      // Base UI's hidden form input (visuallyHiddenInput): aria-hidden, out of the tab order and
      // a 1px clipped box, so neither Tab nor a tap focuses it. A visible one still takes a tap.
      if (untappable(control)) return [];
    }
    const size = getComputedStyle(control).fontSize;
    return parseFloat(size) < 16 ? [`${where}: ${describeControl(control)} is ${size}, under 16px, so iOS Safari zooms on focus. ${fix}`] : [];
  });
}

interface Subject {
  id: string;
  Subject: ComponentType;
  parameters: OuroStoryParameters;
  demo: boolean;
}

/** Every docs demo: site/src/docs/demos/**\/<name>.demo.tsx, by name. */
const demoModules = import.meta.glob<{ default: ComponentType }>("../site/src/docs/demos/**/*.demo.tsx", { eager: true });

const storySubjects: Subject[] = stories.map(({ id, Story, parameters }) => ({ id, Subject: Story, parameters, demo: false }));
const demoSubjects: Subject[] = Object.entries(demoModules).map(([path, module]) => ({
  id: `demo/${path.replace(/^.*\/demos\/(.+)\.demo\.tsx$/, "$1")}`,
  Subject: module.default,
  parameters: {},
  demo: true,
}));
const subjects = [...storySubjects, ...demoSubjects];

const visiblePopups = () => [...document.querySelectorAll<HTMLElement>(popupSelector)].filter(isVisible);

/** Opens an overlay and returns the popups it added. */
async function openVia(opener: Opener, where: string, timeout: number): Promise<HTMLElement[]> {
  const before = new Set(visiblePopups());
  await opener.open();
  let added: HTMLElement[] = [];
  await vi.waitFor(
    () => {
      added = visiblePopups().filter((popup) => !before.has(popup));
      if (added.length === 0) throw new Error(`${where}: opening "${opener.name}" showed no dialog, listbox or menu`);
    },
    { timeout, interval: 20 },
  );
  await settle();
  // A popup that opened inside another one (a listbox in a dialog) is scanned with its parent.
  return added.filter((popup) => !added.some((other) => other !== popup && other.contains(popup)));
}

/**
 * Closes the overlays the scan opened with Escape, so the subject unmounts the way a person
 * leaves it. Popups the subject shows on its own (a story's toasts) stay.
 */
async function closeAll(where: string, opened: HTMLElement[]): Promise<void> {
  const stillOpen = () => opened.filter((popup) => popup.isConnected && isVisible(popup)).length;
  for (let round = 0; round < maxDepth + 2 && stillOpen() > 0; round++) {
    const open = stillOpen();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(
      () => {
        if (stillOpen() >= open) throw new Error(`${where}: Escape did not close the overlay`);
      },
      { timeout: 10_000, interval: 20 },
    );
  }
  await settle();
}

/**
 * Renders the subject, opens the overlays along `path` (an opener index per level) and scans what
 * the last one showed: the whole page at the top, the new popups below it. Then does the same for
 * each opener in what it showed, `depth` levels deep, and fails on an opener below that.
 * `openTimeout` is how long an opener has to show its popup.
 */
async function scan(subject: Subject, path: number[] = [], depth = maxDepth, options: { openTimeout?: number } = {}): Promise<string[]> {
  const style = subject.demo ? Object.assign(document.createElement("style"), { textContent: siteCss }) : undefined;
  if (style) document.head.append(style);
  const still = Object.assign(document.createElement("style"), { textContent: noMotion });
  document.head.append(still);
  try {
    const host = await renderStory(subject.Subject);
    await settle();
    let scope: ParentNode[] = [host];
    let where = subject.id;
    const opened: HTMLElement[] = [];
    for (const [level, index] of path.entries()) {
      const opener = overlayOpeners(subject.id, scope, subject.parameters, level === 0)[index]!;
      const added = await openVia(opener, where, options.openTimeout ?? openTimeout);
      opened.push(...added);
      scope = added;
      where += ` with "${opener.name}" open`;
    }
    const found = smallControls(where, path.length === 0 ? [document] : scope);
    const children = overlayOpeners(subject.id, scope, subject.parameters, path.length === 0);
    await closeAll(where, opened);
    await cleanupStories();
    if (path.length === depth && children.length > 0) {
      const names = children.map((opener) => `"${opener.name}"`).join(", ");
      throw new Error(`${where} has an overlay opener (${names}) deeper than the scan opens (${depth} levels): raise maxDepth`);
    }
    for (let index = 0; index < children.length; index++) found.push(...(await scan(subject, [...path, index], depth, options)));
    return found;
  } finally {
    still.remove();
    style?.remove();
  }
}

afterEach(async () => {
  await cleanupStories();
  await rotate(390, 844);
});

it("finds stories, demos and the text-entry controls in TextField's", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(storySubjects.length).toBeGreaterThan(0);
  expect(demoSubjects.length).toBeGreaterThan(0);
  // The demos' stylesheet went through Tailwind: no raw at-rules are left, the site's own token
  // is there, and the utilities the demos use are generated. (Every class a demo uses today also
  // appears in registry/, so no class proves the site's `@source` alone.)
  expect(siteCss).not.toMatch(/@import|@source|@apply/);
  expect(siteCss).toContain("--site-code");
  expect(siteCss).toMatch(/\.grid\s*\{\s*display:\s*grid/);
  for (const id of ["TextField/Playground", "demo/text-field"]) {
    const subject = subjects.find((entry) => entry.id === id);
    expect(subject, id).toBeDefined();
    await renderStory(subject!.Subject);
    expect(document.querySelectorAll(textEntry).length, id).toBeGreaterThan(0);
    await cleanupStories();
  }
});

const px14 = { fontSize: "14px" } as const;
/** Base UI's `visuallyHiddenInput` style (@base-ui/utils), at 14px. */
const baseUiHiddenInput = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1,
  position: "absolute",
  fontSize: "14px",
} as const;
const srOnly = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
  fontSize: "14px",
} as const;

describe("the 16px detector", () => {
  it("reports a 14px input, select, textarea, contenteditable, textbox and sr-only input", async () => {
    await renderStory(() => (
      <>
        <span id="bio-label">Bio</span>
        <input aria-label="Name" style={px14} />
        <select aria-label="Unit" style={px14}>
          <option>g</option>
        </select>
        <textarea aria-label="Notes" style={px14} />
        <div contentEditable suppressContentEditableWarning aria-labelledby="bio-label" style={px14} />
        <div role="textbox" tabIndex={0} aria-label="Search" style={px14} />
        <input aria-label="Hidden search" style={srOnly} />
      </>
    ));
    const lines = smallControls("fixture");
    for (const control of ['input[type=text] "Name"', 'select "Unit"', 'textarea "Notes"', 'div[contenteditable] "Bio"', 'div[role=textbox] "Search"', 'input[type=text] "Hidden search"'])
      expect(lines.some((line) => line.startsWith(`fixture: ${control} is 14px, under 16px`) && line.endsWith(fix)), control).toBe(true);
    expect(lines).toHaveLength(6);
  });

  it("reports a focusable text control inside aria-hidden as an accessibility bug", async () => {
    await renderStory(() => (
      <div aria-hidden="true">
        <input aria-label="Name" style={{ fontSize: "16px" }} />
      </div>
    ));
    expect(smallControls("fixture")).toEqual([expect.stringMatching(/^fixture: input\[type=text\] "Name" is focusable inside aria-hidden, an accessibility bug/)]);
  });

  it("reports a visible aria-hidden input out of the tab order, because a tap still focuses it", async () => {
    await renderStory(() => <input aria-hidden="true" tabIndex={-1} aria-label="Mirror" style={px14} />);
    expect(smallControls("fixture")).toEqual([expect.stringMatching(/^fixture: input\[type=text\] "Mirror" is 14px, under 16px/)]);
  });

  it("skips inert, display:none, visibility:hidden and Base UI's hidden form input, and non-text inputs", async () => {
    await renderStory(() => (
      <>
        <div inert>
          <input aria-label="Inert" style={px14} />
        </div>
        <div style={{ display: "none" }}>
          <input aria-label="Not displayed" style={px14} />
        </div>
        <input aria-hidden="true" tabIndex={-1} aria-label="Form value" style={baseUiHiddenInput} />
        <div style={{ visibility: "hidden" }}>
          <input aria-label="Kept mounted, hidden" style={px14} />
        </div>
        {["checkbox", "radio", "range", "color", "file", "button", "submit", "reset", "image", "hidden"].map((type) => (
          <input key={type} type={type} aria-label={type} style={px14} />
        ))}
        <input aria-label="Big enough" style={{ fontSize: "16px" }} />
      </>
    ));
    expect(smallControls("fixture")).toEqual([]);
  });

  it("opens overlays inside overlays: a listbox in a dialog, and a shortcut-only menu", async () => {
    function Nested() {
      const [open, setOpen] = useState(0);
      const [menu, setMenu] = useState(false);
      useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            setOpen((level) => Math.max(0, level - 1));
            setMenu(false);
          }
          if (event.key === "k" && event.metaKey) setMenu(true);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, []);
      return (
        <>
          <button aria-haspopup="dialog" onClick={() => setOpen(1)}>
            Outer
          </button>
          {open >= 1 && (
            <div role="dialog" aria-label="Outer">
              <button aria-haspopup="listbox" aria-label="Choose unit" onClick={() => setOpen(2)}>
                g
              </button>
              {open >= 2 && (
                <div role="listbox" aria-label="Units">
                  <input aria-label="Filter units" style={px14} />
                </div>
              )}
            </div>
          )}
          {menu && (
            <div role="menu" aria-label="Commands">
              <input aria-label="Command" style={px14} />
            </div>
          )}
        </>
      );
    }
    const subject: Subject = { id: "Fixture/Nested", Subject: Nested, parameters: { openShortcut: "{Meta>}k{/Meta}" }, demo: false };
    expect((await scan(subject)).map((line) => line.replace(/ is 14px.*$/, ""))).toEqual([
      'Fixture/Nested with "Outer" open with "Choose unit" open: input[type=text] "Filter units"',
      'Fixture/Nested with "{Meta>}k{/Meta}" open: input[type=text] "Command"',
    ]);
  });

  it("finds a plain opener by its accessible name, as the story tests do", async () => {
    const host = await renderStory(() => <button aria-label="Edit recipe">Edit</button>);
    expect(overlayOpeners("Fixture/Plain", host, { plainOpeners: ["Edit recipe"] }).map((opener) => opener.name)).toEqual(["Edit recipe"]);
    expect(() => overlayOpeners("Fixture/Plain", host, { plainOpeners: ["Edit"] })).toThrow('Fixture/Plain: no button named "Edit" (parameters.plainOpeners)');
  });

  it("scans a popup nested in another popup that opens with it once", async () => {
    function Nested() {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, []);
      return (
        <>
          <button aria-haspopup="dialog" onClick={() => setOpen(true)}>
            Edit
          </button>
          {open && (
            <div role="dialog" aria-label="Edit">
              <div role="listbox" aria-label="Units">
                <input aria-label="Filter" style={px14} />
              </div>
            </div>
          )}
        </>
      );
    }
    const subject: Subject = { id: "Fixture/Inner", Subject: Nested, parameters: {}, demo: false };
    expect((await scan(subject)).map((line) => line.replace(/ is 14px.*$/, ""))).toEqual(['Fixture/Inner with "Edit" open: input[type=text] "Filter"']);
  });

  it("fails when an overlay deeper than the scan's depth has an opener", async () => {
    const Deep = () => (
      <>
        <button aria-haspopup="dialog">One</button>
      </>
    );
    const subject: Subject = { id: "Fixture/Deep", Subject: Deep, parameters: {}, demo: false };
    await expect(scan(subject, [], 0)).rejects.toThrow('Fixture/Deep has an overlay opener ("One") deeper than the scan opens (0 levels): raise maxDepth');
  });

  it("does not click an opener whose popup is already open, as a combobox input with an inline list", async () => {
    let clicks = 0;
    const Open = () => (
      <>
        <input
          role="combobox"
          aria-label="Herb"
          aria-haspopup="listbox"
          aria-expanded="true"
          aria-controls="fixture-herbs"
          style={{ fontSize: "16px" }}
          onClick={() => clicks++}
        />
        <ul role="listbox" id="fixture-herbs">
          <li role="option" aria-selected="false">
            Basil
          </li>
        </ul>
      </>
    );
    const subject: Subject = { id: "Fixture/Open", Subject: Open, parameters: {}, demo: false };
    expect(await scan(subject)).toEqual([]);
    expect(clicks).toBe(0);
  });

  it("names the story when an opener shows nothing", async () => {
    const subject: Subject = { id: "Fixture/Dead", Subject: () => <button aria-haspopup="dialog">Nothing</button>, parameters: {}, demo: false };
    const start = performance.now();
    await expect(scan(subject, [], maxDepth, { openTimeout: 500 })).rejects.toThrow('Fixture/Dead: opening "Nothing" showed no dialog, listbox or menu');
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it("scans an overlay without waiting out its motion, which does not change a font size", async () => {
    function Slow() {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, []);
      // A 20s entrance on the page and on the popup: far past the test's timeout if waited out.
      const slow = { animation: "fixture-slow-fade 20s" };
      return (
        <>
          <style>{"@keyframes fixture-slow-fade { from { opacity: 0.5 } }"}</style>
          <button aria-haspopup="dialog" style={slow} onClick={() => setOpen(true)}>
            Edit
          </button>
          {open && (
            <div role="dialog" aria-label="Edit" style={slow}>
              <input aria-label="Name" style={px14} />
            </div>
          )}
        </>
      );
    }
    const subject: Subject = { id: "Fixture/Slow", Subject: Slow, parameters: {}, demo: false };
    const start = performance.now();
    expect((await scan(subject)).map((line) => line.replace(/ is 14px.*$/, ""))).toEqual(['Fixture/Slow with "Edit" open: input[type=text] "Name"']);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe.each([
  { orientation: "portrait", width: 390, height: 844 },
  { orientation: "landscape", width: 844, height: 390 },
])("$orientation ($width x $height)", ({ width, height }) => {
  for (const subject of subjects) {
    const test = subject.id in knownViolations ? it.fails : it;
    test(`${subject.id} has no text-entry control under 16px, closed or with any overlay open`, async () => {
      await rotate(width, height);
      expect([innerWidth, innerHeight]).toEqual([width, height]);
      expect(matchMedia("(pointer: coarse)").matches).toBe(true);
      expect((await scan(subject)).join("\n")).toBe("");
    });
  }
});
