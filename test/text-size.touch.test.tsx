import { useEffect, useState, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";
import siteCss from "../site/src/styles.css?inline";
import { cleanupStories, renderStory, settle, stories } from "./stories.tsx";

// Runs in the `touch` project: Chromium as a phone with a coarse pointer. iOS Safari zooms the
// page when a text control under 16px takes focus, and does not zoom back; Chromium's emulation
// does not reproduce it, so this reads the computed font size of every text-entry control in
// every story and every docs demo, in portrait and in landscape (where `sm` applies but the
// pointer is still coarse).
//
// Each subject is scanned closed, then with each overlay open, recursively to `maxDepth`: every
// `aria-haspopup` trigger (dialog, listbox, menu and the rest), every button a story names in
// `parameters.plainOpeners`, and the keys a story names in `parameters.openShortcut` (a
// `userEvent.keyboard` string, for an overlay that only a shortcut opens). Each overlay path
// renders the subject afresh. Stories render with app.css only, as an installed app does; demos
// also get the site's stylesheet, as the docs site renders them.
//
// Out of scope: controls that appear only after typing, after stepping through a flow (a wizard's
// next step, a submitted form) or after any interaction other than opening an overlay.

/** Text-entry controls: what iOS zooms into on focus. */
const textEntry =
  "input:not(" +
  ["checkbox", "radio", "range", "color", "file", "button", "submit", "reset", "image", "hidden"].map((type) => `[type="${type}"]`).join(", ") +
  '), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

/** Elements an opener opens. */
const popupSelector = '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [role="tree"], [role="grid"]';

/** How many overlays deep the scan opens (an overlay inside an overlay inside an overlay). */
const maxDepth = 3;

/** Stories and demos that fail today, by id, with the component that needs the fix. */
const knownViolations: Record<string, string> = {};

const fix = "Fix: give the control a 16px font on coarse pointers (for example `text-base sm:pointer-fine:text-sm`).";

/** The text of the elements an `aria-labelledby` list names. */
function labelledBy(element: Element): string {
  const ids = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ");
}

/** An element's accessible name, as far as these tests need it. */
function accessibleName(element: HTMLElement): string {
  return (
    labelledBy(element) ||
    element.getAttribute("aria-label")?.trim() ||
    (element as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
    element.getAttribute("placeholder")?.trim() ||
    element.getAttribute("name") ||
    element.textContent?.trim() ||
    element.getAttribute("title") ||
    ""
  );
}

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

/** Every text-entry control under the roots that is under 16px, or focusable inside `aria-hidden`, as failure lines. */
function smallControls(where: string, roots: ParentNode[] = [document]): string[] {
  return roots
    .flatMap((root) => [...root.querySelectorAll<HTMLElement>(textEntry)])
    .flatMap((control) => {
      // Not rendered, or not reachable at all.
      if (control.closest("[inert]") || !control.checkVisibility()) return [];
      if (control.closest('[aria-hidden="true"]')) {
        // Base UI's hidden form inputs: aria-hidden and out of the tab order, so nobody focuses them.
        if (control.tabIndex < 0) return [];
        return [
          `${where}: ${describeControl(control)} is focusable inside aria-hidden, an accessibility bug: a person can focus it but a screen reader skips it. Fix: remove aria-hidden, or take the control out of the tab order.`,
        ];
      }
      const size = getComputedStyle(control).fontSize;
      return parseFloat(size) < 16 ? [`${where}: ${describeControl(control)} is ${size}, under 16px, so iOS Safari zooms on focus. ${fix}`] : [];
    });
}

interface Subject {
  id: string;
  Subject: ComponentType;
  plainOpeners: string[];
  openShortcut?: string | undefined;
  demo: boolean;
}

/** Every docs demo: site/src/docs/demos/**\/<name>.demo.tsx, by name. */
const demoModules = import.meta.glob<{ default: ComponentType }>("../site/src/docs/demos/**/*.demo.tsx", { eager: true });

const storySubjects: Subject[] = stories.map(({ id, Story, parameters }) => ({
  id,
  Subject: Story,
  plainOpeners: parameters.plainOpeners ?? [],
  openShortcut: (parameters as { openShortcut?: string }).openShortcut,
  demo: false,
}));
const demoSubjects: Subject[] = Object.entries(demoModules).map(([path, module]) => ({
  id: `demo/${path.replace(/^.*\/demos\/(.+)\.demo\.tsx$/, "$1")}`,
  Subject: module.default,
  plainOpeners: [],
  demo: true,
}));
const subjects = [...storySubjects, ...demoSubjects];

interface Opener {
  name: string;
  open: () => Promise<void>;
}

/** The openers in a scope: `aria-haspopup` triggers, and at the top level the plain openers and the shortcut. */
function openersIn(subject: Subject, scope: ParentNode[], top: boolean): Opener[] {
  const triggers = scope
    .flatMap((root) => [...root.querySelectorAll<HTMLElement>('[aria-haspopup]:not([aria-haspopup="false"])')])
    .filter((element) => !element.matches(':disabled, [aria-disabled="true"]') && element.checkVisibility())
    .map((element) => ({ name: accessibleName(element), open: () => userEvent.click(element) }));
  if (!top) return triggers;
  const host = scope[0] as HTMLElement;
  const plain = subject.plainOpeners.map((label) => {
    const button = [...host.querySelectorAll<HTMLElement>("button")].find((item) => accessibleName(item) === label);
    if (!button) throw new Error(`${subject.id}: no button named "${label}" (parameters.plainOpeners)`);
    return { name: label, open: () => userEvent.click(button) };
  });
  const shortcut = subject.openShortcut;
  return [...triggers, ...plain, ...(shortcut ? [{ name: shortcut, open: () => userEvent.keyboard(shortcut) }] : [])];
}

const visiblePopups = () => [...document.querySelectorAll<HTMLElement>(popupSelector)].filter((popup) => popup.checkVisibility());

/** Opens an overlay and returns the popups it added. */
async function openVia(opener: Opener, where: string): Promise<HTMLElement[]> {
  const before = new Set(visiblePopups());
  await opener.open();
  let added: HTMLElement[] = [];
  await vi.waitFor(
    () => {
      added = visiblePopups().filter((popup) => !before.has(popup));
      if (added.length === 0) throw new Error(`${where}: opening "${opener.name}" showed no dialog, listbox or menu`);
    },
    { timeout: 10_000, interval: 20 },
  );
  await settle();
  return added;
}

/**
 * Closes the overlays the scan opened with Escape, so the subject unmounts the way a person
 * leaves it. Popups the subject shows on its own (a story's toasts) stay.
 */
async function closeAll(where: string, opened: HTMLElement[]): Promise<void> {
  const stillOpen = () => opened.filter((popup) => popup.isConnected && popup.checkVisibility()).length;
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
 * each opener in what it showed, to `maxDepth`.
 */
async function scan(subject: Subject, path: number[] = []): Promise<string[]> {
  const style = subject.demo ? Object.assign(document.createElement("style"), { textContent: siteCss }) : undefined;
  if (style) document.head.append(style);
  try {
    const host = await renderStory(subject.Subject);
    await settle();
    let scope: ParentNode[] = [host];
    let where = subject.id;
    const opened: HTMLElement[] = [];
    for (const [level, index] of path.entries()) {
      const opener = openersIn(subject, scope, level === 0)[index]!;
      const added = await openVia(opener, where);
      opened.push(...added);
      scope = added;
      where += ` with "${opener.name}" open`;
    }
    const found = smallControls(where, path.length === 0 ? [document] : scope);
    const children = path.length < maxDepth ? openersIn(subject, scope, path.length === 0).length : 0;
    await closeAll(where, opened);
    await cleanupStories();
    for (let index = 0; index < children; index++) found.push(...(await scan(subject, [...path, index])));
    return found;
  } finally {
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
  for (const id of ["TextField/Playground", "demo/text-field"]) {
    const subject = subjects.find((entry) => entry.id === id);
    expect(subject, id).toBeDefined();
    await renderStory(subject!.Subject);
    expect(document.querySelectorAll(textEntry).length, id).toBeGreaterThan(0);
    await cleanupStories();
  }
});

const px14 = { fontSize: "14px" } as const;
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

  it("skips inert, display:none and unfocusable aria-hidden controls, and non-text inputs", async () => {
    await renderStory(() => (
      <>
        <div inert>
          <input aria-label="Inert" style={px14} />
        </div>
        <div style={{ display: "none" }}>
          <input aria-label="Not displayed" style={px14} />
        </div>
        <input aria-hidden="true" tabIndex={-1} aria-label="Form value" style={px14} />
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
    const subject: Subject = { id: "Fixture/Nested", Subject: Nested, plainOpeners: [], openShortcut: "{Meta>}k{/Meta}", demo: false };
    expect((await scan(subject)).map((line) => line.replace(/ is 14px.*$/, ""))).toEqual([
      'Fixture/Nested with "Outer" open with "Choose unit" open: input[type=text] "Filter units"',
      'Fixture/Nested with "{Meta>}k{/Meta}" open: input[type=text] "Command"',
    ]);
  });

  it("names the story when an opener shows nothing", async () => {
    const subject: Subject = { id: "Fixture/Dead", Subject: () => <button aria-haspopup="dialog">Nothing</button>, plainOpeners: [], demo: false };
    await expect(scan(subject)).rejects.toThrow('Fixture/Dead: opening "Nothing" showed no dialog, listbox or menu');
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
