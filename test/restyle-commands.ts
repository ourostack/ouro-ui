import type {} from "@vitest/browser-playwright";
import type { CDPSession, Page } from "playwright";
import type { BrowserCommand } from "vitest/node";

// The browser commands the repository's own projects add (vitest.config.ts): how many elements Chromium restyles between two
// points, from its trace (CDP Tracing, the devtools timeline's UpdateLayoutTree events and their element counts), so a test can
// hold a change (one message arriving) to restyling only what it touched. Chromium only.

interface Trace {
  cdp: CDPSession;
  events: { name?: string; args?: { elementCount?: number; data?: { elementCount?: number } } }[];
}

const traces = new WeakMap<Page, Trace>();

/** Starts recording the elements the page restyles. */
export const startRestyleTrace: BrowserCommand<[]> = async (ctx) => {
  if (ctx.provider.name !== "playwright" || ctx.page.context().browser()?.browserType().name() !== "chromium") {
    throw new Error("startRestyleTrace: CDP tracing is Chromium only");
  }
  const cdp = await ctx.page.context().newCDPSession(ctx.page);
  const trace: Trace = { cdp, events: [] };
  cdp.on("Tracing.dataCollected", ({ value }) => trace.events.push(...(value as unknown as Trace["events"])));
  await cdp.send("Tracing.start", { categories: "devtools.timeline", transferMode: "ReportEvents" });
  traces.set(ctx.page, trace);
};

/** Stops recording, and returns how many elements the page restyled since it started. */
export const stopRestyleTrace: BrowserCommand<[]> = async (ctx) => {
  const trace = traces.get(ctx.page);
  if (!trace) throw new Error("stopRestyleTrace: no trace started");
  traces.delete(ctx.page);
  const done = new Promise<void>((resolve) => trace.cdp.once("Tracing.tracingComplete", () => resolve()));
  await trace.cdp.send("Tracing.end");
  await done;
  await trace.cdp.detach();
  return trace.events
    .filter((event) => event.name === "UpdateLayoutTree")
    .reduce((sum, event) => sum + (event.args?.elementCount ?? event.args?.data?.elementCount ?? 0), 0);
};

export const restyleCommands = { startRestyleTrace, stopRestyleTrace };

declare module "vitest/browser" {
  interface BrowserCommands {
    startRestyleTrace: () => Promise<void>;
    stopRestyleTrace: () => Promise<number>;
  }
}
