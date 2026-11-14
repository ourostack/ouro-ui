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
});

test("the install delta adds everything when the app cannot be proved to match a full add", () => {
  const before = manifestOf(base());
  const full = { mode: "full" };
  assert.deepEqual(plan(base(), null), full);
  assert.deepEqual(plan(base(), {}), full);
  const moved = base();
  moved.button = item("b1", ["ui/button.tsx"]);
  assert.deepEqual(plan(moved, before), full);
  const redepended = base();
  redepended["button-tests"] = item("bt1", ["button.test.tsx"], []);
  assert.deepEqual(plan(redepended, before), full);
  const added = { ...base(), fresh: item("f") };
  assert.deepEqual(plan(added, before), full);
  const outside = base();
  outside.extra = item("e2", ["extra.tsx"]);
  assert.deepEqual(plan(outside, before), full);
  const root = base();
  root["ouro-tests"] = item("t2", ["t.ts"], ["button", "button-tests"]);
  assert.deepEqual(plan(root, before), full);
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
