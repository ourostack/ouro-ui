// Decides how much of the shipped tests CI's prepare job must add to an app restored from an earlier
// run, so a change to a few items adds those items and not all of them (scripts/install-test.sh,
// OURO_INCREMENTAL). Usage:
//   install-delta.mjs plan <built items dir> <manifest>   prints {"mode":"full"} or {"mode":"incremental","items":[...]}
//   install-delta.mjs write <built items dir> <manifest>  records what an app now holds
// An app holds what a full add would, item by item, when each item's built content is the same: the
// manifest records a hash per built item and the paths it writes. Anything that does not fit (no
// manifest, an item gone, a path an item stopped writing, a changed item the shipped tests do not
// install) plans a full add, so the result is never a guess.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

// registryDependencies hold the temporary folder the built items sit in, so they are left out; the
// dependency's own item is hashed under its own name.
export function readItems(dir) {
  const items = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "registry.json") continue;
    const item = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (typeof item.name !== "string") continue;
    const { registryDependencies, ...rest } = item;
    items[item.name] = {
      hash: createHash("sha256").update(JSON.stringify(canonical(rest))).digest("hex"),
      paths: (item.files ?? []).map((entry) => entry.target ?? entry.path).sort(),
      dependencies: (registryDependencies ?? []).map((dependency) => basename(dependency).replace(/\.json$/, "")).sort(),
    };
  }
  return items;
}

export function closure(items, root) {
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name) || !items[name]) return;
    seen.add(name);
    for (const dependency of items[name].dependencies) visit(dependency);
  };
  visit(root);
  return seen;
}

export function plan(items, manifest, root = "ouro-tests") {
  const full = { mode: "full" };
  if (!manifest || typeof manifest.items !== "object" || manifest.items === null) return full;
  const installed = closure(items, root);
  const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
  const names = Object.keys(items);
  if (names.length !== Object.keys(manifest.items).length) return full;
  const changed = [];
  for (const name of names) {
    const before = manifest.items[name];
    const now = items[name];
    // The shape of the install (its files and what it depends on) must be what the app was built from:
    // a new, removed or moved file, or a new dependency, is the base's job (its runtime checks), not a delta's.
    if (!before || !same(before.paths, now.paths) || !same(before.dependencies, now.dependencies)) return full;
    if (before.hash !== now.hash) changed.push(name);
  }
  if (changed.some((name) => !installed.has(name) || name === root)) return full;
  return { mode: "incremental", items: changed.sort() };
}

export function manifestOf(items) {
  return { items: Object.fromEntries(Object.entries(items).map(([name, { hash, paths, dependencies }]) => [name, { hash, paths, dependencies: [...dependencies].sort() }])) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, dir, manifestPath] = process.argv.slice(2);
  const items = readItems(dir);
  if (command === "write") {
    writeFileSync(manifestPath, `${JSON.stringify(manifestOf(items))}\n`);
  } else if (command === "plan") {
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
    console.log(JSON.stringify(plan(items, manifest)));
  } else {
    console.error("usage: install-delta.mjs <plan|write> <built items dir> <manifest>");
    process.exit(2);
  }
}
