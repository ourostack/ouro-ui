// Records the Springs story frame by frame on a held clock, so the recording runs at a true 60fps.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
const dir = new URL(process.env.REDUCED ? "./frames-reduced/" : "./frames/", import.meta.url).pathname;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const url = "http://localhost:6123/iframe.html?id=chat-messagelist--springs&viewMode=story" + (process.env.DARK ? "&globals=theme:dark" : "");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 560, height: 520 }, deviceScaleFactor: 2, reducedMotion: process.env.REDUCED ? "reduce" : "no-preference" });
  await page.goto(url);
  await page.waitForSelector("[data-ouro-message-list-scroller]");
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const queue = new Map();
    let id = 0;
    let time = performance.now();
    window.requestAnimationFrame = (callback) => (queue.set(--id, callback), id);
    window.cancelAnimationFrame = (handle) => queue.delete(handle);
    performance.now = () => time;
    const scroller = document.querySelector("[data-ouro-message-list-scroller]");
    // Where the pointer is, drawn for the recording only.
    const dot = document.createElement("div");
    const at = scroller.getBoundingClientRect();
    Object.assign(dot.style, { position: "fixed", left: `${at.left + at.width - 14}px`, top: `${at.top + at.height * 0.72 - 9}px`, width: "18px", height: "18px", borderRadius: "50%", background: "rgba(120,120,128,0.35)", border: "2px solid rgba(120,120,128,0.6)", pointerEvents: "none", zIndex: 9 });
    document.body.append(dot);
    window.__frame = (delta, y) => {
      if (delta !== 0) {
        const box = scroller.getBoundingClientRect();
        scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, clientY: box.top + box.height * y, bubbles: true }));
        scroller.scrollTop += delta;
        scroller.dispatchEvent(new Event("scroll"));
      }
      time += 1000 / 60;
      const due = [...queue];
      queue.clear();
      for (const [, callback] of due) callback(time);
      return scroller.scrollTop;
    };
  });
  const clip = await page.locator("[data-ouro-message-list-scroller]").boundingBox();
  const plan = [];
  const rest = (frames) => { for (let i = 0; i < frames; i++) plan.push(0); };
  // A fling: v0 px/s, slowing as momentum does (Apple's 0.998 per ms).
  const fling = (v0, frames) => { for (let i = 0; i < frames; i++) plan.push((v0 / 60) * Math.pow(0.998, (i * 1000) / 60)); };
  const steady = (v, frames) => { for (let i = 0; i < frames; i++) plan.push(v / 60); };
  rest(15);
  steady(-600, 50);
  rest(45);
  fling(-2600, 75);
  rest(45);
  fling(3600, 120);
  rest(70);
  let n = 0;
  let carry = 0;
  for (const exact of plan) {
    const want = exact + carry;
    const delta = Math.round(want);
    carry = want - delta;
    await page.evaluate(([d]) => window.__frame(d, 0.72), [delta]);
    await page.screenshot({ path: `${dir}/${String(n++).padStart(4, "0")}.png`, clip: { x: clip.x - 4, y: clip.y - 4, width: clip.width + 8, height: clip.height + 8 } });
  }
  console.log("frames", n);
} finally {
  await browser.close();
}
