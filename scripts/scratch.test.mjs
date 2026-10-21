import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runScriptTests } from "./run-script-tests.mjs";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a test file's scratch folders are gone after its tests, whether they passed or failed", () => {
  const dir = scratchDir("ouro-scratch-fixture-");
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

test("pnpm test:scripts and the script test shards fail when a run leaves anything in its temp folder, and remove it", () => {
  const dir = scratchDir("ouro-run-script-tests-");
  const file = (name, body) => {
    writeFileSync(join(dir, name), `import { mkdirSync } from "node:fs";\nimport { join } from "node:path";\nimport { test } from "node:test";\n${body}\n`);
    return join(dir, name);
  };
  // A leak through any path, here an import's own folder under TMPDIR, not only a test's.
  const leaky = file("leaky.test.mjs", 'test("leaks", () => { mkdirSync(join(process.env.TMPDIR, "copy-of-the-repository")); });');
  // What Node and Chromium leave there of their own accord does not count.
  const tidy = file("tidy.test.mjs", 'test("tidy", () => { mkdirSync(join(process.env.TMPDIR, "node-compile-cache"), { recursive: true }); mkdirSync(join(process.env.TMPDIR, ".org.chromium.Chromium.a1B2c3")); });');
  const temps = () => readdirSync(dirname(dir)).filter((name) => name.startsWith("ouro-script-tests-"));
  const before = temps();
  const run = (file) => {
    const logged = [];
    const report = join(dir, `${Math.random()}.txt`);
    const status = runScriptTests(["--test-reporter=spec", `--test-reporter-destination=${report}`, file], { log: (line) => logged.push(line) });
    return { status, logged: logged.join("\n"), report: readFileSync(report, "utf8") };
  };
  const leaked = run(leaky);
  assert.equal(leaked.status, 1, leaked.report);
  assert.match(leaked.logged, /left 1 item\(s\) in their temp folder[\s\S]*copy-of-the-repository/);
  const clean = run(tidy);
  assert.equal(clean.status, 0, `${clean.logged}\n${clean.report}`);
  assert.deepEqual(temps(), before, "each run removes its temp folder");
  assert.match(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["test:scripts"], /^node scripts\/run-script-tests\.mjs /);
});
