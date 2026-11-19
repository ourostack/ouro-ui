import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { commands, page } from "vitest/browser";
import { knownFindings, knownFor } from "../check-known.ts";
import { sweepStoryCheck } from "../check-sweep.ts";
import { storyScanTimeout } from "../story-axe.ts";
import { sliced } from "../slice.ts";
import { cleanupStories, selectedStories } from "../stories.tsx";
import { applyThemeFixture } from "../theme-fixtures.ts";

// Ouro check's rules over every story under nova, shadcn's default preset, light and dark, at a desktop width and past the
// root type step: ouro-base.css steps the root font size up from 2400px wide (112.5%) and again from 3200px (125%), so 2560px
// is a page whose every rem size and radius is larger, which test/stories.test.tsx (390 and 1280 px, the Ouro theme) never
// reaches. The entries for nova are the ones whose `theme` is "nova" in check-known.ts, and the Ouro-theme run's entries
// for the story waive here too. The axe scan of the same fixture is
// test/themes/nova-light.test.ts and nova-dark.test.ts; this file is a sliced suite (scripts/shard.mjs), so each shard runs
// its share of every story here, and a whole file would load one shard alone.
describe("nova theme, Ouro check", () => {
  // Two sizes, the second a wider page than the other suites check: twice a story scan's budget, which a loaded runner needs.
  const checkTimeout = 2 * storyScanTimeout;
  let remove: () => void = () => {};
  beforeAll(() => {
    remove = applyThemeFixture("nova");
  });
  afterAll(() => remove());
  beforeEach(async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    await page.viewport(1280, 800);
  });
  afterEach(async () => {
    await cleanupStories();
  });

  describe.each(["light", "dark"] as const)("nova %s", (scheme) => {
    it.each(sliced(selectedStories, `nova ${scheme}: check`))(
      `$id passes Ouro check's rules under nova (${scheme}) at 1280 and 2560 px, except its known findings`,
      async ({ id, Story }) => {
        await sweepStoryCheck({ id, Story, sizes: [[1280, 800], [2560, 1440]], schemes: [scheme], known: knownFor(knownFindings, id, "nova"), inherited: knownFor(knownFindings, id), restore: [1280, 800] });
      },
      checkTimeout,
    );
  });
});
