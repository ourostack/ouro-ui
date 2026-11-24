// Checks Compass (B) morphs between panels rather than closing and opening, and records it:
//   node site/nav-lab/morph.mjs <base url> [out folder]
// Moving from Platforms to Parts, Proof and Docs, the popup must stay the same element (never unmounted) and its size
// must pass through values between the old panel's and the new one's. With reduced motion its size must jump: no
// in-between values. Writes morph.webm, a recording on a laptop.
import { mkdir, rename } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [base, out = ".tmp/nav-morph"] = process.argv.slice(2);
if (!base) throw new Error("Usage: node site/nav-lab/morph.mjs <base url> [out folder]");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "pass" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);

/** Opens Platforms, then moves the pointer onto `next`, sampling the popup's size every frame for 700 ms. */
async function morph(page, next) {
  const trigger = (name) => page.getByRole("button", { name, exact: true });
  await page.evaluate(() => {
    window.__lab = { removed: false, samples: [] };
    const popup = document.querySelector("[data-lab-panel]");
    window.__lab.popup = popup;
    new MutationObserver(() => {
      if (!popup.isConnected) window.__lab.removed = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const box = await trigger(next).boundingBox();
  await page.evaluate(() => {
    const t0 = performance.now();
    requestAnimationFrame(function sample() {
      const popup = document.querySelector("[data-lab-panel]");
      const r = popup?.getBoundingClientRect();
      window.__lab.samples.push(r ? { w: r.width, h: r.height, same: popup === window.__lab.popup } : null);
      if (performance.now() - t0 < 700) requestAnimationFrame(sample);
    });
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await page.waitForTimeout(800);
  return page.evaluate(() => ({ removed: window.__lab.removed, samples: window.__lab.samples }));
}

const between = (a, b, x) => x > Math.min(a, b) + 2 && x < Math.max(a, b) - 2;

for (const reduced of [false, true]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  const label = reduced ? "reduced motion" : "full motion";
  for (const next of ["Parts", "Proof", "Docs"]) {
    await page.goto("about:blank");
    await page.goto(`${base}?m=b#/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Platforms", exact: true }).click();
    await page.waitForTimeout(600);
    const { removed, samples } = await morph(page, next);
    const sized = samples.filter(Boolean);
    const first = sized[0];
    const last = sized.at(-1);
    const middle = sized.filter((s) => between(first.w, last.w, s.w) || between(first.h, last.h, s.h)).length;
    check(`${label}, Platforms to ${next}: the popup is never unmounted`, !removed && samples.every((s) => s && s.same), `${samples.filter((s) => !s || !s.same).length} frames without it`);
    check(`${label}, Platforms to ${next}: it changes size`, Math.abs(first.w - last.w) > 4 || Math.abs(first.h - last.h) > 4, `${Math.round(first.w)}×${Math.round(first.h)} to ${Math.round(last.w)}×${Math.round(last.h)}`);
    if (reduced) check(`${label}, Platforms to ${next}: no in-between sizes`, middle === 0, `${middle} frames between`);
    else check(`${label}, Platforms to ${next}: the size passes through in-between values`, middle >= 3, `${middle} frames between`);
  }
  await context.close();
}

// The recording: Platforms, then across to Parts, Proof and Docs and back, then away.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
await page.goto(`${base}?m=b#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const at = async (name) => {
  const box = await page.getByRole("button", { name, exact: true }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
};
await at("Platforms");
await page.waitForTimeout(1300);
for (const name of ["Parts", "Proof", "Docs", "Proof", "Parts", "Platforms"]) {
  await at(name);
  await page.waitForTimeout(1100);
}
await page.mouse.move(700, 880, { steps: 12 });
await page.waitForTimeout(1200);
const video = page.video();
await context.close();
await rename(await video.path(), `${out}/morph.webm`);
await browser.close();

console.log(results.join("\n"));
if (results.some((line) => line.startsWith("FAIL"))) process.exitCode = 1;
