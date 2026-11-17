import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { URL } from "node:url";
import test from "node:test";
import { appPath, closure, manifestOf, plan, readItems, removeStale } from "./install-delta.mjs";
import { scratchDir } from "./scratch.mjs";

const item = (hash, paths = ["a.ts"], dependencies = [], packages = []) => ({ hash, paths, dependencies, packages });
const base = () => ({
  "ouro-tests": item("t", ["t.ts"], ["button", "button-tests"]),
  button: item("b1", ["button.tsx"]),
  "button-tests": item("bt1", ["button.test.tsx"], ["button"]),
  extra: item("e1", ["extra.tsx"]),
});

const files = (items, names) => Object.fromEntries([...names].flatMap((name) => items[name].paths.map((path) => [path, items[name].hash])));
const fullAdd = (items) => files(items, closure(items, "ouro-tests"));

// An app restored from the manifest holds a full add of the earlier registry; the delta removes what the plan
// says and adds the items it names (an add overwrites), and the result must be a full add of the new registry.
const applyDelta = (before, now) => {
  const result = plan(now, manifestOf(before));
  assert.equal(result.mode, "incremental");
  const app = fullAdd(before);
  for (const path of result.remove) delete app[path];
  return Object.assign(app, files(now, new Set(result.items)));
};

test("the install delta adds only the changed items the shipped tests install", () => {
  const before = manifestOf(base());
  const now = base();
  now["button-tests"] = item("bt2", ["button.test.tsx"], ["button"]);
  assert.deepEqual(plan(now, before), { mode: "incremental", items: ["button-tests"], remove: [] });
  assert.deepEqual(plan(base(), before), { mode: "incremental", items: [], remove: [] });
  const outside = base();
  outside.extra = item("e2", ["extra.tsx"]);
  assert.deepEqual(plan(outside, before), { mode: "incremental", items: [], remove: [] });
});

test("the install delta result equals a full add when items are changed, added, removed or moved", () => {
  const before = base();
  const grown = base();
  grown["button-tests"] = item("bt3", ["button.test.tsx", "button.weight.test.tsx"], ["button"]);
  const gained = base();
  gained["button-tests"] = item("bt1", ["button.test.tsx"], ["button", "extra"]);
  const added = base();
  added["ouro-tests"] = item("t", ["t.ts"], ["button", "button-tests", "fresh-tests"]);
  added["fresh-tests"] = item("f", ["fresh.test.tsx"], ["button"]);
  const removed = base();
  removed["ouro-tests"] = item("t", ["t.ts"], ["button"]);
  const moved = base();
  moved.button = item("b2", ["ui/button.tsx"]);
  const shrunk = base();
  shrunk["button-tests"] = item("bt5", ["button.test.tsx"], ["button"]);
  const swapped = base();
  swapped["button-tests"] = item("bt6", ["other.test.tsx"], ["button"]);
  for (const now of [grown, gained, added, removed, moved, shrunk, swapped]) assert.deepEqual(applyDelta(before, now), fullAdd(now));
  assert.deepEqual(plan(moved, manifestOf(before)).remove, ["button.tsx"]);
  assert.deepEqual(plan(removed, manifestOf(before)).remove, ["button.test.tsx"]);
  const shared = base();
  shared["button-tests"] = item("bt7", ["button.tsx"], ["button"]);
  assert.deepEqual(plan(shared, manifestOf(before)).remove, ["button.test.tsx"]);
});

test("the install delta adds everything when a theme item changed, since only the base writes the app's stylesheet", () => {
  const withTheme = () => ({ ...base(), "ouro-base": { ...item("o1", []), stylesheet: true } });
  const before = manifestOf(withTheme());
  assert.equal(plan(withTheme(), before).mode, "incremental");
  const changed = withTheme();
  changed["ouro-base"] = { ...item("o2", []), stylesheet: true };
  assert.deepEqual(plan(changed, before), { mode: "full", reason: "ouro-base changed the app's stylesheet, which only the base adds" });
  assert.equal(plan(withTheme(), manifestOf(base())).mode, "full");
  // An item that is not a theme item and is outside the closure still changes nothing.
  const outside = withTheme();
  outside.extra = item("e2", ["extra.tsx"]);
  assert.equal(plan(outside, before).mode, "incremental");
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
  assertFull(plan(base(), { items: Object.fromEntries(Object.entries(before.items).map(([name, entry]) => [name, { ...entry, packages: undefined }])) }));
  const root = base();
  root["ouro-tests"] = item("t2", ["t.ts"], ["button", "button-tests"]);
  assertFull(plan(root, before));
  const needed = base();
  needed.button = item("b3", ["button.tsx"], [], ["clsx"]);
  const withPackage = manifestOf(needed);
  assertFull(plan(base(), withPackage));
});

test("app paths come from the app's own aliases, and a path they do not cover stops the removal", () => {
  const ts = { "~/*": ["./src/*"] };
  const aliases = { components: "~/components", lib: "~/lib" };
  assert.equal(appPath("~/e2e/ouro/a.spec.ts", aliases, ts), "src/e2e/ouro/a.spec.ts");
  assert.equal(appPath("@components/ouro/a/a.tsx", aliases, ts), "src/components/ouro/a/a.tsx");
  assert.equal(appPath("@lib/ouro/x.ts", aliases, ts), "src/lib/ouro/x.ts");
  assert.equal(appPath("@lib/ouro/x.ts", {}, ts), null);
  assert.equal(appPath("@elsewhere/x.ts", aliases, ts), null);
  const app = scratchDir("delta-app-");
  writeFileSync(join(app, "components.json"), JSON.stringify({ aliases }));
  writeFileSync(join(app, "tsconfig.app.json"), JSON.stringify({ compilerOptions: { paths: ts } }));
  mkdirSync(join(app, "src/lib/ouro"), { recursive: true });
  writeFileSync(join(app, "src/lib/ouro/x.ts"), "x");
  assert.equal(removeStale(app, ["@elsewhere/y.ts", "@lib/ouro/x.ts"]), false);
  assert.ok(existsSync(join(app, "src/lib/ouro/x.ts")));
  assert.equal(removeStale(app, ["@lib/ouro/x.ts", "@lib/ouro/missing.ts"]), true);
  assert.ok(!existsSync(join(app, "src/lib/ouro/x.ts")));
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
    assert.equal(first.one.stylesheet, false);
    writeFileSync(join(dir, "theme.json"), JSON.stringify({ name: "theme", cssVars: { theme: { "radius-ouro-lg": "1rem" } } }));
    writeFileSync(join(dir, "plain.json"), JSON.stringify({ name: "plain", css: { ".x": { color: "red" } } }));
    assert.equal(readItems(dir).theme.stylesheet, true);
    assert.equal(readItems(dir).plain.stylesheet, true);
  }
});

test("the install test adds a delta's items by their built address, never a bare name the shadcn registry would be asked for", () => {
  const script = readFileSync(new URL("./install-test.sh", import.meta.url), "utf8");
  assert.match(script, /console\.log\(process\.argv\[2\] \+ "\/" \+ item \+ "\.json"\)' "\$delta_plan" "\$registry\/r"/);
});
