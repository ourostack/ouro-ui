import { appendFileSync } from "node:fs";
import type { BrowserCommand } from "vitest/node";
import base from "../vitest.config.ts";

const recordAccordionObservation: BrowserCommand<[record: string]> = async (_ctx, record) => {
  const path = process.env["ACCORDION_OBSERVATION_FILE"];
  if (!path) throw new Error("ACCORDION_OBSERVATION_FILE must name the retained native observation evidence.");
  appendFileSync(path, `${JSON.stringify({
    candidate: "62adf6b175b9e1d8b1ea87e31d8f530067232c5b",
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
