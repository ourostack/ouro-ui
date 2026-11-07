import type { ComponentType } from "react";
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import { audit, axeExclude, describeFindings, type GateFinding } from "@/registry/ouro/lib/ouro/testing/axe";
import { otherPopups } from "@/registry/ouro/lib/ouro/testing/popups";
import { accessibleName, closeOverlay, isVisible, openOverlay, overlayOpeners, renderStoryPage, settle } from "./stories.tsx";

// The axe scan every story gets: test/stories.test.tsx under the Ouro theme at two widths, and
// test/themes/ under each shadcn theme fixture. It is the gate (`audit` in the test kit, registry/ouro/lib/ouro/testing/axe.ts): every rule,
// every violation whatever its impact, and every check axe could not decide unless a
// measurement passes it, with the story placed in a page's main landmark under its heading.

export { describeFindings };

/**
 * Scans the page, or only `within` when given. A list's popup (Combobox, Select) is scanned on
 * its own: while it is open, Base UI hides the rest of the page from assistive tech with
 * `aria-hidden` (FloatingFocusManager), so axe would report the page's focusable fields as
 * hidden yet focusable (aria-hidden-focus). Focus stays in the input, and Tab closes the
 * popup and unhides the page; the closed scan covers the page itself.
 */
export async function scan(within?: HTMLElement): Promise<GateFinding[]> {
  // Base UI's focus-trap guards are excluded, not a rule (axeExclude, which ships to
  // apps): in WebKit they take `role="button"` on purpose, with no name, so
  // VoiceOver's virtual cursor fires focus on them and the modal's trap catches it
  // (Base UI utils/FocusGuard). They are visually hidden and never reached by Tab.
  return audit({ include: [within ?? document.documentElement], exclude: axeExclude.map((selector) => [selector]) });
}

/**
 * How long one story's scan may take: a story with many overlays opens and scans each in turn
 * (Reorderable/ScrollsInPlace opens ten, about 10s on its own), and the suites run beside each other.
 */
export const storyScanTimeout = 30_000;

/** One node the gate flagged in a story: the phase it was scanned in, the rule and the node's selector. */
export interface StoryViolation {
  /** `closed`, or `with "<opener>" open`. */
  phase: string;
  rule: string;
  target: string;
}

/**
 * Renders a story as a page shows it and scans it closed and with each of its overlays open.
 * Returns each flagged node, the scan as text (empty when there are none) and the phases scanned.
 */
export async function scanStoryViolations(id: string, Story: ComponentType): Promise<{ violations: StoryViolation[]; text: string; phases: string[] }> {
  await parkPointer();
  const host = await renderStoryPage(Story);
  await settle();
  const violations: StoryViolation[] = [];
  const found: string[] = [];
  const phases: string[] = [];
  const record = (phase: string, findings: GateFinding[]) => {
    phases.push(phase);
    if (findings.length === 0) return;
    found.push(`${phase}:\n${describeFindings(findings)}`);
    for (const finding of findings) violations.push({ phase, rule: finding.undecided ? `undecided ${finding.rule}` : finding.rule, target: finding.target });
  };
  record("closed", await scan());
  for (const opener of overlayOpeners(id, host)) {
    const popup = await openOverlay(opener);
    void popup;
    record(`with "${opener.name}" open`, await scan());
    await closeOverlay();
  }
  // Found afresh after each one closes: a trigger that mounts only while its row is hovered or focused
  // (MessageList's one action bar) is a new element each time, and an element held from before is gone.
  const opened = new Set<string>();
  for (let opener = nextPassingOpener(host, opened); opener; opener = nextPassingOpener(host, opened)) {
    await opener.open();
    await vi.waitFor(() => {
      if (!opener.popup()) throw new Error(`${opener.name} opened nothing`);
    }, waitOptions);
    await settle();
    record(`with ${opener.name} open`, await scan());
    await opener.close();
    await vi.waitFor(() => {
      if (opener.popup()) throw new Error(`${opener.name} did not close`);
    }, waitOptions);
    await settle();
  }
  return { violations, text: found.join("\n\n"), phases };
}

/**
 * Moves the real mouse off the test's page, so a story is scanned at rest. Otherwise the mouse
 * stays where the last story's overlay trigger left it, and WebKit sends a mouse move to whatever
 * mounts under it: TimeGrid's slot preview then shows in the "closed" scan.
 */
export async function parkPointer(): Promise<void> {
  await userEvent.hover(document.documentElement, { position: { x: -8, y: -8 }, force: true });
}

/** How long a popup may take to open or close on a loaded CI runner. */
const waitOptions = { timeout: 10_000, interval: 20 };

/** An overlay {@link overlayOpeners} leaves out, with how to open and close it and find it open. */
interface PassingOpener {
  name: string;
  open: () => Promise<void>;
  close: () => Promise<void>;
  popup: () => Element | null;
}

/**
 * The overlays a story shows that no `aria-haspopup` trigger opens, so the shared openers leave
 * them out: each of `otherPopups` in the test kit, which apps' story checks open the same way. The
 * scan opens them too, so a popup of theirs outside every landmark fails like a menu's would.
 */
function passingOpeners(host: HTMLElement): (PassingOpener & { key: string })[] {
  const usable = (element: HTMLElement) => isVisible(element) && !element.matches(':disabled, [aria-disabled="true"], [data-disabled]');
  const seen = new Map<string, number>();
  return otherPopups.flatMap(({ kind, trigger, opensOn, popup }) =>
    [...host.querySelectorAll<HTMLElement>(trigger)].filter(usable).map((element) => {
      const name = `the ${kind} of "${accessibleName(element)}"`;
      // The nth trigger of that name, so two alike (each row's "Like") are each opened once.
      const nth = (seen.get(name) ?? 0) + 1;
      seen.set(name, nth);
      return {
        key: `${name} #${nth}`,
        name,
        open: async () => {
          if (opensOn === "hover") await userEvent.hover(element);
          else if (opensOn === "press") await userEvent.click(element);
          else {
            // Focus from the keyboard, as a hover card opens for it; WebKit's Tab skips links by default.
            await userEvent.keyboard("{Shift}");
            element.focus();
          }
        },
        close: async () => {
          // A trigger that mounts only while its row is hovered (MessageList's one bar) may be gone by now: park instead.
          if (opensOn === "hover") await (element.isConnected ? userEvent.unhover(element) : parkPointer());
          if (opensOn === "keyboard focus") element.blur();
          await userEvent.keyboard("{Escape}");
        },
        popup: () => document.querySelector(popup),
      };
    }),
  );
}

/** The first of {@link passingOpeners} on the page now that `opened` does not hold, which it then holds. */
function nextPassingOpener(host: HTMLElement, opened: Set<string>): PassingOpener | undefined {
  const opener = passingOpeners(host).find(({ key }) => !opened.has(key));
  if (opener) opened.add(opener.key);
  return opener;
}

/** Renders a story and scans it closed and with each of its overlays open: the findings as text, empty when there are none. */
export async function scanStory(id: string, Story: ComponentType): Promise<string> {
  return (await scanStoryViolations(id, Story)).text;
}
