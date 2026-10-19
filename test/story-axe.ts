import axe from "axe-core";
import type { ComponentType } from "react";
import { axeExclude } from "@/registry/ouro/lib/ouro/testing/axe";
import { closeOverlay, openOverlay, overlayOpeners, renderStory, settle } from "./stories.tsx";

// The axe scan every story gets: test/stories.test.tsx under the Ouro theme at two widths, and
// test/themes/ under each shadcn theme fixture.

/** axe's result as readable lines: rule, impact, help and the offending selectors. */
export function describeViolations(violations: axe.Result[]): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`).join("\n"),
    )
    .join("\n");
}

/**
 * Scans the page, or only `within` when given. A list's popup (Combobox, Select) is scanned on
 * its own: while it is open, Base UI hides the rest of the page from assistive tech with
 * `aria-hidden` (FloatingFocusManager), so axe would report the page's focusable fields as
 * hidden yet focusable (aria-hidden-focus). Focus stays in the input, and Tab closes the
 * popup and unhides the page; the closed scan covers the page itself.
 */
export async function scan(within?: HTMLElement): Promise<axe.Result[]> {
  // Base UI's focus-trap guards are excluded, not a rule (axeExclude, which ships to
  // apps): in WebKit they take `role="button"` on purpose, with no name, so
  // VoiceOver's virtual cursor fires focus on them and the modal's trap catches it
  // (Base UI utils/FocusGuard). They are visually hidden and never reached by Tab.
  const context: axe.ElementContext = { include: [within ?? document.documentElement], exclude: axeExclude.map((selector) => [selector]) };
  const result = await axe.run(context, {
    resultTypes: ["violations"],
    rules: {
      // Page-structure rules, off as in Storybook's a11y addon: a story is a
      // fragment of a page, so it has no `<main>`, no `<h1>` and no landmarks
      // of its own. The app that places the component owns those.
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      region: { enabled: false },
    },
  });
  return result.violations;
}

/**
 * How long one story's scan may take: a story with many overlays opens and scans each in turn
 * (Reorderable/ScrollsInPlace opens ten, about 10s on its own), and the suites run beside each other.
 */
export const storyScanTimeout = 30_000;

/**
 * Renders a story and scans it closed and with each of its overlays open. Returns the
 * violations as text, empty when there are none.
 */
export async function scanStory(id: string, Story: ComponentType): Promise<string> {
  const host = await renderStory(Story);
  await settle();
  const found: string[] = [];
  const closed = await scan();
  if (closed.length > 0) found.push(`closed:\n${describeViolations(closed)}`);
  for (const opener of overlayOpeners(id, host)) {
    const popup = await openOverlay(opener);
    const open = await scan(popup.matches('[role="dialog"], [role="alertdialog"]') ? undefined : popup);
    if (open.length > 0) found.push(`with "${opener.name}" open:\n${describeViolations(open)}`);
    await closeOverlay();
  }
  return found.join("\n\n");
}
