// An app that installs some components with their tests must reach 100% coverage of the
// files it installed: every file an add brings is one the installed tests cover. The first
// app to adopt the forms could not, because every helper in lib/ouro came with any
// component, and the tests of the helpers it never used belonged to components it had not
// installed.
//
//   node scripts/subset-coverage.mjs            checks each set below
//   node scripts/subset-coverage.mjs button     checks one set of items
//   node scripts/subset-coverage.mjs --list button
//
// For a set of components it reads registry.json as the shadcn CLI does: the install is the
// closure of each `<name>-tests` item. It runs only the test files in that closure, in the
// three browser projects, and measures coverage over only the runtime files in it, with the
// repository's 100% thresholds. A line that only another component's tests reach fails.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The form controls an app builds a form from, with the form itself. */
export const formsSet = ["field", "fieldset", "text-field", "text-area", "checkbox", "checkbox-group", "radio-group", "switch", "form", "select", "native-select", "combobox"];

/** The sets CI checks: each alone, because a union can hide a line only another set's tests reach. */
export const sets = [["button"], ["dialog"], ["sheet"], formsSet, ["button", "dialog", "sheet", ...formsSet]];

const isTest = (path) => /\.test\.tsx?$/.test(path);
const isRuntime = (path) =>
  /\.tsx?$/.test(path) && !/\.d\.ts$|\.test\.tsx?$|\.test-d\.ts$|\.stories\.tsx$|\.spec\.ts$/.test(path) && !path.includes("/lib/ouro/testing/") && !path.includes("/e2e/");

/**
 * What installing `names` with their tests brings: the items in the closure of each
 * `<name>-tests`, the runtime files among their files (what coverage is measured over) and
 * the test files (what runs).
 */
export function subset(registry, names) {
  const byName = new Map(registry.items.map((item) => [item.name, item]));
  const items = new Set();
  const visit = (name) => {
    if (items.has(name)) return;
    const item = byName.get(name);
    if (!item) throw new Error(`registry.json has no ${name} item`);
    items.add(name);
    for (const dep of item.registryDependencies ?? []) visit(dep.split("/").at(-1).split("#")[0]);
  };
  for (const name of names) visit(`${name}-tests`);
  const files = [...items].flatMap((name) => (byName.get(name).files ?? []).map((file) => file.path));
  return { items: [...items].sort(), runtime: files.filter(isRuntime).sort(), tests: files.filter(isTest).sort() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const list = args[0] === "--list";
  const names = args.filter((arg) => !arg.startsWith("--"));
  const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
  for (const set of names.length > 0 ? [names] : sets) {
    const { items, runtime, tests } = subset(registry, set);
    if (list) {
      console.log(JSON.stringify({ items, runtime, tests }, null, 2));
      continue;
    }
    console.log(`::group::Coverage of an install of ${set.join(", ")} with tests: ${runtime.length} files, ${tests.length} test files`);
    const result = spawnSync(
      join(root, "node_modules/.bin/vitest"),
      [
        "run",
        "--coverage",
        ...runtime.map((path) => `--coverage.include=${path}`),
        "--coverage.reporter=text",
        "--coverage.reportOnFailure",
        `--coverage.reportsDirectory=${join(root, ".tmp/subset-coverage")}`,
        "--project=ouro-chromium",
        "--project=ouro-webkit",
        "--project=ouro-touch",
        ...tests,
      ],
      { cwd: root, stdio: "inherit" },
    );
    console.log("::endgroup::");
    if (result.status !== 0) {
      console.log(`::error::An app that installs ${set.join(", ")} with tests does not reach 100% coverage of the installed files (or a test failed). Cover the line in the item's own tests.`);
      process.exit(result.status ?? 1);
    }
  }
  if (!list) console.log("Each set's installed tests cover its installed files to 100%.");
}
