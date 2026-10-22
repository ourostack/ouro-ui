// Diagnostic only (branch diag/webkit-frames): what the page does, frame by frame, when the bell's toast covers the bell.
import { expect, test } from "@playwright/test";
import { STAGE_COPY } from "../src/voyage/stage/copy";

test("bell debug", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: test.info().project.use.baseURL! });
  const page = await context.newPage();
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  const bell = page.getByRole("button", { name: STAGE_COPY.bell });
  await bell.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await page.evaluate(() => {
    const out: string[] = [];
    (window as unknown as { trace: string[] }).trace = out;
    const t0 = performance.now();
    let calls = 0;
    const scrollBy = window.scrollBy.bind(window);
    (window as unknown as { scrollBy: unknown }).scrollBy = (...args: unknown[]) => { calls++; out.push(`scrollBy@${Math.round(performance.now() - t0)} ${JSON.stringify(args)}`); return (scrollBy as (...a: unknown[]) => void)(...args); };
    addEventListener("scroll", () => out.push(`scroll@${Math.round(performance.now() - t0)} y${Math.round(scrollY)}`), { passive: true });
    const tick = () => {
      const b = document.querySelector("[data-stage-control='bell'] button")?.getBoundingClientRect();
      const toast = document.querySelector<HTMLElement>('[data-ouro="toast"]');
      const r = toast?.getBoundingClientRect();
      out.push(`f@${Math.round(performance.now() - t0)} y${Math.round(scrollY)} bell${Math.round(b?.bottom ?? -1)} toast${r ? Math.round(r.top) : "-"}${toast?.hasAttribute("data-starting-style") ? "S" : ""}${toast?.hasAttribute("data-ending-style") ? "E" : ""}${toast ? "a" + toast.getAnimations().length : ""} calls${calls}`);
      if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await bell.tap();
  await page.waitForTimeout(4200);
  const trace = await page.evaluate(() => (window as unknown as { trace: string[] }).trace);
  const last = trace.filter((line) => line.startsWith("f@")).at(-1) ?? "";
  const m = /bell(-?\d+) toast(-?\d+)/.exec(last);
  const covered = m ? Number(m[1]) > Number(m[2]) : true;
  console.log(`BELL ${covered ? "COVERED" : "clear"} ${last}`);
  if (covered || test.info().repeatEachIndex === 0) console.log(`BELLTRACE ${trace.join(" | ")}`);
  await context.close();
});
