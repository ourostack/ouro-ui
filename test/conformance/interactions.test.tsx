import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { collectControls, controlRole } from "../controls.ts";
import { accessibleName, cleanupStories, isVisible, openPopup, renderStory, settle, type ConformanceParameters } from "../stories.tsx";
import { conformanceStories, describeElement, layOut } from "./harness.ts";

// Focus and announcements after every action. Each story's controls are used one after another
// as a person would: a press on each button, link, checkbox, tab or option (Enter for one shown
// only to screen readers), a character typed into each field, an arrow key on each slider and
// scrollable region, and Escape for each popup the actions open, once its own controls are used.
// After every action, focus must be on an element still in the page and shown: landing on
// <body> or on something hidden fails, unless the story declares that control's exit
// (`parameters.conformance.focusExit`). Every action runs inside `watchAnnouncements`: a live
// region announcing the same text twice in one action fails, and so does an announcement the
// story declares (`parameters.conformance.announces`) that is not heard exactly once. Links and
// form submissions navigate a hidden frame, not the test page.

/** How many controls of one part (item, part and role) a story's run uses: enough for each part's behaviour, not every day of a calendar. */
const perPart = 3;
/** The most actions one story's run takes. */
const maxActions = 60;

const identity = (control: Element) => `${control.getAttribute("data-ouro-control") ?? "unmarked"}/${control.getAttribute("data-ouro-part") ?? "?"}/${controlRole(control)}`;

/** Whether a control can be used now: shown, enabled, not inert and not hidden from assistive tech. */
function usable(control: Element): boolean {
  if (!isVisible(control) || control.closest('[inert], [aria-hidden="true"]')) return false;
  if (control.matches(':disabled, [aria-disabled="true"], [data-disabled]')) return false;
  const box = control.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** Whether a control is shown to screen readers only: clipped to a pixel, so no pointer can reach it. */
function clipped(control: Element): boolean {
  const box = control.getBoundingClientRect();
  return box.width <= 1 || box.height <= 1;
}

const typed = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
const arrowed = new Set(["slider", "generic"]);

/** Uses a control once, as a person would. Resolves false when the browser could not reach it (covered by something else). */
async function operate(control: HTMLElement): Promise<boolean> {
  const role = controlRole(control);
  const editable = control.matches('input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="button"], [type="submit"], [type="reset"]), textarea, [contenteditable]');
  if (clipped(control)) {
    control.focus();
    await userEvent.keyboard(arrowed.has(role) ? "{ArrowRight}" : editable ? "a" : "{Enter}");
    return true;
  }
  try {
    await userEvent.click(control, { timeout: 2000 });
  } catch {
    return false;
  }
  if (typed.has(role) && editable) await userEvent.keyboard("a");
  else if (arrowed.has(role)) await userEvent.keyboard("{ArrowRight}");
  return true;
}

/** Where focus is, when it is lost: on <body>, or on an element that is gone or hidden. */
function lostFocus(): string | null {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return "focus fell to <body>";
  if (!active.isConnected) return "focus is on an element no longer in the page";
  if (!active.checkVisibility({ visibilityProperty: true })) return `focus is on a hidden element: ${describeElement(active)}`;
  return null;
}

/**
 * Where links and form submissions go instead of the test page: a hidden frame every navigation
 * without a target of its own is sent to (`<base target>`), so a story's link or a form with no
 * submit handler runs as it would in an app, its handlers and default action included, and the
 * test page stays.
 */
const sink = "ouro-conformance-navigation";

beforeAll(() => {
  const frame = Object.assign(document.createElement("iframe"), { name: sink, hidden: true });
  // Sandboxed, so a page loaded into it (the test page itself, for a form with no action) runs no script.
  frame.setAttribute("sandbox", "");
  const base = Object.assign(document.createElement("base"), { target: sink });
  frame.dataset["testHarness"] = "";
  document.documentElement.append(frame);
  document.head.prepend(base);
});
afterAll(() => {
  document.querySelector(`iframe[name="${sink}"]`)?.remove();
  document.querySelector(`base[target="${sink}"]`)?.remove();
});
beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupStories();
});

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("actions at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });

  it.each(conformanceStories)(
    "$id keeps focus in the page and announces each message once after every action",
    async ({ Story, parameters }) => {
      const declared: ConformanceParameters = parameters.conformance ?? {};
      const host = await renderStory(Story);
      layOut(host, parameters);
      await settle();
      const used = new Set<Element>();
      const counts = new Map<string, number>();
      const problems: string[] = [];
      const exited = new Set<string>();
      for (let step = 0; step < maxActions; step++) {
        const popup = openPopup();
        const pool = collectControls(popup ?? document.body).filter(
          (control): control is HTMLElement => control instanceof HTMLElement && !used.has(control) && (counts.get(identity(control)) ?? 0) < perPart && usable(control),
        );
        const control = pool[0];
        const name = control ? accessibleName(control) : "Escape";
        const action = control ? `using "${name}" (${identity(control)})` : "pressing Escape";
        if (!control && !popup) break;
        const announcements = watchAnnouncements();
        try {
          if (control) {
            used.add(control);
            counts.set(identity(control), (counts.get(identity(control)) ?? 0) + 1);
            if (!(await operate(control))) continue;
          } else {
            await userEvent.keyboard("{Escape}");
          }
          await settle();
          const lost = lostFocus();
          if (lost && control && declared.focusExit?.[name]) exited.add(name);
          else if (lost) problems.push(`after ${action}: ${lost}`);
          const heard = new Map<Element, Map<string, number>>();
          for (const { region, text } of announcements.changes) {
            const texts = heard.get(region) ?? new Map<string, number>();
            texts.set(text, (texts.get(text) ?? 0) + 1);
            heard.set(region, texts);
          }
          for (const texts of heard.values()) {
            for (const [text, times] of texts) if (times > 1) problems.push(`after ${action}: "${text}" was announced ${times} times`);
          }
          const expected = control ? declared.announces?.[name] : undefined;
          if (expected !== undefined && announcements.count(expected) !== 1) problems.push(`after ${action}: "${expected}" was announced ${announcements.count(expected)} times, not once`);
        } finally {
          announcements.stop();
        }
        if (!control && openPopup() === popup) break;
      }
      for (const name of Object.keys(declared.focusExit ?? {})) {
        if (!exited.has(name)) problems.push(`focusExit declares "${name}", but using it kept focus in the page: remove the declaration`);
      }
      expect(problems.join("\n")).toBe("");
    },
    60_000,
  );
});
