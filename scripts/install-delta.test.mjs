import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { URL } from "node:url";
import test from "node:test";
import { closure, manifestOf, plan, readItems } from "./install-delta.mjs";
import { scratchDir } from "./scratch.mjs";

const item = (hash, paths = ["a.ts"], dependencies = []) => ({ hash, paths, dependencies });
const base = () => ({
  "ouro-tests": item("t", ["t.ts"], ["button", "button-tests"]),
  button: item("b1", ["button.tsx"]),
  "button-tests": item("bt1", ["button.test.tsx"], ["button"]),
  extra: item("e1", ["extra.tsx"]),
});

test("the install delta adds only the changed items the shipped tests install", () => {
  const before = manifestOf(base());
  const now = base();
  now["button-tests"] = item("bt2", ["button.test.tsx"], ["button"]);
  assert.deepEqual(plan(now, before), { mode: "incremental", items: ["button-tests"] });
  assert.deepEqual(plan(base(), before), { mode: "incremental", items: [] });
  const grown = base();
  grown["button-tests"] = item("bt3", ["button.test.tsx", "button.weight.test.tsx"], ["button"]);
  assert.deepEqual(plan(grown, before), { mode: "incremental", items: ["button-tests"] });
  const gained = base();
  gained["button-tests"] = item("bt1", ["button.test.tsx"], ["button", "extra"]);
  assert.deepEqual(plan(gained, before), { mode: "incremental", items: ["button-tests"] });
  const outside = base();
  outside.extra = item("e2", ["extra.tsx"]);
  assert.deepEqual(plan(outside, before), { mode: "incremental", items: [] });
});

test("the install delta adds everything when the app cannot be proved to match a full add", () => {
  const before = manifestOf(base());
  const assertFull = (result) => {
    assert.equal(result.mode, "full");
    assert.equal(typeof result.reason, "string");
    assert.ok(result.reason.length > 0);
  };
  assertFull(plan(base(), null));
  assertFull(plan(base(), {}));
  const moved = base();
  moved.button = item("b1", ["ui/button.tsx"]);
  assertFull(plan(moved, before));
  const dropped = base();
  dropped["button-tests"] = item("bt4", [], ["button"]);
  assertFull(plan(dropped, before));
  const redepended = base();
  redepended["button-tests"] = item("bt1", ["button.test.tsx"], []);
  assertFull(plan(redepended, before));
  const added = { ...base(), fresh: item("f") };
  assertFull(plan(added, before));
  const root = base();
  root["ouro-tests"] = item("t2", ["t.ts"], ["button", "button-tests"]);
  assertFull(plan(root, before));
});

test("the install delta closure follows dependencies from the root", () => {
  assert.deepEqual([...closure(base(), "ouro-tests")].sort(), ["button", "button-tests", "ouro-tests"]);
});

test("the install delta reads built items without the folder their dependencies name", () => {
  const dir = scratchDir("delta-");
  {
    const write = (name, registryDependencies, content) =>
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ name, registryDependencies, files: [{ path: `${name}.tsx`, content }] }));
    write("one", ["/tmp/x/two.json"], "a");
    write("two", [], "b");
    const first = readItems(dir);
    write("one", ["/tmp/y/two.json"], "a");
    assert.equal(readItems(dir).one.hash, first.one.hash);
    assert.deepEqual(first.one.dependencies, ["two"]);
    write("one", ["/tmp/y/two.json"], "changed");
    assert.notEqual(readItems(dir).one.hash, first.one.hash);
  }
});

test("the install test adds a delta's items by their built address, never a bare name the shadcn registry would be asked for", () => {
  const script = readFileSync(new URL("./install-test.sh", import.meta.url), "utf8");
  assert.match(script, /console\.log\(process\.argv\[2\] \+ "\/" \+ item \+ "\.json"\)' "\$delta_plan" "\$registry\/r"/);
});
