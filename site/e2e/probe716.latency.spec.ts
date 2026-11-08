import { test } from "@playwright/test";

// Probe for #716: how long a fixed chunk of main-thread work takes, unthrottled, and whether a 4x throttled one sees the same factor.
test("probe716 CPU benchmark", async ({ page }) => {
  await page.goto("./");
  const run = (rate: number) =>
    page.evaluate(() => {
      const times: number[] = [];
      for (let r = 0; r < 9; r++) {
        const t = performance.now();
        let x = 0;
        for (let i = 0; i < 4_000_000; i++) x = (x + Math.sqrt(i) * 3.1) % 1e9;
        (window as unknown as { __x: number }).__x = x;
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return { min: times[0]!, median: times[4]!, max: times[8]! };
    }).then((r) => ({ rate, ...r }));
  const cdp = await page.context().newCDPSession(page);
  const quiet = await run(1);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const slow = await run(4);
  console.log(`PROBE work unthrottled min/median/max ${quiet.min.toFixed(1)}/${quiet.median.toFixed(1)}/${quiet.max.toFixed(1)} ms; at 4x ${slow.min.toFixed(1)}/${slow.median.toFixed(1)}/${slow.max.toFixed(1)} ms`);
});
