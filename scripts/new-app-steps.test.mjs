// The installing guide's "Start a new app" steps for Vite are the install test's own Vite app
// (test/install-fixture), with `~` where a reader writes `@`, so the steps a newcomer copies are
// the files CI installs every component into and type-checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const guide = read("docs/guides/installing.md");

/** The guide's `### Vite` section under "Start a new app". */
function viteSection() {
  const start = guide.indexOf("\n## Start a new app\n");
  assert.ok(start >= 0, 'docs/guides/installing.md has no "## Start a new app" section');
  const vite = guide.indexOf("\n### Vite\n", start);
  assert.ok(vite >= 0, 'the "Start a new app" section has no "### Vite" part');
  const end = guide.indexOf("\n### ", vite + 1);
  return guide.slice(vite, end);
}
const blocks = (text, language) => [...text.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))].map((match) => match[1]);
const asReaderWrites = (text) => text.replaceAll('"~"', '"@"').replaceAll('"~/*"', '"@/*"');

test("the guide's new Vite app steps write the install test's Vite app, with @ for its ~", () => {
  const section = viteSection();
  const [css] = blocks(section, "css");
  assert.equal(css, read("test/install-fixture/src/index.css"));
  const [config] = blocks(section, "ts");
  assert.equal(config, asReaderWrites(read("test/install-fixture/vite.config.ts")));
  const [paths] = blocks(section, "json");
  for (const file of ["test/install-fixture/tsconfig.json", "test/install-fixture/tsconfig.app.json"]) {
    const compilerOptions = JSON.parse(read(file)).compilerOptions;
    assert.deepEqual(JSON.parse(`{${paths}}`).paths, JSON.parse(asReaderWrites(JSON.stringify({ paths: compilerOptions.paths }))).paths, file);
    assert.equal(compilerOptions.baseUrl, undefined, `${file} has no baseUrl, as the guide says`);
  }
  const fixtureDevDependencies = Object.keys(JSON.parse(read("test/install-fixture/package.json")).devDependencies);
  const installs = blocks(section, "sh").flatMap((block) => block.split("\n")).filter((line) => line.startsWith("npm install -D "));
  assert.equal(installs.length, 1, "one npm install -D line");
  for (const name of installs[0].slice("npm install -D ".length).split(" ")) assert.ok(fixtureDevDependencies.includes(name), `the install fixture has ${name}`);
});
