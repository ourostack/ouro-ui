import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { describe, LOOK_SELECTOR, Looks, quiet, settled } from "../e2e/looks";

// The routes the sameness sweep's WebKit parts spend longest on, and one ordinary docs page beside them for contrast.
const ROUTES = ["/nautilus/", "/docs/", "/docs/a2ui-surface/", "/docs/button/"];

for (const path of ROUTES) {
  test(`where ${path} spends its time`, async ({ page, context }, info) => {
    await context.tracing.start({ screenshots: false, snapshots: false });
    const marks: Record<string, number> = {};
    let t = Date.now();
    const lap = (name: string) => {
      marks[name] = Date.now() - t;
      t = Date.now();
    };
    await page.goto(path);
    lap("goto");
    await page.waitForLoadState("load");
    lap("load");
    await page.evaluate(() => document.fonts.ready);
    lap("fonts");
    const reads: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await page.evaluate(describe, { selector: LOOK_SELECTOR });
      reads.push(Date.now() - start);
    }
    const facts = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const resources = performance
        .getEntriesByType("resource")
        .map((r) => ({ name: r.name.replace(location.origin, ""), ms: Math.round(r.duration), bytes: (r as PerformanceResourceTiming).transferSize }))
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 5);
      const images = [...document.images];
      return {
        nodes: document.getElementsByTagName("*").length,
        height: document.documentElement.scrollHeight,
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        loadEvent: Math.round(nav.loadEventEnd),
        images: images.length,
        imagePixels: images.reduce((sum, img) => sum + img.naturalWidth * img.naturalHeight, 0),
        resources,
      };
    });
    await context.tracing.stop({ path: info.outputPath(`${path.replace(/\W+/g, "-")}.zip`) });
    console.log(`PROFILE webkit ${path}: ${JSON.stringify({ marks, describeReadsMs: reads, ...facts })}`);
    expect(reads.length).toBe(3);
  });
}

// What one picture of the sweep costs, step by step, on the routes whose pictures take longest.
for (const path of ["/docs/card/", "/docs/a2ui-surface/"]) {
  test(`what a picture on ${path} costs`, async ({ page }) => {
    await page.goto(path);
    await settled(page);
    await quiet(page);
    const { looks: found } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
    const looks = new Looks();
    const spent: Record<string, number> = { handle: 0, scroll: 0, clear: 0, screenshot: 0, attributes: 0, decode: 0 };
    let pictures = 0;
    let bytes = 0;
    let pixels = 0;
    for (const look of found) {
      if (!(look.pictured && looks.wants(look))) {
        looks.add(path, look, null);
        continue;
      }
      let t = Date.now();
      const lap = (name: string) => {
        spent[name] += Date.now() - t;
        t = Date.now();
      };
      const handle = await page.locator(`[data-sweep-look="${look.index}"]`).elementHandle({ timeout: 2_000 }).catch(() => null);
      lap("handle");
      if (!handle) continue;
      await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })).catch(() => {});
      lap("scroll");
      await handle.evaluate((el) => document.elementFromPoint(el.getBoundingClientRect().left + 2, el.getBoundingClientRect().top + 2) !== null).catch(() => false);
      lap("clear");
      const png = await handle.screenshot({ animations: "disabled", caret: "hide", timeout: 15_000 }).catch(() => null);
      lap("screenshot");
      await handle.evaluate((el) => [...el.attributes].map((a) => a.name).join(" ")).catch(() => null);
      lap("attributes");
      if (!png) continue;
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      lap("decode");
      looks.add(path, look, { data, width: info.width, height: info.height, scale: 1 });
      pictures += 1;
      bytes += png.length;
      pixels += info.width * info.height;
    }
    console.log(`PROFILE webkit picture ${path}: ${JSON.stringify({ looks: found.length, pictures, pngBytes: bytes, pixels, spentMs: spent })}`);
    expect(pictures).toBeGreaterThan(0);
  });
}

// Cheaper ways to take the same picture, each judged by the time it takes and by whether its pixels equal the sweep's own.
for (const path of ["/docs/card/", "/docs/a2ui-surface/"]) {
  test(`which picture on ${path} costs least`, async ({ page }) => {
    await page.goto(path);
    await settled(page);
    await quiet(page);
    const { looks: found } = await page.evaluate(describe, { selector: LOOK_SELECTOR });
    const looks = new Looks();
    const spent = { sweep: 0, allowed: 0, clip: 0 };
    const same = { allowed: 0, clip: 0 };
    let compared = 0;
    const raw = async (png: Buffer) => (await sharp(png).ensureAlpha().raw().toBuffer()).toString("base64");
    for (const look of found) {
      if (!(look.pictured && looks.wants(look))) {
        looks.add(path, look, null);
        continue;
      }
      const handle = await page.locator(`[data-sweep-look="${look.index}"]`).elementHandle({ timeout: 2_000 }).catch(() => null);
      if (!handle) continue;
      await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })).catch(() => {});
      let t = Date.now();
      const base = await handle.screenshot({ animations: "disabled", caret: "hide", timeout: 15_000 }).catch(() => null);
      spent.sweep += Date.now() - t;
      t = Date.now();
      const allowed = await handle.screenshot({ animations: "allow", caret: "initial", timeout: 15_000 }).catch(() => null);
      spent.allowed += Date.now() - t;
      const box = await handle.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      t = Date.now();
      const clip = await page.screenshot({ clip: box, animations: "allow", caret: "initial", timeout: 15_000 }).catch(() => null);
      spent.clip += Date.now() - t;
      if (!base || !allowed || !clip) continue;
      compared += 1;
      const b = await raw(base);
      if (b === (await raw(allowed))) same.allowed += 1;
      if (b === (await raw(clip))) same.clip += 1;
      looks.add(path, look, { data: Buffer.alloc(0), width: 0, height: 0, scale: 1 });
    }
    console.log(`PROFILE webkit variants ${path}: ${JSON.stringify({ compared, spentMs: spent, samePixels: same })}`);
    expect(compared).toBeGreaterThan(0);
  });
}
