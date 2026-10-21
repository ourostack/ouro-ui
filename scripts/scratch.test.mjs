import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a test file's scratch folders are gone after its tests, whether they passed or failed", () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp/scratch-"));
  const made = join(dir, "made.txt");
  const file = join(dir, "fixture.test.mjs");
  writeFileSync(
    file,
    `import { appendFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { scratchDir } from ${JSON.stringify(join(root, "scripts/scratch.mjs"))};
test("passes", () => {
  const folder = scratchDir("ouro-scratch-test-");
  writeFileSync(folder + "/copy.txt", "x");
  appendFileSync(${JSON.stringify(made)}, folder + "\\n");
});
test("fails", () => {
  appendFileSync(${JSON.stringify(made)}, scratchDir("ouro-scratch-test-") + "\\n");
  throw new Error("on purpose");
});
`,
  );
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", file], { encoding: "utf8", env });
  assert.match(result.stdout, /^not ok \d+ - fails$/m);
  const folders = readFileSync(made, "utf8").trim().split("\n");
  assert.equal(folders.length, 2);
  for (const folder of folders) assert.equal(existsSync(folder), false, `${folder} is still there`);
});

test("every script test makes its temp folders through scratchDir, so none is left in $TMPDIR", () => {
  const tests = ["scripts", "site/scripts"].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".test.mjs"))
      .map((file) => join(dir, file)),
  );
  const direct = tests.filter((file) => /\btmpdir\(\)/.test(readFileSync(join(root, file), "utf8")));
  assert.deepEqual(direct, [], "make temp folders with scratchDir (scripts/scratch.mjs), which removes them");
});
