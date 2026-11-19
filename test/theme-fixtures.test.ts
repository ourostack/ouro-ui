import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { applyThemeFixture } from "./theme-fixtures.ts";

// A fixture keeps ouro-base's root type step, so the sweep at 2560 px (test/themes/nova-check.test.tsx) checks the page a
// wide screen shows, not the 16px root of a fixture that dropped the step.
describe("a theme fixture keeps ouro-base's root type step", () => {
  let [width, height] = [0, 0];
  const rootPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

  beforeEach(() => {
    [width, height] = [innerWidth, innerHeight];
  });
  afterEach(async () => {
    await page.viewport(width, height);
  });

  it.each(["nova", "vega", "cookbook"])("grows %s's root a step at 2400px and another at 3200px, as an app's stylesheet does", async (name) => {
    const remove = applyThemeFixture(name);
    const seen: number[] = [];
    try {
      for (const viewportWidth of [1280, 2399, 2400, 3199, 3200]) {
        await page.viewport(viewportWidth, 900);
        await expect.poll(() => window.innerWidth).toBe(viewportWidth);
        seen.push(rootPx());
      }
    } finally {
      remove();
    }
    expect(seen).toEqual([16, 16, 18, 18, 20]);
  });
});
