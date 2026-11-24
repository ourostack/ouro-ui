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
      // The incoming panel: the one not ending. Its slide is how far its translate still has to go.
      const coming = [...(popup?.querySelectorAll("[data-activation-direction]") ?? [])].find((el) => !el.hasAttribute("data-ending-style"));
      // Where the incoming panel sits inside the popup: its slide, read from where it is drawn.
      const tx = coming && r ? coming.getBoundingClientRect().left - r.left : null;
      window.__lab.samples.push(r ? { w: r.width, h: r.height, tx, same: popup === window.__lab.popup } : null);
      if (performance.now() - t0 < 700) requestAnimationFrame(sample);
    });
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
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
    await page.goto(`${base}#/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Platforms", exact: true }).click();
    await page.waitForTimeout(600);
    const { removed, samples } = await morph(page, next);
    const sized = samples.filter(Boolean);
    const first = sized[0];
    const last = sized.at(-1);
    const middle = sized.filter((s) => between(first.w, last.w, s.w) || between(first.h, last.h, s.h)).length;
    check(`${label}, Platforms to ${next}: the popup is never unmounted`, !removed && samples.every((s) => s && s.same), `${samples.filter((s) => !s || !s.same).length} frames without it`);
    check(`${label}, Platforms to ${next}: it changes size`, Math.abs(first.w - last.w) > 4 || Math.abs(first.h - last.h) > 4, `${Math.round(first.w)}×${Math.round(first.h)} to ${Math.round(last.w)}×${Math.round(last.h)}`);
    // The slide tracks the resize: at each frame both are the same share of the way there, within a fifth.
    if (!reduced) {
      const end = last.tx;
      const start = sized.findIndex((s) => s.tx !== null && Math.abs(s.tx - end) > 1);
      const tx0 = start >= 0 ? sized[start].tx - end : 0;
      let worst = 0;
      if (start >= 0)
        for (const s of sized.slice(start)) {
          const size = Math.abs(last.w - first.w) > Math.abs(last.h - first.h) ? (s.w - first.w) / (last.w - first.w) : (s.h - first.h) / (last.h - first.h);
          const slide = 1 - (s.tx - end) / tx0;
          worst = Math.max(worst, Math.abs(size - slide));
        }
      check(`${label}, Platforms to ${next}: the content's slide keeps pace with the resize`, start >= 0 && worst <= 0.2, start >= 0 ? `largest gap ${Math.round(worst * 100)}% of the way` : "no slide seen");
    }
    const moving = await page.evaluate(() => getComputedStyle(document.querySelector("[data-lab-panel]")).transitionProperty);
    if (reduced) check(`${label}, Platforms to ${next}: width and height do not transition`, !/width|height/.test(moving), `transition-property: ${moving}; ${middle} frames read between, as the new panel is measured`);
    else check(`${label}, Platforms to ${next}: the size passes through in-between values`, middle >= 1 && /width/.test(moving) && /height/.test(moving), `${middle} frames between; transition-property: ${moving}`);
  }
  await context.close();
}

// The phone's switch: the thumb starts moving in the frame after the press and glides; the pressed label turns only as
// the thumb lands; the list crossfades with no instant swap. With reduced motion the thumb does not slide.
for (const reduced of [false, true]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  const label = reduced ? "reduced motion" : "full motion";
  await page.goto(`${base}#/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.waitForTimeout(900);
  const frames = await page.evaluate(async () => {
    const thumb = document.querySelector("[data-lab-thumb]");
    const part = [...document.querySelectorAll('[role="radio"]')].find((el) => el.getAttribute("aria-checked") === "false");
    const pane = document.querySelector(`[data-lab-pane="${part.textContent.trim() === "By part" ? "part" : "platform"}"]`);
    const rows = [];
    const t0 = performance.now();
    part.click();
    await new Promise((done) =>
      requestAnimationFrame(function sample() {
        rows.push({
          t: performance.now() - t0,
          x: thumb.getBoundingClientRect().left,
          shown: getComputedStyle(thumb).display !== "none",
          color: getComputedStyle(part).color,
          opacity: parseFloat(getComputedStyle(pane).opacity),
        });
        if (performance.now() - t0 < 600) requestAnimationFrame(sample);
        else done();
      }),
    );
    return rows;
  });
  const xs = frames.map((f) => f.x);
  const x0 = xs[0];
  const x1 = xs.at(-1);
  const moved = (f) => Math.abs(f.x - x0) > 1;
  const arrived = frames.findIndex((f) => Math.abs(f.x - x1) < 1);
  const firstMove = frames.findIndex(moved);
  const between = xs.filter((x) => x > Math.min(x0, x1) + 2 && x < Math.max(x0, x1) - 2).length;
  const finalColor = frames.at(-1).color;
  const colorTurned = frames.findIndex((f) => f.color === finalColor);
  const fades = frames.filter((f) => f.opacity > 0.05 && f.opacity < 0.95).length;
  if (reduced) {
    check(`phone switch, ${label}: the thumb does not slide`, !frames[0].shown || between === 0, `${between} frames between`);
  } else {
    check(`phone switch, ${label}: the thumb moves within two frames of the press`, firstMove >= 0 && firstMove <= 2, `first moved in frame ${firstMove}`);
    check(`phone switch, ${label}: it glides`, between >= 4, `${between} frames between the two sides`);
    check(`phone switch, ${label}: the label turns as the thumb lands, not before`, colorTurned >= Math.max(1, arrived - 4), `colour settled in frame ${colorTurned}, thumb landed in frame ${arrived}`);
  }
  check(`phone switch, ${label}: the list crossfades`, fades >= 2, `${fades} frames part-faded`);
  await context.close();
}

// The recording: Platforms, then across to Parts, Proof and Docs and back, then away.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
await page.goto(`${base}#/`, { waitUntil: "networkidle" });
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

// The phone recording: open the menu, switch to By part and back.
const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: out, size: { width: 390, height: 844 } } });
const phone = await phoneContext.newPage();
await phone.goto(`${base}#/`, { waitUntil: "networkidle" });
await phone.waitForTimeout(800);
await phone.getByRole("button", { name: "Menu" }).tap();
await phone.waitForTimeout(1200);
for (const name of ["By part", "By platform", "By part", "By platform"]) {
  await phone.getByRole("radio", { name }).tap();
  await phone.waitForTimeout(1300);
}
const phoneVideo = phone.video();
await phoneContext.close();
await rename(await phoneVideo.path(), `${out}/switch.webm`);
await browser.close();

console.log(results.join("\n"));
if (results.some((line) => line.startsWith("FAIL"))) process.exitCode = 1;
