import { appendFileSync, writeFileSync } from "node:fs";
import type { CDPSession, Page } from "playwright";
import type { BrowserCommand } from "vitest/node";
import base from "../vitest.config.ts";

const traces = new WeakMap<Page, { session: CDPSession; events: unknown[]; version: unknown }>();

const startCarouselTrace: BrowserCommand<[]> = async (ctx) => {
  if (traces.has(ctx.page)) throw new Error("The previous Carousel engine trace was not closed.");
  const session = await ctx.page.context().newCDPSession(ctx.page);
  const events: unknown[] = [];
  session.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  try {
    const version = await session.send("Browser.getVersion");
    await session.send("Tracing.start", {
      categories: "input,benchmark,cc,latencyInfo,disabled-by-default-input",
      transferMode: "ReportEvents",
    });
    traces.set(ctx.page, { session, events, version });
  } catch (error) {
    await session.detach();
    throw error;
  }
};

const recordCarouselTrace: BrowserCommand<[record: string]> = async (ctx, record) => {
  const path = process.env["CAROUSEL_TRACE_FILE"];
  if (!path) throw new Error("CAROUSEL_TRACE_FILE must name this probe's browser trace.");
  appendFileSync(path, `${JSON.stringify({
    iteration: process.env["CAROUSEL_TRACE_ITERATION"],
    probeSource: process.env["CAROUSEL_PROBE_SOURCE"],
    baseSource: "4611acf05d8a2cc21546a8a21436a1e7699cab0a",
    trace: JSON.parse(record),
  })}\n`);
  const trace = traces.get(ctx.page);
  if (!trace) throw new Error("This Carousel observation has no engine trace.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const complete = new Promise<void>((resolve, reject) => {
      trace.session.once("Tracing.tracingComplete", () => resolve());
      timer = setTimeout(() => reject(new Error("Chromium did not finish its Carousel engine trace within 5s.")), 5000);
    });
    await trace.session.send("Tracing.end");
    await complete;
  } finally {
    clearTimeout(timer);
    writeFileSync(path.replace(/-browser\.jsonl$/, "-engine.json"), JSON.stringify({
      version: trace.version,
      profile: process.env["CAROUSEL_STALL_PROFILE"],
      probeSource: process.env["CAROUSEL_PROBE_SOURCE"],
      traceEvents: trace.events,
    }));
    traces.delete(ctx.page);
    await trace.session.detach();
  }
};

const resultFile = process.env["CAROUSEL_RESULT_FILE"];
export default {
  ...base,
  test: {
    ...base.test,
    reporters: ["default", "json"],
    ...(resultFile ? { outputFile: { json: resultFile } } : {}),
    projects: base.test!.projects!.map((project) => {
      if (typeof project !== "object" || !("test" in project)) throw new Error("The probe needs the existing inline browser projects.");
      return {
        ...project,
        test: {
          ...project.test,
          browser: {
            ...project.test?.browser,
            commands: { ...project.test?.browser?.commands, startCarouselTrace, recordCarouselTrace },
          },
        },
      };
    }),
  },
};
