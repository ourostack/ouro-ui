import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { listedControls, testedControls, uncovered } from "./stage-census.mts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("every control on the stage has a test that operates it", () => {
  const copy = read("site/src/voyage/stage/copy.ts");
  assert.ok(listedControls(copy).length >= 8);
  assert.deepEqual(uncovered(copy, read("site/e2e/stage.spec.ts")), []);
});

test("a control without its own test is named", () => {
  const copy = 'export const STAGE_CONTROLS = ["depth", "bell", "hatch"] as const;';
  const spec = 'test("control: depth goes down", () => {});\ntest(\'control: bell rings\', () => {});\ntest("the hatch opens", () => {});';
  assert.deepEqual(testedControls(spec), ["depth", "bell"]);
  assert.deepEqual(uncovered(copy, spec), ["hatch"]);
});

test("a control list that is no longer a literal is an error, not an empty census", () => {
  assert.throws(() => listedControls("export const STAGE_CONTROLS = CONTROLS;"), /literal list/);
});
