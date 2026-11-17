// Decides how much of the shipped tests CI's prepare job must add to an app restored from an earlier
// run, so a change to a few items adds those items and not all of them (scripts/install-test.sh,
// OURO_INCREMENTAL). Usage:
//   install-delta.mjs plan <built items dir> <manifest>   prints {"mode":"full"} or {"mode":"incremental","items":[...]}
//   install-delta.mjs write <built items dir> <manifest>  records what an app now holds
// An app holds what a full add would, item by item, when each item's built content is the same: the
// manifest records a hash per built item and the paths it writes. Anything that does not fit (no
// manifest, a package no item needs now, a changed root) plans a full add, so the result is never a guess.
// Added, removed and moved items are not that: the files the shipped tests no longer write are removed
// (install-delta.mjs remove) and the new and changed items are added again.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readStdin } from "./read-stdin.mjs";

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
      packages: [...(item.dependencies ?? []), ...(item.devDependencies ?? [])].sort(),
      dependencies: (registryDependencies ?? []).map((dependency) => basename(dependency).replace(/\.json$/, "")).sort(),
      // ouro-base and the other theme items write the app's stylesheet. The base adds them once and no
      // item depends on them, so they are outside the shipped tests' closure and a delta never adds them again.
      stylesheet: Boolean(item.cssVars || item.css),
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

const targetsOf = (entries, names) => new Set([...names].flatMap((name) => entries[name]?.paths ?? []));

// The app holds what a full add of the built items would write when the files the new closure no longer
// writes are removed and the items that are new, changed or newly in the closure are added again. Anything
// that cannot be proved so (a package an item stopped needing, a manifest that predates the package list,
// a changed root, a changed theme item) plans a full add.
export function plan(items, manifest, root = "ouro-tests") {
  const full = (reason) => ({ mode: "full", reason });
  if (!manifest || typeof manifest.items !== "object" || manifest.items === null) return full("no manifest");
  const before = manifest.items;
  const oldClosure = closure(before, root);
  const installed = closure(items, root);
  if (!oldClosure.has(root) || !installed.has(root)) return full(`${root} is missing`);
  if ([...oldClosure].some((name) => !Array.isArray(before[name].packages))) return full("the manifest lists no packages");
  const rootBefore = before[root];
  const rootNow = items[root];
  if (rootBefore.hash !== rootNow.hash || rootBefore.paths.join() !== rootNow.paths.join()) return full(`${root} changed outside the delta`);
  // A theme item writes the stylesheet the restored app holds from the base, which the delta never adds again.
  const restyled = Object.keys(items).find((name) => items[name].stylesheet && before[name]?.hash !== items[name].hash);
  if (restyled) return full(`${restyled} changed the app's stylesheet, which only the base adds`);
  const add = [...installed].filter((name) => name !== root && (!oldClosure.has(name) || before[name].hash !== items[name].hash || before[name].paths.join() !== items[name].paths.join() || before[name].dependencies.join() !== items[name].dependencies.join()));
  const kept = targetsOf(items, installed);
  const remove = [...targetsOf(before, oldClosure)].filter((target) => !kept.has(target)).sort();
  const packagesNow = new Set([...installed].flatMap((name) => items[name].packages));
  const lost = [...oldClosure].flatMap((name) => before[name].packages).find((pkg) => !packagesNow.has(pkg));
  if (lost) return full(`${lost} is no longer needed by an item the shipped tests install`);
  return { mode: "incremental", items: add.sort(), remove };
}

export function manifestOf(items) {
  return { items: Object.fromEntries(Object.entries(items).map(([name, { hash, paths, dependencies, packages }]) => [name, { hash, paths, dependencies: [...dependencies].sort(), packages }])) };
}

// Where an item's target lands in an app: shadcn's aliases (@components, @lib) come from components.json and
// the app's import alias from its tsconfig; "~" is the app's root. Null when the app does not say.
export function appPath(target, aliases, tsPaths) {
  const [head, ...rest] = target.split("/");
  const fromAlias = (alias) => {
    for (const [pattern, [to]] of Object.entries(tsPaths)) {
      const star = pattern.replace(/\*$/, "");
      if (alias.startsWith(star)) return join(to.replace(/\*$/, ""), alias.slice(star.length));
    }
    return null;
  };
  if (head === "~") return fromAlias(target);
  const key = { "@components": "components", "@lib": "lib" }[head];
  const base = key && aliases[key] ? fromAlias(aliases[key]) : null;
  return base === null ? null : join(base, ...rest);
}

export function removeStale(app, targets) {
  const aliases = JSON.parse(readFileSync(join(app, "components.json"), "utf8")).aliases ?? {};
  const tsPaths = JSON.parse(readFileSync(join(app, "tsconfig.app.json"), "utf8")).compilerOptions?.paths ?? {};
  const files = targets.map((target) => appPath(target, aliases, tsPaths));
  if (files.includes(null)) return false;
  for (const file of files) rmSync(join(app, file), { force: true });
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, dir, manifestPath] = process.argv.slice(2);
  const items = readItems(dir);
  if (command === "write") {
    writeFileSync(manifestPath, `${JSON.stringify(manifestOf(items))}\n`);
  } else if (command === "remove") {
    // remove <built items dir> <app dir>: reads the plan's stale targets on stdin
    const targets = JSON.parse(await readStdin());
    if (!removeStale(manifestPath, targets)) process.exit(75);
  } else if (command === "plan") {
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
    console.log(JSON.stringify(plan(items, manifest)));
  } else {
    console.error("usage: install-delta.mjs <plan|write|remove> <built items dir> <manifest or app dir>");
    process.exit(2);
  }
}
