import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { scratchDir } from "./scratch.mjs";
import { instability, retakeScope, wantsRetake } from "../site/e2e/stable-take.ts";

const pic = (bytes, width = 2) => ({ data: Buffer.from(bytes), width, height: 1 });
const where = { signature: "button|trigger|hover", page: "/docs/button/", state: "hover" };

test("a stable capture passes: two equal takes make no finding", () => {
  assert.equal(instability(pic([1, 2]), pic([1, 2]), where), null);
});

test("two takes that differ fail, naming the control signature, page and state", () => {
  const message = instability(pic([1, 2]), pic([1, 15]), where);
  assert.match(message, /button\|trigger\|hover/);
  assert.match(message, /\/docs\/button\//);
  assert.match(message, /hover/);
  assert.match(instability(pic([1, 2]), pic([1, 2], 1), where), /differ/);
});

test("an edge that moves a unit or two as it is redrawn is no finding, and three is", () => {
  assert.equal(instability(pic([40, 42]), pic([41, 40]), where), null);
  assert.match(instability(pic([40, 42]), pic([43, 42]), where), /differ/);
});

test("a take that produced no picture is no finding", () => {
  assert.equal(instability(pic([1]), null, where), null);
});

test("a pull request with no component or shared CSS change takes once", () => {
  assert.equal(retakeScope("pull_request", ["docs/button.md", "scripts/x.mjs", "registry/ouro/components/ouro/button/button.test.tsx"]), "");
  assert.equal(wantsRetake("", "button|trigger|hover"), false);
});

test("a run that is not a pull request takes once, whatever changed", () => {
  for (const event of ["push", "merge_group", "workflow_dispatch", ""]) assert.equal(retakeScope(event, ["registry/ouro/theme/ouro-base.css"]), "");
});

test("a changed component retakes only its own controls; shared CSS and an unreadable diff retake all", () => {
  const scope = retakeScope("pull_request", ["registry/ouro/components/ouro/disclosure/disclosure.tsx"]);
  assert.equal(scope, "names:disclosure");
  assert.equal(wantsRetake(scope, "Disclosure|trigger|hover"), true);
  assert.equal(wantsRetake(scope, "button|root|hover"), false);
  assert.equal(retakeScope("pull_request", ["registry/ouro/theme/ouro-base.css"]), "all");
  assert.equal(retakeScope("pull_request", null), "all");
  assert.equal(retakeScope("pull_request", []), "all");
  assert.equal(wantsRetake("all", "anything"), true);
  assert.equal(wantsRetake(undefined, "anything"), false);
});

test("the command prints the scope from a list of changed paths, and all when the list is unreadable", () => {
  const dir = scratchDir("sweeps-retake");
  const list = join(dir, "changed.txt");
  writeFileSync(list, "registry/ouro/components/ouro/switch/switch.tsx\n");
  const run = (...args) => spawnSync("node", ["scripts/sweeps-retake.mjs", ...args], { encoding: "utf8" }).stdout.trim();
  assert.equal(run("pull_request", list), "names:switch");
  assert.equal(run("pull_request", join(dir, "missing.txt")), "all");
  assert.equal(run("push", list), "");
});
