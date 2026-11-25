import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { describe, LOOK_SELECTOR, Looks, picture, quiet, routeGuard, routes, settled } from "./looks";

// A component looks the same wherever it appears. Every page of the build is opened, in each colour mode, in
// each engine; every Ouro element is keyed by its item, part, element, variant and state, and what makes up
// its look (shape, box, padding, gap, colours, font, shadow, opacity, transform and the geometry of its
// children) is compared across pages, and so is a picture of it with its text hidden. An instance that
// differs from the one the rest share is a page-level rule changing a component. A part that must sit inside
// its container (a switch's thumb in its track, a radio's dot in its circle) does. Each part saves its looks and
// scripts/sweeps-compare.mjs compares the parts with each other, so the comparison covers every page whatever part it is in.

const LOOKS_DIR = ".tmp/looks";

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
    const spent = { navigate: 0, settle: 0, picture: 0, pictures: 0, ready: 0, reads: 0, read: 0, quiet: 0 };
    const perRoute: [string, number, string][] = [];
    for (const path of pages) {
      const routeStart = Date.now();
      const before = { ...spent };
      await guard.visit(path, async (page) => {
        let t = Date.now();
        await page.goto(path);
        spent.navigate += Date.now() - t;
        t = Date.now();
        const waited = await settled(page);
        const quietAt = Date.now();
        await quiet(page);
        spent.quiet += Date.now() - quietAt;
        spent.ready += waited.ready;
        spent.reads += waited.reads.length;
        spent.read += waited.reads.reduce((sum, ms) => sum + ms, 0);
        spent.settle += Date.now() - t;
        t = Date.now();
        const { looks: found, escapes: out } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
        escapes.push(...out.map((e) => `${path}: ${e}`));
        for (const look of found) {
          const wanted = look.pictured && looks.wants(look);
          if (wanted) spent.pictures += 1;
          looks.add(path, look, wanted ? await picture(page, look.index, look.attributes) : null);
        }
        spent.picture += Date.now() - t;
      });
      perRoute.push([path, Date.now() - routeStart, `navigate ${spent.navigate - before.navigate}, settle ${spent.settle - before.settle}, pictures ${spent.picture - before.picture} ms for ${spent.pictures - before.pictures}`]);
    }
    const slowest = perRoute.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, ms, phases]) => `${path} ${ms} (${phases})`).join(", ");
    console.log(`TIMING ${browserName} ${mode} part ${part}: navigate ${spent.navigate} ms, settle ${spent.settle} ms (hydration ${spent.ready}, ${spent.reads} reads taking ${spent.read}, quiet ${spent.quiet}), describe and ${spent.pictures} pictures ${spent.picture} ms, over ${pages.length} routes; slowest: ${slowest}`);
    console.log(`${browserName} ${mode}: ${looks.keys} component states, ${looks.crops} pictures, over ${pages.length} pages`);
    for (const f of escapes) console.log(`FINDING ${browserName} ${mode}: ${f}`);
    // The looks are compared across every part by one job (scripts/sweeps-compare.mjs), so a route that moves a page to
    // another part cannot change what is compared and this part judges only what it sees alone.
    mkdirSync(LOOKS_DIR, { recursive: true });
    writeFileSync(`${LOOKS_DIR}/sameness-${mode}-${engine}-${part}of${parts}.json`, JSON.stringify({ mode, engine, part, parts, looks: await looks.save() }));
    expect.soft(guard.skipped.length, `routes skipped as too slow: ${guard.skipped.join(", ")}`).toBeLessThanOrEqual(3);
    expect.soft(escapes, "a part leaves its container").toEqual([]);
  });
}
