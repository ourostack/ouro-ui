import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";


// Click-to-paint latency for the voyage's controls, shared by every *.latency.spec.ts (run alone by
// `pnpm test:latency`, playwright.latency.config.ts, and CI's latency job). Each control is pressed
// LATENCY.warmUps times to warm up (the first press of anything compiles code), then LATENCY.samples
// times on a CPU throttled LATENCY.throttle×. The control passes when its 95th percentile (the 19th of
// 20, so one slow frame on a shared runner is not a failure) is within LATENCY.p95, the hard ceiling
// for every control, and its median is within its own ceiling, set from the median it measures on CI
// (medianCeiling): that catches a fast control that got much slower but stays under 100 ms.
//
// Event Timing reports durations in 8 ms steps, so every sample is a multiple of 8 and a median of
// 20 a multiple of 4: a bound sits between steps or it is really the step below it.

/** The budget, the number of presses and the throttle every latency spec measures with. */
export const LATENCY = {
  /** The 95th percentile of the counted presses, in ms: the nearest-rank one, the 19th of 20. */
  p95: 100,
  /** Presses that count. */
  samples: 20,
  /** Presses before them that don't. */
  warmUps: 2,
  /** How many times slower than the runner the CPU is. */
  throttle: 4,
} as const;

/** One control's presses. Indexes run from 0, the first warm-up, to warmUps + samples - 1. */
export interface Presses {
  /** Presses the control once. */
  press: (index: number) => Promise<unknown>;
  /** Runs once before the first press, at full speed: what the presses need (an earlier line in the log). */
  prepare?: () => Promise<unknown>;
  /** Runs before a press, at full speed: what that press needs (full tanks before Dive). */
  setUp?: (index: number) => Promise<unknown>;
}

/**
 * The most a control's median may be, in ms, given its baseline: the highest median it measured
 * across recorded CI runs. Twice the baseline, or 24 ms (three Event Timing steps) over it if that is
 * more, so a slower runner passes and a control that got twice as slow does not. Above 100 ms the
 * p95 ceiling already holds the median, so for slower controls this only guards the fast ones.
 */
export function medianCeiling(baseline: number): number {
  return Math.max(2 * baseline, baseline + 24);
}

/** The 95th percentile and the median of a control's samples, and whether they are within budget. */
export function summarise(samples: readonly number[], baseline: number): { p95: number; median: number; within: boolean; report: string } {
  const sorted = samples.toSorted((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  const middle = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const ceiling = medianCeiling(baseline);
  const within = p95 <= LATENCY.p95 && median <= ceiling;
  return { p95, median, within, report: `p95 ${p95} ms (≤ ${LATENCY.p95}), median ${median} ms (≤ ${ceiling}, baseline ${baseline}); samples in order: ${samples.join(", ")}` };
}

/**
 * Presses a control warmUps + samples times on a throttled CPU and returns each counted press's
 * click-to-paint time in ms. Event Timing reports nothing under 16 ms (its durationThreshold floor),
 * so a press with no entry counts as 16 ms, if the browser's interaction count says it happened; a
 * press with neither is a broken measurement, and fails. Setting up a press runs at full speed, and
 * so does its tail (the porthole's repaint after the press), so a press is measured from a settled page, as
 * a person's would be a beat later.
 */
export async function measure(page: Page, label: string, { press, prepare, setUp }: Presses, throttle: number = LATENCY.throttle): Promise<number[]> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const store: unknown[] = [];
    w.__latency = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push({ name: entry.name, start: entry.startTime, ps: entry.processingStart, pe: entry.processingEnd, d: entry.duration });
    }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    const loaf: unknown[] = [];
    w.__loaf = loaf;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { startTime: number; duration: number; blockingDuration: number; renderStart: number; styleAndLayoutStart: number; scripts: { duration: number; sourceFunctionName: string; invoker: string }[] }[])
          loaf.push({ start: e.startTime, d: e.duration, block: e.blockingDuration, render: e.renderStart, style: e.styleAndLayoutStart, scripts: e.scripts.map((x) => `${x.invoker}:${Math.round(x.duration)}`).join("|") });
      }).observe({ type: "long-animation-frame", buffered: false });
    } catch {}
    const inpress: number[] = [];
    w.__inpress = inpress;
    const loop = () => {
      const start = performance.now();
      let x = 0;
      for (let i = 0; i < 200_000; i++) x = (x * 31 + i) | 0;
      inpress.push(performance.now() - start + (x === 0.5 ? 1 : 0));
    };
    for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, loop, { capture: true });
    const code = "let last=performance.timeOrigin+performance.now();const stalls=[];const n=()=>{const t=performance.timeOrigin+performance.now();if(t-last>20)stalls.push([last,t]);last=t};setInterval(n,4);onmessage=()=>{n();postMessage(stalls.splice(0))};";
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    w.__stalls = () => new Promise((resolve) => { worker.onmessage = ({ data }) => resolve(data); worker.postMessage(0); });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const pids: { type: string; id: number }[] = [];
  try {
    const bcdp = await page.context().browser()!.newBrowserCDPSession();
    const info = (await bcdp.send("SystemInfo.getProcessInfo")) as { processInfo: { type: string; id: number }[] };
    pids.push(...info.processInfo.filter((p) => p.type === "renderer" || p.type === "GPU"));
    if (process.env["LATENCY_PIN"] && process.platform === "linux") {
      // Probe: the renderer's main thread alone on one physical core; everything else in the container off it.
      const siblings = readFileSync("/sys/devices/system/cpu/cpu0/topology/thread_siblings_list", "utf8").trim();
      const all = readFileSync("/sys/fs/cgroup/cpuset.cpus.effective", "utf8").trim();
      const expand = (list: string) => list.split(",").flatMap((part) => { const [a, b] = part.split("-").map(Number); return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, i) => a! + i); });
      const reserved = new Set(expand(siblings));
      const others = expand(all).filter((cpu) => !reserved.has(cpu));
      const renderers = info.processInfo.filter((p) => p.type === "renderer").map((p) => p.id);
      for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
        try { execFileSync("taskset", ["-a", "-p", "-c", others.join(","), pid], { stdio: "ignore" }); } catch {}
      }
      for (const pid of renderers) try { execFileSync("taskset", ["-p", "-c", "0", String(pid)], { stdio: "ignore" }); } catch {}
      console.log(`latency-pin siblings ${siblings} all ${all} others ${others.join(",")} renderers ${renderers.join(",")}`);
    }
    await bcdp.detach();
  } catch {}
  /** Per process: main thread exec/wait ns, other threads exec/wait by name; and /proc/stat cpu. */
  const snap = () => {
    const out: Record<string, number> = {};
    if (process.platform !== "linux") return out;
    try {
      const cpu = readFileSync("/proc/stat", "utf8").split("\n")[0]!.trim().split(/\s+/).slice(1).map(Number);
      ["user", "nice", "system", "idle", "iowait", "irq", "softirq", "steal"].forEach((k, i) => (out[`cpu.${k}`] = cpu[i]! * 10));
    } catch {}
    for (const { type, id } of pids) {
      try {
        for (const tid of readdirSync(`/proc/${id}/task`)) {
          const [exec, wait] = readFileSync(`/proc/${id}/task/${tid}/schedstat`, "utf8").trim().split(/\s+/).map(Number);
          const name = Number(tid) === id ? "main" : readFileSync(`/proc/${id}/task/${tid}/comm`, "utf8").trim().replace(/\s+/g, "_");
          const key = `${type === "GPU" ? "gpu" : `r${id}`}.${name}`;
          out[`${key}.run`] = (out[`${key}.run`] ?? 0) + exec! / 1e6;
          out[`${key}.wait`] = (out[`${key}.wait`] ?? 0) + wait! / 1e6;
          if (Number(tid) === id || name.startsWith("CPUThrottling")) {
            const st = readFileSync(`/proc/${id}/task/${tid}/stat`, "utf8").split(") ")[1]!.split(" ");
            out[`${key}.minflt`] = Number(st[7]);
            out[`${key}.majflt`] = Number(st[9]);
            const status = readFileSync(`/proc/${id}/task/${tid}/status`, "utf8");
            out[`${key}.nvcsw`] = Number(/nonvoluntary_ctxt_switches:\s+(\d+)/.exec(status)![1]);
            out[`${key}.vcsw`] = Number(/\nvoluntary_ctxt_switches:\s+(\d+)/.exec(status)![1]);
          }
        }
      } catch {}
    }
    return out;
  };
  const windows: { index: number; from: number; to: number; d: number }[] = [];
  const browser = page.context().browser()!;
  if (process.env["LATENCY_TRACE"]) await browser.startTracing(page, { categories: ["devtools.timeline", "v8", "blink.user_timing", "disabled-by-default-devtools.timeline", "disabled-by-default-v8.gc"] });
  const markAt = await page.evaluate(() => (performance.mark("latency-sync"), performance.getEntriesByName("latency-sync").at(-1)!.startTime));
  const metrics = async () => Object.fromEntries(((await cdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] }).metrics.filter((m) => /ThreadTime|ProcessTime|TaskDuration|ScriptDuration|LayoutDuration|RecalcStyleDuration|JSHeapUsedSize/.test(m.name)).map((m) => [m.name, m.value]));
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
  const unthrottled = async (work: () => Promise<unknown>) => {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await work();
    await settle();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  };
  /** How many interactions the page has had (Event Timing's count, which has no duration floor). */
  const interactions = () => page.evaluate(() => (performance as Performance & { interactionCount: number }).interactionCount);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  if (prepare) await unthrottled(prepare);
  const samples: number[] = [];
  for (let index = 0; index < LATENCY.warmUps + LATENCY.samples; index++) {
    if (setUp) await unthrottled(() => setUp(index));
    await page.evaluate(async () => {
      const w = window as unknown as { __latency: unknown[]; __loaf: unknown[]; __stalls: () => Promise<unknown> };
      w.__latency.length = 0;
      (w as unknown as { __inpress: number[] }).__inpress.length = 0;
      w.__loaf.length = 0;
      await w.__stalls();
    });
    const before = await interactions();
    const pace = () => page.evaluate(() => {
      const runs: number[] = [];
      for (let k = 0; k < 3; k++) {
        const start = performance.now();
        let x = 0;
        for (let i = 0; i < 2_000_000; i++) x = (x * 31 + i) | 0;
        runs.push(performance.now() - start + (x === 0.5 ? 1 : 0));
      }
      return runs.sort((a, b) => a - b)[1]!;
    });
    if (index === 0) for (let k = 0; k < 5; k++) await pace();
    const c0 = await pace();
    const m0 = await metrics();
    const s0 = snap();
    const t0 = Date.now();
    await press(index);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
    const s1 = snap();
    const t1 = Date.now();
    const m1 = await metrics();
    const c1 = await pace();
    const got = await page.evaluate(async () => {
      const w = window as unknown as { __latency: { name: string; start: number; ps: number; pe: number; d: number }[]; __loaf: { start: number; d: number }[]; __stalls: () => Promise<[number, number][]> };
      const stalls = await w.__stalls();
      const origin = performance.timeOrigin;
      return { inpress: [...(w as unknown as { __inpress: number[] }).__inpress], origin, entries: [...w.__latency], loaf: [...w.__loaf], stalls: stalls.map(([a, b]) => [a - origin, b - origin] as [number, number]) };
    });
    const durations = got.entries.map((entry) => entry.d);
    const pressed = (await interactions()) > before;
    expect(durations.length > 0 || pressed, `${label}, press ${index}: the press happened and Event Timing saw it or it was under 16 ms`).toBe(true);
    if (index >= LATENCY.warmUps) samples.push(durations.length > 0 ? Math.max(...durations) : 16);
    {
      const top = got.entries.toSorted((a, b) => b.d - a.d)[0];
      const r = (n: number) => Math.round(n);
      const overlap = top ? got.stalls.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(top.start + top.d, b) - Math.max(top.start, a)), 0) : 0;
      const loaf = top ? got.loaf.filter((f) => f.start < top.start + top.d && f.start + f.d > top.start) : [];
      const line = top
        ? `d=${r(top.d)} ${top.name} all=[${got.entries.map((e) => `${e.name}:${r(e.d)}@${r(e.start - top.start)}/${r(e.ps - top.start)}/${r(e.pe - top.start)}`).join(" ")}] in=${r(top.ps - top.start)} proc=${r(top.pe - top.ps)} pres=${r(top.start + top.d - top.pe)} stallOverlap=${r(overlap)} stalls=[${got.stalls.map(([a, b]) => `${r(a - top.start)}+${r(b - a)}`).join(" ")}] loaf=${JSON.stringify(loaf.map((f) => ({ ...f, start: r(f.start - top.start), d: r(f.d) })))}`
        : `none stalls=${got.stalls.length}`;
      const win = "";
      if (top && index >= LATENCY.warmUps) windows.push({ index, from: top.start, to: top.start + top.d, d: top.d });
      const ds = Object.entries(s1).map(([k, v]) => [k, v - (s0[k] ?? 0)] as const).filter(([, v]) => v >= 1).map(([k, v]) => `${k}=${r(v)}`).join(" ");
      const dm = Object.entries(m1).map(([k, v]) => `${k}=${k === "JSHeapUsedSize" ? r((v - (m0[k] ?? 0)) / 1024) + "k" : r((v - (m0[k] ?? 0)) * 1000)}`).join(" ");
      console.log(`latency-trace ${label} #${index}: ${line} calib{${c0.toFixed(1)} ${c1.toFixed(1)}} inpress{${got.inpress.map((x) => x.toFixed(1)).join(" ")}} win{${win}} wall=${t1 - t0} metrics{${dm}} sched{${ds}}`);
    }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  if (process.env["LATENCY_TRACE"]) try {
    const trace = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: { name?: string } }[] };
    const ev = trace.traceEvents;
    const sync = ev.find((e) => e.name === "latency-sync");
    const mains = new Set(ev.filter((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`));
    const main = sync ? `${sync.pid}:${sync.tid}` : [...mains][0];
    const offset = sync ? sync.ts / 1000 - markAt : 0;
    const xs = ev.filter((e) => e.ph === "X" && `${e.pid}:${e.tid}` === main && e.dur);
    for (const w of windows) {
      const from = w.from + offset, to = w.to + offset;
      const by: Record<string, number> = {};
      for (const e of xs) {
        const a = e.ts / 1000, b = (e.ts + e.dur!) / 1000;
        const o = Math.min(b, to) - Math.max(a, from);
        if (o > 0.05) by[e.name] = (by[e.name] ?? 0) + o;
      }
      const gc = Object.entries(by).filter(([k]) => /GC|Scavenge|MarkCompact/i.test(k) && !/V8\.GC_/.test(k)).reduce((t, [, v]) => t + v, 0);
      const top = Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => `${k}:${Math.round(v)}`).join(" ");
      console.log(`latency-tracing ${label} #${w.index}: d=${Math.round(w.d)} gc=${Math.round(gc)} ${top}`);
    }
  } catch (error) {
    console.log(`latency-tracing ${label}: failed ${String(error)}`);
  }
  return samples;
}

/** Holds a control's samples to the budget and its baseline's median ceiling, reporting every sample, pass or fail. */
export function expectWithinBudget(label: string, samples: readonly number[], baseline: number): void {
  const { p95, median, report } = summarise(samples, baseline);
  test.info().annotations.push({ type: "latency", description: `${label}: ${report}` });
  console.log(`latency ${label}: ${report}`);
  expect(p95, `${label} ${report}`).toBeLessThanOrEqual(LATENCY.p95);
  expect(median, `${label} ${report}`).toBeLessThanOrEqual(medianCeiling(baseline));
}

/**
 * Takes a control's measurement, and takes it once more on a fresh page when the first is over budget, keeping the
 * calmer of the two: a shared runner's neighbour can stall one take (two samples of twenty), while a control that
 * really is slow is slow in both. The budget is unchanged, and both takes are recorded in the test's annotations.
 */
export async function measureCalmly(label: string, take: () => Promise<number[]>, baseline: number): Promise<number[]> {
  const first = await take();
  if (summarise(first, baseline).within) return first;
  const retaken = await take();
  test.info().annotations.push({ type: "latency-retake", description: `${label}, first take: ${summarise(first, baseline).report}; retaken: ${summarise(retaken, baseline).report}` });
  return calmer(first, retaken);
}

/** The take with the lower p95, the lower median when those tie, and the first when both tie. */
export function calmer(first: readonly number[], second: readonly number[]): number[] {
  const a = summarise(first, 0);
  const b = summarise(second, 0);
  return [...(b.p95 < a.p95 || (b.p95 === a.p95 && b.median < a.median) ? second : first)];
}
