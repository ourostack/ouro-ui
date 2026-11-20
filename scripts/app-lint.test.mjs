import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "./registry.mts";

// What an app's linter says about the source the runtime items install. A stock Vite app
// lints with oxlint and the config in scripts/fixtures/vite-oxlint (Vite's react-ts
// template), so a fresh install must add no warnings to its `npm run lint`.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const optional = (name) => name === "ouro-testing" || name === "ouro-tests" || name.endsWith("-tests");

test("the runtime items' source passes a stock Vite app's oxlint with no warnings", () => {
  const files = buildRegistry(root)
    .items.filter((item) => !optional(item.name))
    .flatMap((item) => item.files ?? [])
    .map((file) => file.path)
    .filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".d.ts"));
  assert.ok(files.length > 10);
  const result = spawnSync(
    join(root, "node_modules/.bin/oxlint"),
    ["-c", "scripts/fixtures/vite-oxlint/.oxlintrc.json", "--format", "unix", ...files],
    { cwd: root, encoding: "utf8" },
  );
  const warnings = result.stdout.split("\n").filter((line) => /: (warning|error) /i.test(line) || /\[(Warning|Error)/.test(line));
  assert.deepEqual(warnings, [], result.stdout);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

// Children passed as a prop, which apps lint for (react(no-children-prop), in oxlint's and ESLint's React rules) and
// some hold to a ratchet that refuses a new hit: every file an item installs, its tests and type tests too, passes
// children as children, so an update never raises that count in an app (spoonjoy-v2#814).
test("no file an item installs passes children as a prop", () => {
  const files = [...new Set(buildRegistry(root).items.flatMap((item) => item.files ?? []).map((file) => file.path))].filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".d.ts"));
  assert.ok(files.some((path) => path.endsWith(".test-d.ts")), "the type tests are among them");
  const result = spawnSync(join(root, "node_modules/.bin/oxlint"), ["--react-plugin", "-A", "all", "-D", "react/no-children-prop", "--format", "unix", ...files], { cwd: root, encoding: "utf8" });
  const hits = result.stdout.split("\n").filter((line) => line.includes("no-children-prop"));
  assert.deepEqual(hits, [], "pass children as JSX children; a type test checks a call's props through propsOf, as menu.test-d.ts does");
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
