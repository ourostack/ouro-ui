import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { scanStoryViolations, storyScanTimeout } from "../story-axe.ts";
import { sliced } from "../slice.ts";
import { cleanupStories, selectedStories, setScheme } from "../stories.tsx";
import { applyThemeFixture } from "../theme-fixtures.ts";
import { compareFinding, themeFindings } from "./theme-findings.ts";

/**
 * Every story passes axe under a third-party theme (test/theme-fixtures/<name>.css), in light and
 * dark, closed and with each overlay open: the components read only shadcn's standard tokens, so
 * any theme's own pairs carry through. One file per fixture and scheme, each a sliced suite (test/slice.ts):
 * every shard of `pnpm test:themes --shard=<i>/<n>` (the `themes` project) scans its own share of the stories in all six. At the desktop width
 * only: contrast does not change with the width. nova is also checked with Ouro check's rules, at
 * 1280 and 2560 px, in test/themes/nova-check.test.tsx, which carries the scan past the root type step.
 */
export function describeThemeAxe(name: string, scheme: "light" | "dark"): void {
  describe(`${name} theme`, () => {
    let remove: () => void = () => {};
    beforeAll(() => {
      remove = applyThemeFixture(name);
    });
    afterAll(() => remove());
    beforeEach(async () => {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
      await page.viewport(1280, 800);
    });
    afterEach(async () => {
      await cleanupStories();
    });

    describe(`${name} ${scheme}`, () => {
      it.each(sliced(selectedStories, `${name} ${scheme}: axe`))(`$id has no axe violations under ${name} (${scheme})`, async ({ id, Story }) => {
        setScheme(scheme);
        const { violations, text } = await scanStoryViolations(id, Story);
        const finding = themeFindings[`${name} ${scheme} ${id}`];
        // Exactly the pinned nodes: anything else fails with axe's own text, and a pinned node
        // that no longer fails means the theme was fixed, so its entry goes.
        expect(compareFinding(violations, finding), finding ? `${finding.why}\n\n${text}` : text).toEqual({ unexpected: [], missing: [] });
      }, storyScanTimeout);
    });
  });
}
