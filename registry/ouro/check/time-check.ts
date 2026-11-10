export { armTime, compareTimeObservations, continueTime, listenForTime, readTime, timeFailure, timeIssues };
export type { TimeObservation, TimeReading, TimeWindow };

import type { PageIssue } from "./size-check.ts";

interface TimeWindow {
  document: number;
  url: string;
  since: number;
}

type TimeReading =
  | {
    status: "measured";
    expected: TimeWindow;
    observed: { document: number; url: string };
    until: number;
    tasks: { startTime: number; duration: number }[];
    reason?: never;
  }
  | {
    status: "unsupported" | "incomplete" | "not-run";
    expected?: TimeWindow;
    observed?: { document?: number; url: string };
    until?: number;
    tasks?: never;
    reason: string;
  };

interface TimeObservation {
  site: string;
  page: string;
  width: number;
  height: number;
  theme: string;
  dpr: number;
  viewport: { width: number; height: number };
  ref: string;
  element: string;
  phase: string;
  run: number;
  reading: TimeReading;
}

interface TimeStore {
  document: number;
  supported: boolean;
  tasks: { startTime: number; duration: number }[];
  drain: () => void;
}

declare global {
  interface Window {
    __ouroCheckTime?: TimeStore;
  }
}

// These three functions run serialized in the page: no references to outer runtime helpers.
function listenForTime(): void {
  if (window.__ouroCheckTime?.document === performance.timeOrigin) return;
  const supported = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
  const store: TimeStore = { document: performance.timeOrigin, supported, tasks: [], drain: () => undefined };
  window.__ouroCheckTime = store;
  if (!supported) return;
  const append = (entries: PerformanceEntry[]) => {
    for (const { entryType, startTime, duration } of entries) {
      if (entryType === "longtask") store.tasks.push({ startTime, duration });
    }
  };
  const observer = new PerformanceObserver((list) => append(list.getEntries()));
  observer.observe({ type: "longtask", buffered: true });
  store.drain = () => append(observer.takeRecords());
}

function armTime(): TimeWindow {
  window.__ouroCheckTime?.drain();
  return { document: performance.timeOrigin, url: location.href, since: performance.now() };
}

function readTime(expected: TimeWindow): TimeReading {
  const observed = { document: performance.timeOrigin, url: location.href };
  if (observed.document !== expected.document) {
    return { status: "incomplete", expected, observed, reason: observed.url !== expected.url ? "navigated" : "document-changed" };
  }
  const store = window.__ouroCheckTime;
  if (!store || store.document !== expected.document) return { status: "incomplete", expected, observed, reason: "missing-instrumentation" };
  if (!store.supported) return { status: "unsupported", expected, observed, reason: "longtask-unavailable" };
  store.drain();
  const until = performance.now();
  const tasks = store.tasks.filter((entry) => entry.startTime >= expected.since && entry.startTime < until);
  return { status: "measured", expected, observed, until, tasks };
}

function timeFailure(problem: unknown, expected: TimeWindow | undefined, url: string): TimeReading {
  if (!(problem instanceof Error) || !/Execution context was destroyed|Cannot find context with specified id/.test(problem.message)) throw problem;
  return { status: "incomplete", ...(expected ? { expected } : {}), observed: { url }, reason: "execution-context-destroyed" };
}

function continueTime(previous: TimeReading, next: TimeWindow | TimeReading): TimeWindow | TimeReading {
  const lost = previous.status === "incomplete" && ["navigated", "document-changed", "execution-context-destroyed"].includes(previous.reason);
  const replaced = "document" in next && previous.expected && next.document !== previous.expected.document;
  if (lost || replaced) {
    const observed = "document" in next ? { document: next.document, url: next.url } : next.observed;
    return {
      status: "not-run", ...(previous.expected ? { expected: previous.expected } : {}),
      ...(observed ? { observed } : {}), reason: "page-left-after-open",
    };
  }
  return next;
}

function compareTimeObservations(a: TimeObservation, b: TimeObservation): number {
  const text = (value: TimeObservation) => [value.site, value.page, value.theme, value.ref, value.phase].join("\u0000");
  return a.width - b.width || a.height - b.height || text(a).localeCompare(text(b)) || a.run - b.run
    || a.dpr - b.dpr || a.viewport.width - b.viewport.width || a.viewport.height - b.viewport.height
    || JSON.stringify(a.reading).localeCompare(JSON.stringify(b.reading));
}

function timeIssues(observations: TimeObservation[], budget: number): PageIssue[] {
  const groups = new Map<string, TimeObservation[]>();
  for (const observation of observations) {
    if (observation.reading.status === "not-run") continue;
    const key = JSON.stringify([observation.ref, observation.phase, observation.reading.status]);
    const group = groups.get(key) ?? [];
    group.push(observation);
    groups.set(key, group);
  }
  const issues: PageIssue[] = [];
  for (const runs of groups.values()) {
    const { ref, element, phase, reading } = runs[0]!;
    const name = `${phase} ${element} (${reading.status})`;
    if (reading.status !== "measured") {
      const reasons = [...new Set(runs.map((run) => run.reading.reason))].join("; ");
      issues.push({ ref, rule: "long-task", element: name, detail: `Task measurement ${reading.status}: ${reasons}. No clean measurement is established.` });
      continue;
    }
    const samples = runs.flatMap((run) => run.reading.status === "measured" ? run.reading.tasks.map((task) => task.duration) : []);
    const value = samples.reduce((max, duration) => Math.max(max, duration), 0);
    if (value > budget) issues.push({
      ref, rule: "long-task", element: name, value, budget, unit: "ms", samples,
      detail: `A ${value} ms main-thread task was observed during ${phase}, over the budget of ${budget} ms (maximum across ${runs.length} runs; not a claim of causation).`,
    });
  }
  return issues;
}
