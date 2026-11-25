// Run by `check-node-coverage.mjs merge` under node --test: puts every group's raw V8 coverage where the runner
// reads it, in the directory it gave this process (NODE_V8_COVERAGE), so it merges and judges them as it would
// the coverage of one run.
import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { included } from "./check-node-coverage.mjs";

test("the groups' raw coverage is in the runner's folder", () => {
  const from = process.env.OURO_CHECK_COVERAGE_DIR;
  const to = process.env.NODE_V8_COVERAGE;
  if (!from || !to || !existsSync(to)) throw new Error("run this through check-node-coverage.mjs merge");
  let copied = 0;
  const seen = new Set();
  for (const group of readdirSync(from)) {
    for (const file of readdirSync(join(from, group))) {
      for (const script of JSON.parse(readFileSync(join(from, group, file), "utf8")).result) seen.add(script.url);
      copyFileSync(join(from, group, file), join(to, `coverage-${process.pid}-${Date.now()}-${copied++}.json`));
    }
  }
  if (copied === 0) throw new Error(`no coverage files in ${from}`);
  // The runner leaves a file no test loaded out of its report; here that is a file the groups never ran.
  const unloaded = included.filter((file) => !seen.has(pathToFileURL(join(process.cwd(), file)).href));
  if (unloaded.length > 0) throw new Error(`no test loaded ${unloaded.join(", ")}`);
});
