import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";
import { Builder } from "selenium-webdriver";

// Probe: the squircle polyfill's idle work and typing latency in real Safari, which draws no native corner-shape
// (Playwright's WebKit does, so it never runs the fallback). Run by .github/workflows/safari-squircle.yml on a macOS runner.
const url = process.env.SQUIRCLE_URL ?? "https://ui.ouroboros.bot/docs/text-field/";
const budget = Number(process.env.SQUIRCLE_TYPING_P95_MS ?? 33);

const result = await build({
  configFile: false,
  logLevel: "silent",
  build: { write: false, minify: false, lib: { entry: resolve("registry/ouro/lib/ouro/squircle/register.ts"), formats: ["iife"], name: "ouroSquircle" } },
});
const engine = (Array.isArray(result) ? result[0] : result).output.find((chunk) => chunk.type === "chunk").code;

const instrument = `
window.__c = { raf: 0, mo: 0, moRecords: 0, ro: 0, roEntries: 0, io: 0, events: {}, records: {} };
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) => { window.__c.raf++; return raf(cb); };
const MO = window.MutationObserver;
window.MutationObserver = class extends MO { constructor(cb) { super((r, o) => { window.__c.mo++; window.__c.moRecords += r.length; for (const x of r) { const k = x.type + ":" + (x.attributeName ?? "") + ":" + (x.target.tagName || ""); window.__c.records[k] = (window.__c.records[k] || 0) + 1; } cb(r, o); }); } };
const RO = window.ResizeObserver;
window.ResizeObserver = class extends RO { constructor(cb) { super((e, o) => { window.__c.ro++; window.__c.roEntries += e.length; cb(e, o); }); } };
const IO = window.IntersectionObserver;
window.IntersectionObserver = class extends IO { constructor(cb, o) { super((e, ob) => { window.__c.io++; cb(e, ob); }, o); } };
for (const t of ["transitionrun", "transitionend", "animationend", "animationstart"]) document.addEventListener(t, (e) => { const k = t + ":" + (e.propertyName || e.animationName); window.__c.events[k] = (window.__c.events[k] || 0) + 1; }, true);
const supports = CSS.supports.bind(CSS);
CSS.supports = (p, v) => (String(p).includes("corner-shape") ? false : v === undefined ? supports(p) : supports(p, v));
`;
const guard = `for (const t of ["transitionrun", "transitionend"]) document.addEventListener(t, (e) => { if (/^(border-.*-color|outline-color|box-shadow)$/.test(e.propertyName)) e.stopImmediatePropagation(); }, true);`;

// Main-thread busyness at rest: how late a 10 ms timer fires, summed over the window.
const rest = `const done = arguments[arguments.length - 1]; const start = performance.now(); let late = 0, ticks = 0, last = start;
const id = setInterval(() => { const now = performance.now(); late += Math.max(0, now - last - 10); ticks++; last = now; }, 10);
const before = JSON.parse(JSON.stringify(window.__c));
setTimeout(() => { clearInterval(id); const secs = (performance.now() - start) / 1000; const after = JSON.parse(JSON.stringify(window.__c));
  const per = (a, b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === "number" ? +((v - a[k]) / secs).toFixed(2) : Object.fromEntries(Object.entries(v).map(([kk, n]) => [kk, +((n - (a[k][kk] || 0)) / secs).toFixed(2)]).filter(([, n]) => n))]));
  done({ secs, lateMsPerSec: +(late / secs).toFixed(1), ticksPerSec: +(ticks / secs).toFixed(1), perSecond: per(before, after) }); }, 5000);`;

const typing = `const done = arguments[arguments.length - 1]; const field = document.querySelector('input[type=email], input[type=text], input:not([type])'); field.focus();
const samples = []; const channel = new MessageChannel();
const settle = () => new Promise((r) => requestAnimationFrame(() => { channel.port2.onmessage = () => r(); channel.port1.postMessage(0); }));
(async () => { for (let i = 0; i < 60; i++) { const t = performance.now(); document.execCommand("insertText", false, "a"); await settle(); samples.push(performance.now() - t); await new Promise((r) => setTimeout(r, 30)); }
  samples.sort((a, b) => a - b); done({ p50: +samples[30].toFixed(1), p95: +samples[Math.floor(samples.length * 0.95)].toFixed(1), max: +samples[samples.length - 1].toFixed(1) }); })();`;

async function measure(withPolyfill) {
  const driver = await new Builder().forBrowser("safari").build();
  try {
    await driver.manage().setTimeouts({ script: 60000, pageLoad: 60000 });
    await driver.get(url);
    await driver.wait(async () => driver.executeScript("return document.documentElement.hasAttribute('data-site-ready')"), 30000);
    await driver.executeScript(instrument);
    const native = await driver.executeScript("return [navigator.userAgent, CSS.supports('corner-shape','squircle')]");
    if (withPolyfill) {
      await driver.executeScript(guard);
      await driver.executeScript(`${engine}\n;ouroSquircle.registerHyperellipse();`);
      await driver.sleep(3000);
    }
    const hosts = await driver.executeScript("return document.querySelectorAll('[data-hyperellipse-host]').length");
    const idle = await driver.executeAsyncScript(rest);
    const typed = await driver.executeAsyncScript(typing);
    return { withPolyfill, userAgent: native[0], supportsCornerShape: native[1], hosts, idle, typing: typed };
  } finally {
    await driver.quit();
  }
}

const off = await measure(false);
const on = await measure(true);
const report = { url, budget, off, on };
mkdirSync("safari-squircle", { recursive: true });
writeFileSync(`safari-squircle/report-${new URL(url).pathname.replace(/\W+/g, "_")}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (process.env.SQUIRCLE_ENFORCE === "1" && on.typing.p95 > budget) {
  console.error(`typing p95 with the polyfill is ${on.typing.p95} ms, over the ${budget} ms budget`);
  process.exit(1);
}
