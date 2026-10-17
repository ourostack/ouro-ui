import { appendFileSync } from "node:fs";
import { join } from "node:path";

export const escapeObserverCommands = {
  escapeEvidence: async (_context: unknown, evidence: unknown) => {
    appendFileSync(join(process.env["RUNNER_TEMP"]!, "v1-escape-observer.jsonl"), `${JSON.stringify(evidence)}\n`);
  },
};
