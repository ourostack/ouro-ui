import { appendFileSync } from "node:fs";
import type { BrowserCommand } from "vitest/node";
import base from "../vitest.config.ts";

const recordCarouselTrace: BrowserCommand<[record: string]> = async (_ctx, record) => {
  const path = process.env["CAROUSEL_TRACE_FILE"];
  if (!path) throw new Error("CAROUSEL_TRACE_FILE must name this probe's browser trace.");
  appendFileSync(path, `${JSON.stringify({
    iteration: process.env["CAROUSEL_TRACE_ITERATION"],
    probeSource: process.env["CAROUSEL_PROBE_SOURCE"],
    baseSource: "4611acf05d8a2cc21546a8a21436a1e7699cab0a",
    trace: JSON.parse(record),
  })}\n`);
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
            commands: { ...project.test?.browser?.commands, recordCarouselTrace },
          },
        },
      };
    }),
  },
};
