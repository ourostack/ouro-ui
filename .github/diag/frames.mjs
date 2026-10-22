// Diagnostic only (branch diag/webkit-frames): what a pointer press costs WebKit on /voyage/, and where.
import { chromium, webkit } from "@playwright/test";
const [base, label] = [process.argv[2], process.argv[3]];
const VARIANTS = { asis: "", nosvg: "main svg { display: none !important; }" };
const arm = (page) => page.evaluate(() => {
  const w = window;
  w.__probe = [];
  for (const type of ["pointerdown", "pointerup", "click", "focusin"]) {
    window.addEventListener(type, () => {
      const t0 = performance.now();
      setTimeout(() => {
        const t1 = performance.now();
        void document.body.offsetHeight;
        const t2 = performance.now();
        requestAnimationFrame(() => {
          const t3 = performance.now();
          requestAnimationFrame(() => w.__probe.push(`${type} js ${Math.round(t1 - t0)} style+layout ${Math.round(t2 - t1)} toframe ${Math.round(t3 - t2)} frame ${Math.round(performance.now() - t3)}`));
        });
      }, 0);
    }, { capture: true, once: true });
  }
});
const read = (page) => page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__probe.join(", ")), 1200)));
if (label !== "branch") process.exit(0);
for (const type of [webkit, chromium]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && name !== "asis") continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "voyage/");
    await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
    if (css) await page.addStyleTag({ content: css });
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(800);
    const targets = {
      text: page.locator("#chapter-two h2").first(),
      handle: page.getByRole("button", { name: /^Reorder Vigo/ }),
      code: page.locator("#chapter-two").getByRole("button", { name: /Code/ }).first(),
    };
    for (const [target, locator] of Object.entries(targets)) {
      const box = await locator.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(400);
      await arm(page);
      const t0 = Date.now();
      await page.mouse.down();
      const t1 = Date.now();
      await page.mouse.up();
      const t2 = Date.now();
      console.log(`${type.name()} ${name} ${target}: down ${t1 - t0} up ${t2 - t1} | ${await read(page)}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
    await page.close();
  }
  await browser.close();
}
