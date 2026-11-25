import { expect, test } from "@playwright/test";
import { describe, LOOK_SELECTOR } from "../e2e/looks";

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
