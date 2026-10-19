import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { scanStory, storyScanTimeout } from "../story-axe.ts";
import { cleanupStories, setScheme, stories } from "../stories.tsx";
import { applyThemeFixture } from "../theme-fixtures.ts";

/**
 * Violations a fixture's own values cause, by `<fixture> <scheme> <story id>`, which the app that
 * owns the theme fixes: each must still occur, with no other rule, so the entry goes when it does.
 */
const themeFindings: Record<string, { rule: string; why: string }> = {
  "cookbook light Table/InContext": {
    rule: "color-contrast",
    why:
      "Spoonjoy's --primary, its brass #9b6834, is 4.54:1 on its paper, so primary text on any tint falls under 4.5:1: " +
      "an outline Button on a striped row (bg-muted/50) is 4.21:1. Spoonjoy deepens the brass it maps to --primary.",
  },
};

/** The rule ids in a scan's text. */
const rules = (found: string) => [...new Set([...found.matchAll(/^(\S+) \((?:minor|moderate|serious|critical)\):/gm)].map((match) => match[1]))];

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
        const found = await scanStory(id, Story);
        const finding = themeFindings[`${name} ${scheme} ${id}`];
        if (finding) expect(rules(found), finding.why).toEqual([finding.rule]);
        else expect(found).toBe("");
      }, storyScanTimeout);
    });
  });
}
