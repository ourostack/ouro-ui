import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { CENSUSES, listedControls, testedControls, uncovered } from "./stage-census.mts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("every control on the stage and in each chapter has a test that operates it", () => {
  for (const census of CENSUSES) {
    const copy = read(census.copy);
    assert.ok(listedControls(copy, census.list).length >= 8, census.list);
    assert.deepEqual(uncovered(copy, read(census.spec), census.list), [], census.spec);
  }
});

test("a control without its own test is named", () => {
  const copy = 'export const STAGE_CONTROLS = ["depth", "bell", "hatch"] as const;';
  const spec = 'test("control: depth goes down", () => {});\ntest(\'control: bell rings\', () => {});\ntest("the hatch opens", () => {});';
  assert.deepEqual(testedControls(spec), ["depth", "bell"]);
  assert.deepEqual(uncovered(copy, spec), ["hatch"]);
  assert.deepEqual(uncovered(copy.replace("STAGE_CONTROLS", "CHAPTER_ONE_CONTROLS"), spec, "CHAPTER_ONE_CONTROLS"), ["hatch"]);
});

test("a control list that is no longer a literal is an error, not an empty census", () => {
  assert.throws(() => listedControls("export const STAGE_CONTROLS = CONTROLS;"), /literal list/);
  assert.throws(() => listedControls("export const STAGE_CONTROLS = [];", "CHAPTER_ONE_CONTROLS"), /CHAPTER_ONE_CONTROLS as a literal list/);
});
