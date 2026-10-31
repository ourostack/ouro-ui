// The voyage's control census (site-design.md, "Verification in CI": every control in the hero and
// the chapters has a spec that operates it and asserts its visible effect). Each composition lists
// its controls in a literal list in its copy file; its end-to-end spec must hold a test named
// "control: <id>" for each:
//   - the stage: STAGE_CONTROLS in site/src/voyage/stage/copy.ts, site/e2e/stage.spec.ts;
//   - Chapter I: CHAPTER_ONE_CONTROLS in site/src/voyage/chapters/copy.ts, site/e2e/chapter-one.spec.ts;
//   - Chapter II: CHAPTER_TWO_CONTROLS in site/src/voyage/chapters/chapter-two-copy.ts, site/e2e/chapter-two.spec.ts;
//   - Chapter III: CHAPTER_THREE_CONTROLS in site/src/voyage/chapters/chapter-three-copy.ts, site/e2e/chapter-three.spec.ts;
//
//   node site/scripts/stage-census.mts    fails naming each control without its test
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Each census: where its controls are listed, under which name, the spec that must test them, and (when not 8) the fewest it may list. */
export const CENSUSES = [
  { list: "STAGE_CONTROLS", copy: "site/src/voyage/stage/copy.ts", spec: "site/e2e/stage.spec.ts" },
  { list: "CHAPTER_ONE_CONTROLS", copy: "site/src/voyage/chapters/copy.ts", spec: "site/e2e/chapter-one.spec.ts" },
  { list: "CHAPTER_TWO_CONTROLS", copy: "site/src/voyage/chapters/chapter-two-copy.ts", spec: "site/e2e/chapter-two.spec.ts" },
  { list: "CHAPTER_THREE_CONTROLS", copy: "site/src/voyage/chapters/chapter-three-copy.ts", spec: "site/e2e/chapter-three.spec.ts" },
] as const;

/** The ids in `export const <list> = [...]`. */
export function listedControls(copySource: string, list = "STAGE_CONTROLS"): string[] {
  const ids = new RegExp(`export const ${list} = \\[([^\\]]*)\\]`).exec(copySource)?.[1];
  if (ids === undefined) throw new Error(`The copy file no longer exports ${list} as a literal list`);
  return [...ids.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

/** The ids with a `test("control: <id> …")` of their own. */
export function testedControls(specSource: string): string[] {
  return [...specSource.matchAll(/\btest\(\s*["'`]control: ([a-z-]+)\b/g)].map((match) => match[1]!);
}

export function uncovered(copySource: string, specSource: string, list = "STAGE_CONTROLS"): string[] {
  const tested = new Set(testedControls(specSource));
  return listedControls(copySource, list).filter((id) => !tested.has(id));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const census of CENSUSES) {
    const missing = uncovered(readFileSync(join(repo, census.copy), "utf8"), readFileSync(join(repo, census.spec), "utf8"), census.list);
    if (missing.length) {
      failed = true;
      console.error(`No "control: <id>" test in ${census.spec} for: ${missing.join(", ")}`);
    }
  }
  if (failed) process.exit(1);
  console.log("Every control on the voyage has its own test");
}
