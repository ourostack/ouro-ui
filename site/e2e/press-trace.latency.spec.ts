// PROBE (never merge): a Chromium trace around each press of museum and organ, at the latency job's
// 4x throttle, summarised per press: where the main thread, the compositor, raster and viz spent it.
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { cpus } from "node:os";
import { expect, test, type Page } from "@playwright/test";
import { CATALOGUE } from "../src/voyage/chapters/chapter-two-copy";
import { ENCOUNTER, ORDERS, SALOON } from "../src/voyage/chapters/chapter-three-copy";

const OUT = process.env["PROBE_OUT"] ?? "probe-out";
const THROTTLE = 4;
const WARMUPS = 2;
const SAMPLES = Number(process.env["PROBE_SAMPLES"] ?? 20);
const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "toplevel",
  "v8.execute",
  "blink.user_timing",
  "latencyInfo",
  "viz",
  "disabled-by-default-v8.cpu_profiler",
];

async function open(page: Page, chapter: string): Promise<void> {
  await page.goto("nautilus/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator(`#${chapter}`).scrollIntoViewIfNeeded();
  await expect(page.locator(`#${chapter}[data-chapter-ready]`)).toBeAttached();
}

const encounter = (page: Page) => page.locator("[data-composition='encounter']");
const saloon = (page: Page) => page.locator("[data-composition='saloon']");
async function giveOrder(page: Page, name: string): Promise<void> {
  await encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("menu")).toBeHidden();
}

type Step = (page: Page, index: number) => Promise<unknown>;
const CONTROLS: Record<string, { chapter: string; press: Step; before?: Step; after?: Step }> = {
  museum: {
    chapter: "chapter-two",
    press: (page) => page.locator("[data-composition='catalogue']").getByRole("button", { name: CATALOGUE.museum }).click(),
    after: (page) => page.keyboard.press("Escape"),
  },
  organ: {
    chapter: "chapter-three",
    before: async (page) => {
      await giveOrder(page, ORDERS.surface);
      await giveOrder(page, ORDERS.feathers);
    },
    press: (page) => saloon(page).getByRole("button", { name: SALOON.play }).click(),
    after: (page) => saloon(page).getByRole("button", { name: SALOON.again }).click(),
  },
};

interface TraceEvent { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; cat: string; args?: Record<string, any> }

/** Per thread, self time by event name, and forced style and layout inside script. */
function summarise(events: TraceEvent[]) {
  const threads = new Map<string, string>();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") threads.set(`${e.pid}:${e.tid}`, e.args?.["name"]);
  const byThread = new Map<string, TraceEvent[]>();
  for (const e of events) if (e.ph === "X" && e.dur !== undefined) {
    const key = `${e.pid}:${e.tid}`;
    if (!byThread.has(key)) byThread.set(key, []);
    byThread.get(key)!.push(e);
  }
  const SCRIPT = new Set(["FunctionCall", "EventDispatch", "TimerFire", "FireAnimationFrame", "v8.callFunction", "RunMicrotasks", "V8.Execute"]);
  const threadsOut: Record<string, { busy: number; self: Record<string, number> }> = {};
  let forced = 0, forcedTime = 0;
  const paints: { w: number; h: number; dur: number }[] = [];
  for (const [key, list] of byThread) {
    const name = (threads.get(key) ?? key).replace(/\d+$/, "");
    list.sort((a, b) => a.ts - b.ts || b.dur! - a.dur!);
    const stack: { e: TraceEvent; child: number }[] = [];
    const out = (threadsOut[name] ??= { busy: 0, self: {} });
    const close = (until: number) => {
      while (stack.length && stack.at(-1)!.e.ts + stack.at(-1)!.e.dur! <= until) {
        const { e, child } = stack.pop()!;
        out.self[e.name] = (out.self[e.name] ?? 0) + Math.max(0, e.dur! - child) / 1000;
        if (stack.length) stack.at(-1)!.child += e.dur!;
        else out.busy += e.dur! / 1000;
      }
    };
    for (const e of list) {
      close(e.ts);
      if (name === "CrRendererMain" && (e.name === "Layout" || e.name === "UpdateLayoutTree") && stack.some((s) => SCRIPT.has(s.e.name))) { forced++; forcedTime += e.dur! / 1000; }
      if (name === "CrRendererMain" && e.name === "Paint") { const c = e.args?.["data"]?.["clip"]; if (c) paints.push({ w: Math.round(c[2] - c[0]), h: Math.round(c[5] - c[1]), dur: e.dur! / 1000 }); }
      stack.push({ e, child: 0 });
    }
    close(Infinity);
  }
  for (const t of Object.values(threadsOut)) t.self = Object.fromEntries(Object.entries(t.self).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, +v.toFixed(1)]));
  for (const t of Object.values(threadsOut)) t.busy = +t.busy.toFixed(1);
  // The JS profile: self time by function, from the renderer main thread's ProfileChunks.
  const nodes = new Map<number, { functionName: string; url: string; lineNumber: number; columnNumber: number }>();
  const selfByNode = new Map<number, number>();
  for (const e of events) if (e.name === "ProfileChunk") {
    const p = e.args?.["data"]?.["cpuProfile"];
    for (const n of p?.nodes ?? []) nodes.set(n.id, n.callFrame);
    const deltas: number[] = e.args?.["data"]?.["timeDeltas"] ?? [];
    (p?.samples ?? []).forEach((id: number, i: number) => selfByNode.set(id, (selfByNode.get(id) ?? 0) + (deltas[i + 1] ?? deltas[i] ?? 0) / 1000));
  }
  const fns = new Map<string, number>();
  for (const [id, ms] of selfByNode) { const f = nodes.get(id); if (!f) continue; const k = `${f.functionName || "(anon)"} ${f.url.replace(/^.*\//, "")}:${f.lineNumber}:${f.columnNumber}`; fns.set(k, (fns.get(k) ?? 0) + ms); }
  const js = Object.fromEntries([...fns].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, +v.toFixed(1)]));
  return { threads: threadsOut, forced, forcedTime: +forcedTime.toFixed(1), paints: paints.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 8), js };
}

test.describe("press traces", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium only");
  for (const [id, control] of Object.entries(CONTROLS)) {
    test(`${id} traced`, async ({ page, browser }) => {
      test.setTimeout(600_000);
      mkdirSync(OUT, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, control.chapter);
      await page.evaluate(() => {
        const store: number[] = [];
        (window as any).__latency = store;
        new PerformanceObserver((list) => { for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push(entry.duration); }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
      });
      const cdp = await page.context().newCDPSession(page);
      const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100)))));
      const summaries = [];
      for (let index = 0; index < WARMUPS + SAMPLES; index++) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        if (control.after && index > 0) await control.after(page, index - 1);
        if (control.before) await control.before(page, index);
        await settle();
        await browser.startTracing(page, { categories: CATEGORIES });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
        await page.evaluate(() => ((window as any).__latency.length = 0));
        await control.press(page, index);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
        const durations: number[] = await page.evaluate(() => (window as any).__latency);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        const buffer = await browser.stopTracing();
        const duration = durations.length ? Math.max(...durations) : 16;
        if (index < WARMUPS) continue;
        const events = (JSON.parse(buffer.toString()).traceEvents ?? JSON.parse(buffer.toString())) as TraceEvent[];
        const summary = { index, duration, ...summarise(events) };
        summaries.push(summary);
        if (index === WARMUPS || index === WARMUPS + 5 || index === WARMUPS + 10) writeFileSync(`${OUT}/${id}-${index}.json.gz`, gzipSync(buffer));
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      }
      writeFileSync(`${OUT}/${id}.json`, JSON.stringify({ cpu: cpus()[0]?.model, summaries }, null, 1));
      const sorted = summaries.map((s) => s.duration).toSorted((a, b) => a - b);
      console.log(`${id} on ${cpus()[0]?.model}: traced durations ${summaries.map((s) => s.duration).join(", ")}; p95 ${sorted[Math.ceil(sorted.length * 0.95) - 1]}`);
    });
  }
});
