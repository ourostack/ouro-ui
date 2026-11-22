// Prints the value of OURO_SWEEP_RETAKE for a run (site/e2e/stable-take.ts): which sweeps pictures are taken twice.
//   node scripts/sweeps-retake.mjs <event> <file listing the changed paths, one per line; absent when unreadable>
import { readFileSync } from "node:fs";
import { retakeScope } from "../site/e2e/stable-take.ts";

const [event = "", list] = process.argv.slice(2);
let changed = null;
if (list) {
  try {
    changed = readFileSync(list, "utf8").split("\n").filter(Boolean);
  } catch {
    changed = null;
  }
}
console.log(retakeScope(event, changed));
