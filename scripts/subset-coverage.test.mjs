import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formsSet, sets, setsTouching, shardSets, subset } from "./subset-coverage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));

const stub = {
  items: [
    { name: "a", registryDependencies: ["ourostack/ouro-ui/lib-x"], files: [{ path: "registry/ouro/components/ouro/a/a.tsx" }] },
    { name: "a-tests", registryDependencies: ["ourostack/ouro-ui/a#v1.0.0", "ourostack/ouro-ui/lib-x-tests", "ourostack/ouro-ui/ouro-testing"], files: [{ path: "registry/ouro/components/ouro/a/a.test.tsx" }, { path: "registry/ouro/components/ouro/a/a.stories.tsx" }, { path: "registry/ouro/e2e/ouro/a.spec.ts" }] },
    { name: "lib-x", files: [{ path: "registry/ouro/lib/ouro/x.ts" }] },
    { name: "lib-x-tests", registryDependencies: ["ourostack/ouro-ui/lib-x"], files: [{ path: "registry/ouro/lib/ouro/x.test.ts" }] },
    { name: "lib-y", files: [{ path: "registry/ouro/lib/ouro/y.ts" }] },
    { name: "ouro-testing", files: [{ path: "registry/ouro/lib/ouro/testing/vitest.ts" }, { path: "registry/ouro/lib/ouro/testing/commands.test.ts" }] },
  ],
};

test("subset is what the CLI installs for <name>-tests: its closure, split into runtime and test files", () => {
  assert.deepEqual(subset(stub, ["a"]), {
    items: ["a", "a-tests", "lib-x", "lib-x-tests", "ouro-testing"],
    runtime: ["registry/ouro/components/ouro/a/a.tsx", "registry/ouro/lib/ouro/x.ts"],
    tests: ["registry/ouro/components/ouro/a/a.test.tsx", "registry/ouro/lib/ouro/testing/commands.test.ts", "registry/ouro/lib/ouro/x.test.ts"],
  });
  assert.throws(() => subset(stub, ["nope"]), /no nope-tests item/);
});

test("CI checks the button, the dialog, the sheet and the forms set, each alone and together", () => {
  assert.deepEqual(sets.slice(0, 3), [["button"], ["dialog"], ["sheet"]]);
  assert.deepEqual(sets[3], formsSet);
  assert.deepEqual(sets[4], ["button", "dialog", "sheet", ...formsSet]);
  for (const name of sets[4]) assert.ok(registry.items.some((item) => item.name === `${name}-tests`), `${name}-tests`);
});

test("installing the button with its tests brings only the helpers it imports, each with the tests that cover it", () => {
  const { runtime, tests } = subset(registry, ["button"]);
  // The helpers the first app excluded from coverage by hand: none arrives with the button.
  for (const stem of ["toast", "stretched-link", "floating"]) assert.ok(!runtime.includes(`registry/ouro/lib/ouro/${stem}.ts`), stem);
  assert.ok(runtime.includes("registry/ouro/components/ouro/button/button.tsx"));
  assert.ok(tests.includes("registry/ouro/components/ouro/button/button.test.tsx"));
  // Every installed helper that has a test file has it installed too.
  for (const path of runtime.filter((file) => file.includes("/lib/ouro/"))) {
    const stem = path.replace(/\.tsx?$/, "");
    const own = registry.items.flatMap((item) => item.files ?? []).map((file) => file.path).filter((file) => file.startsWith(`${stem}.`) && /\.test\.tsx?$/.test(file));
    for (const file of own) assert.ok(tests.includes(file), `${file} is not installed with ${path}`);
  }
});

test("a pull request's reduced run checks only the sets that install a selected component", () => {
  assert.deepEqual(setsTouching(registry, ["checkbox-group"]), [formsSet, sets[4]]);
  assert.deepEqual(setsTouching(registry, ["dialog"]).at(0), ["dialog"]);
  assert.ok(!setsTouching(registry, ["dialog"]).includes(formsSet) || subset(registry, formsSet).items.includes("dialog"));
  assert.deepEqual(setsTouching(registry, ["chart"]), []);
  assert.deepEqual(setsTouching(registry, []), []);
});

test("CI's browser test shards share the sets out: each set in exactly one shard, whatever the count", () => {
  for (const count of [1, 2, 5, 6, 8]) {
    const shards = Array.from({ length: count }, (_, position) => shardSets(sets, { index: position + 1, count }));
    assert.equal(shards.flat().length, sets.length);
    for (const set of sets) assert.equal(shards.filter((shard) => shard.includes(set)).length, 1, `${set.join(",")} with ${count} shards`);
  }
});
