// The stage's control census (site-design.md, "Verification in CI": every control has a spec that
// operates it and asserts its visible effect). STAGE_CONTROLS in site/src/voyage/stage/copy.ts lists
// the controls; site/e2e/stage.spec.ts must hold a test named "control: <id>" for each.
//
//   node site/scripts/stage-census.mts    fails naming each control without its test
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** The ids in `export const STAGE_CONTROLS = [...]`. */
export function listedControls(copySource: string): string[] {
  const list = /export const STAGE_CONTROLS = \[([^\]]*)\]/.exec(copySource)?.[1];
  if (list === undefined) throw new Error("copy.ts no longer exports STAGE_CONTROLS as a literal list");
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

/** The ids with a `test("control: <id> …")` of their own. */
export function testedControls(specSource: string): string[] {
  return [...specSource.matchAll(/\btest\(\s*["'`]control: ([a-z-]+)\b/g)].map((match) => match[1]!);
}

export function uncovered(copySource: string, specSource: string): string[] {
  const tested = new Set(testedControls(specSource));
  return listedControls(copySource).filter((id) => !tested.has(id));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = uncovered(readFileSync(join(repo, "site/src/voyage/stage/copy.ts"), "utf8"), readFileSync(join(repo, "site/e2e/stage.spec.ts"), "utf8"));
  if (missing.length) {
    console.error(`No "control: <id>" test in site/e2e/stage.spec.ts for: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("Every stage control has its own test");
}
