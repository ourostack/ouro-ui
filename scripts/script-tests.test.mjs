import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { withScriptTests } from "./run-script-tests.mjs";
import { scratchDir } from "./scratch.mjs";
import { scriptTestFiles } from "./script-tests.mjs";

/** A scratch copy of the repository's layout, with an empty file at each path. */
const tree = (files) => {
  const root = scratchDir("ouro-discovery-");
  for (const file of files) {
    mkdirSync(join(root, dirname(file)), { recursive: true });
    writeFileSync(join(root, file), "");
  }
  return root;
};

test("a new script test file under scripts/ or site/scripts/ is found with no edit to package.json", () => {
  const root = tree(["scripts/new-check.test.mjs", "scripts/nested/deeper.test.mjs", "scripts/helper.mjs", "site/scripts/page.test.mjs"]);
  assert.deepEqual(scriptTestFiles(root), ["scripts/nested/deeper.test.mjs", "scripts/new-check.test.mjs", "site/scripts/page.test.mjs"]);
});

test("a test under an ignored folder is not a script test, and scripts/kits/ runs in its own file", () => {
  const root = tree(["scripts/.tmp/scratch.test.mjs", "scripts/node_modules/dep/dep.test.mjs", "scripts/kits/ratchets.test.mjs", "scripts/kept.test.mjs"]);
  assert.deepEqual(scriptTestFiles(root), ["scripts/kept.test.mjs"]);
});

test("a checkout with no site/scripts folder still finds its own script tests", () => {
  assert.deepEqual(scriptTestFiles(tree(["scripts/only.test.mjs"])), ["scripts/only.test.mjs"]);
});

test("the runner runs every script test when no test file is named, and only the named ones otherwise", () => {
  assert.deepEqual(withScriptTests([]), scriptTestFiles());
  assert.deepEqual(withScriptTests(["--test-reporter=spec"]), ["--test-reporter=spec", ...scriptTestFiles()]);
  assert.deepEqual(withScriptTests(["--test-reporter=spec", "scripts/shard.test.mjs"]), ["--test-reporter=spec", "scripts/shard.test.mjs"]);
});
