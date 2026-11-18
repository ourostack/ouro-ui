import { expect, test } from "@playwright/test";
import { recordMatched } from "./waivers";
import { describe, LOOK_SELECTOR, Looks, picture, quiet, routeGuard, routes, settled } from "./looks";

// A component looks the same wherever it appears. Every page of the build is opened, in each colour mode, in
// each engine; every Ouro element is keyed by its item, part, element, variant and state, and what makes up
// its look (shape, box, padding, gap, colours, font, shadow, opacity, transform and the geometry of its
// children) is compared across pages, and so is a picture of it with its text hidden. An instance that
// differs from the one the rest share is a page-level rule changing a component. A part that must sit inside
// its container (a switch's thumb in its track, a radio's dot in its circle) does.

export function samenessSweep(mode: "light" | "dark", engine: "chromium" | "webkit", part = 1, parts = 1) {
  test(`one look per component on every page, ${mode}, ${engine}${parts > 1 ? `, part ${part} of ${parts}` : ""}`, async ({ page, context, browserName }) => {
    test.skip(browserName !== engine, `${engine} only`);
    test.setTimeout(900_000);
    await context.addInitScript((m) => localStorage.setItem("ouro-site-theme", JSON.stringify({ preset: "pearl", mode: m })), mode);
    const looks = new Looks();
    const escapes: string[] = [];
    const pages = routes().filter((_, i) => i % parts === part - 1);
    const guard = routeGuard(context, page);
    page.setDefaultTimeout(5_000);
    for (const path of pages) {
      await guard.visit(path, async (page) => {
        await page.goto(path);
        await settled(page);
        await quiet(page);
        const { looks: found, escapes: out } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
        escapes.push(...out.map((e) => `${path}: ${e}`));
        for (const look of found) looks.add(path, look, look.pictured && looks.wants(look) ? await picture(page, look.index, look.attributes) : null);
      });
    }
    console.log(`${browserName} ${mode}: ${looks.keys} component states, ${looks.crops} pictures, over ${pages.length} pages`);
    for (const f of [...escapes, ...looks.differences(), ...looks.pixelDifferences()]) console.log(`FINDING ${browserName} ${mode}: ${typeof f === "string" ? f : JSON.stringify(f)}`);
    for (const side of looks.sides()) console.log(`SIDES ${browserName} ${mode}: ${side}`);
    expect.soft(guard.skipped.length, `routes skipped as too slow: ${guard.skipped.join(", ")}`).toBeLessThanOrEqual(3);
    recordMatched(`sameness-${mode}-${engine}${parts > 1 ? `-${part}` : ""}`);
    expect.soft(escapes, "a part leaves its container").toEqual([]);
    expect.soft(looks.differences(), "a component's properties differ from page to page").toEqual([]);
    expect.soft(looks.pixelDifferences(), "a component's picture differs from page to page").toEqual([]);
  });
}
