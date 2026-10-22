// Diagnostic only (branch diag/webkit-frames): how long Chapter III's menu takes to close in WebKit once the squid is beaten.
import { chromium, webkit } from "@playwright/test";
const [base, label] = [process.argv[2], process.argv[3]];
const record = (page) => page.evaluate(() => { const w = window; w.__long = []; let last = performance.now(); const tick = (now) => { if (now - last > 40) w.__long.push(Math.round(now - last)); last = now; w.__raf = requestAnimationFrame(tick); }; w.__raf = requestAnimationFrame(tick); });
const longs = (page) => page.evaluate(() => { cancelAnimationFrame(window.__raf); const l = window.__long; return `${l.length}x sum ${l.reduce((a, b) => a + b, 0)} max ${Math.max(0, ...l)}`; });
if (label !== "branch") process.exit(0);
for (const type of [webkit, chromium]) {
  const browser = await type.launch();
  for (const motion of ["no-preference", "reduce"]) {
    for (let round = 0; round < 2; round++) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto(base + "voyage/");
      await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
      await page.locator("#chapter-three").scrollIntoViewIfNeeded();
      await page.locator("#chapter-three[data-chapter-ready]").waitFor({ state: "attached" });
      await page.waitForTimeout(500);
      const row = [];
      for (const name of ["Surface", "Ready the axes"]) {
        const t0 = Date.now();
        await page.locator("#chapter-three").getByRole("button", { name: "Orders", exact: true }).click();
        const t1 = Date.now();
        await record(page);
        await page.getByRole("menu").getByRole("menuitem", { name, exact: true }).click();
        const t2 = Date.now();
        await page.getByRole("menu").waitFor({ state: "hidden", timeout: 30000 }).catch(() => row.push("NEVER HID"));
        const t3 = Date.now();
        row.push(`${name}: open ${t1 - t0} pick ${t2 - t1} hide ${t3 - t2} long ${await longs(page)} anims ${await page.evaluate(() => document.getAnimations().map((a) => `${a.animationName ?? a.transitionProperty ?? "?"}:${a.playState}`).join(","))}`);
      }
      console.log(`${label} ${type.name()} ${motion} #${round}: ${row.join(" | ")}`);
      await page.close();
    }
  }
  await browser.close();
}
