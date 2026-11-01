import { expect, test, type Page } from "@playwright/test";
import { CATALOGUE } from "../src/voyage/chapters/chapter-two-copy";
import { measure, summarise } from "./latency";

// PROBE (never merge): the museum press under CSS variants, with a trace of where its time goes.
const SLEEK_SHADOWS = `html[data-theme="pearl"]:not(.dark) {
  --shadow-xs: 0 1px 2px oklch(0.19 0.02 250 / 0.06);
  --shadow-sm: 0 1px 2px oklch(0.19 0.02 250 / 0.06), 0 1px 3px oklch(0.19 0.02 250 / 0.08);
  --shadow-md: 0 2px 4px -1px oklch(0.19 0.02 250 / 0.06), 0 4px 12px -2px oklch(0.19 0.02 250 / 0.1);
  --shadow-lg: 0 4px 6px -2px oklch(0.19 0.02 250 / 0.05), 0 14px 32px -8px oklch(0.19 0.02 250 / 0.18);
  --shadow-xl: 0 8px 16px -6px oklch(0.19 0.02 250 / 0.08), 0 30px 64px -16px oklch(0.19 0.02 250 / 0.3);
}`;
const VARIANTS: Record<string, string> = {
  plain: "",
  gutter: "html { scrollbar-gutter: stable }",
  shadows: SLEEK_SHADOWS,
  font: `html[data-theme="pearl"] { --font-heading: "Geist", ui-sans-serif, system-ui, sans-serif }`,
};
const only = (process.env["VARIANTS"] ?? Object.keys(VARIANTS).join(",")).split(",");

async function open(page: Page): Promise<void> {
  await page.goto("nautilus/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("#chapter-two").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-two[data-chapter-ready]")).toBeAttached();
}

const museum = (page: Page) => page.locator("[data-composition='catalogue']").getByRole("button", { name: CATALOGUE.museum });

for (const variant of only) {
  test(`museum probe ${variant}`, async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    if (VARIANTS[variant]) await page.addStyleTag({ content: VARIANTS[variant] });
    const widths = [await page.evaluate(() => document.documentElement.clientWidth)];
    const samples = await measure(page, `museum ${variant}`, {
      press: () => museum(page).click(),
      setUp: async (index) => {
        if (index > 0) await page.keyboard.press("Escape");
      },
    });
    widths.push(await page.evaluate(() => document.documentElement.clientWidth));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Six traced presses at the same throttle: where the time goes.
    const cdp = await page.context().newCDPSession(page);
    await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "viz", "gpu"] });
    for (let index = 0; index < 6; index++) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await museum(page).click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await page.keyboard.press("Escape");
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
    }
    const trace = JSON.parse((await browser.stopTracing()).toString());
    const events = trace.traceEvents as { ph: string; name: string; dur?: number; pid: number; tid: number; args?: { name?: string } }[];
    const threads = new Map(events.filter((e) => e.ph === "M" && e.name === "thread_name").map((e) => [`${e.pid}:${e.tid}`, e.args?.name ?? "?"]));
    const sums: Record<string, number> = {};
    for (const e of events) {
      if (e.ph !== "X" || !e.dur) continue;
      const thread = (threads.get(`${e.pid}:${e.tid}`) ?? "?").replace(/\d+$/, "");
      const key = /CrRendererMain/.test(thread) && ["UpdateLayoutTree", "Layout", "PrePaint", "Paint", "Layerize", "Commit", "FunctionCall", "EventDispatch", "HitTest"].includes(e.name) ? `main ${e.name}` : /Raster|CompositorTileWorker/.test(thread) && /RasterTask|TileTask/.test(e.name) ? "raster" : /VizCompositor/.test(thread) && e.name === "Display::DrawAndSwap" ? "viz DrawAndSwap" : null;
      if (key) sums[key] = (sums[key] ?? 0) + e.dur / 1000 / 6;
    }
    const { report } = summarise(samples, 72);
    console.log(`probe ${variant}: widths ${widths.join("->")}; ${report.replace(/; samples.*/, "")}; per press: ${Object.entries(sums).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}`);
  });
}
