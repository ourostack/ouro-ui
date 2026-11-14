import { expect, test } from "@playwright/test";
import { describe, LOOK_SELECTOR, Looks, picture, quiet, routes, settled } from "./looks";

// A component looks the same wherever it appears. Every page of the build is opened, in each colour mode, in
// each engine; every Ouro element is keyed by its item, part, element, variant and state, and what makes up
// its look (shape, box, padding, gap, colours, font, shadow, opacity, transform and the geometry of its
// children) is compared across pages, and so is a picture of it with its text hidden. An instance that
// differs from the one the rest share is a page-level rule changing a component. A part that must sit inside
// its container (a switch's thumb in its track, a radio's dot in its circle) does.

for (const mode of ["light", "dark"] as const) {
  test(`one look per component on every page, ${mode}`, async ({ page, browserName }) => {
    test.setTimeout(900_000);
    await page.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "pearl", mode: m })), mode);
    const looks = new Looks();
    const escapes: string[] = [];
    const pages = routes();
    for (const path of pages) {
      await page.goto(path);
      await settled(page);
      await quiet(page);
      const { looks: found, escapes: out } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
      escapes.push(...out.map((e) => `${path}: ${e}`));
      for (const look of found) looks.add(path, look, look.pictured && looks.wants(look) ? await picture(page, look.index) : null);
    }
    console.log(`${browserName} ${mode}: ${looks.keys} component states, ${looks.crops} pictures, over ${pages.length} pages`);
    for (const f of [...escapes, ...looks.differences(), ...looks.pixelDifferences()]) console.log(`FINDING ${browserName} ${mode}: ${typeof f === "string" ? f : JSON.stringify(f)}`);
    expect.soft(escapes, "a part leaves its container").toEqual([]);
    expect.soft(looks.differences(), "a component's properties differ from page to page").toEqual([]);
    expect.soft(looks.pixelDifferences(), "a component's picture differs from page to page").toEqual([]);
  });
}
