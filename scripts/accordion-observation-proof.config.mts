import { appendFileSync } from "node:fs";
import type { BrowserCommand } from "vitest/node";
import base from "../vitest.config.ts";

const recordAccordionObservation: BrowserCommand<[record: string]> = async (_ctx, record) => {
  const path = process.env["ACCORDION_OBSERVATION_FILE"];
  if (!path) throw new Error("ACCORDION_OBSERVATION_FILE must name the retained native observation evidence.");
  appendFileSync(path, `${JSON.stringify({
    candidate: "4e663fc480be9a303895e0661a6d897dc02be87f",
    proofSource: process.env["ACCORDION_PROOF_SOURCE"],
    observation: JSON.parse(record),
  })}\n`);
};

export default {
  ...base,
  test: {
    ...base.test,
    reporters: ["default", "json"],
    outputFile: { json: process.env["ACCORDION_RESULT_FILE"] },
    projects: base.test!.projects!.map((project) => {
      if (typeof project !== "object" || !("test" in project)) throw new Error("The proof requires the existing browser projects.");
      return {
        ...project,
        test: {
          ...project.test,
          browser: {
            ...project.test?.browser,
            commands: { ...project.test?.browser?.commands, recordAccordionObservation },
          },
        },
      };
    }),
  },
};
