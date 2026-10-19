import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { scanStoryViolations, storyScanTimeout } from "../story-axe.ts";
import { cleanupStories, setScheme, stories } from "../stories.tsx";
import { applyThemeFixture } from "../theme-fixtures.ts";
import { compareFinding, themeFindings } from "./theme-findings.ts";

/**
 * Every story passes axe under a third-party theme (test/theme-fixtures/<name>.css), in light and
 * dark, closed and with each overlay open: the components read only shadcn's standard tokens, so
 * any theme's own pairs carry through. One file per fixture, so CI shards them (`pnpm
 * test:themes --shard=<i>/<n>`, the `themes` project). At the desktop width only: contrast does
 * not change with the width, and test/stories.test.tsx scans both widths under the Ouro theme.
 */
export function describeThemeAxe(name: string): void {
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

    describe.each(["light", "dark"] as const)(`${name} %s`, (scheme) => {
      it.each(stories)(`$id has no axe violations under ${name} (${scheme})`, async ({ id, Story }) => {
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
