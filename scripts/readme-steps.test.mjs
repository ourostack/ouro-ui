import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readmeSteps, routerAdapterFiles } from "./readme-steps.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const registry = JSON.parse(read("registry.json"));

test("the README's Next.js steps are ouro-base, dialog, then OuroProvider by name, and its two files", () => {
  const steps = readmeSteps(read("README.md"));
  assert.deepEqual(steps.adds, [["ouro-base"], ["dialog"], ["lib-ouro-provider"]]);
  assert.deepEqual(Object.keys(steps.files), ["app/providers.tsx", "app/layout.tsx"]);
  // The install test's fixture is the same provider file, so the full build uses what the README prints.
  assert.equal(steps.files["app/providers.tsx"], read("test/install-fixture-next/src/app/providers.tsx"));
  assert.equal(steps.files["app/layout.tsx"], read("test/install-fixture-next/src/app/layout.tsx"));
});

test("dialog alone does not bring OuroProvider, which is why the README adds it by name", () => {
  const byName = new Map(registry.items.map((item) => [item.name, item]));
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const dep of byName.get(name).registryDependencies ?? []) visit(dep.split("/").at(-1));
  };
  visit("dialog");
  assert.ok(!seen.has("lib-ouro-provider"));
});

test("the install test's Next.js variant runs the README's steps before anything else is added", () => {
  const script = read("scripts/install-test.sh");
  const next = script.slice(script.indexOf('if [ "$variant" = next ]'), script.indexOf('echo "::group::Fixture app"'));
  assert.match(next, /readme-steps\.mjs/);
  assert.ok(next.indexOf("readme-steps.mjs") < next.indexOf("Every component, runtime only"), "the README's steps run first");
});

test("readmeSteps fails when a section or a file is missing", () => {
  assert.throws(() => readmeSteps("# x\n"), /no "### Quick start"|no "### Next.js"/);
  assert.throws(() => readmeSteps("\n### Quick start\n\n### Next.js\n`app/providers.tsx`\n"), /0 tsx blocks/);
});

test("every published first-install command through @ouro adds ouro-base, which no component brings", () => {
  const files = ["README.md", "UPGRADING.md", "site/public/llms.txt", ".github/workflows/release.yml", "site/src/pages/landing.tsx", "site/src/pages/docs.tsx", "docs/guides/installing.md", "docs/guides/testing.md", "docs/guides/forms.md"];
  const missing = [];
  for (const path of files) {
    read(path)
      .split("\n")
      .forEach((line, index) => {
        // An update of what the app already has (--dry-run, --diff, --overwrite) needs no base.
        if (!/shadcn@latest add @ouro\//.test(line) || /--dry-run|--diff|--overwrite/.test(line)) return;
        if (!/add @ouro\/ouro-base /.test(line)) missing.push(`${path}:${index + 1}`);
      });
  }
  assert.deepEqual(missing, [], "Write the command as: npx shadcn@latest add @ouro/ouro-base @ouro/<item>");
});

test("the React Router adapter the OuroProvider page prints is two files the install test type checks", () => {
  const files = routerAdapterFiles(read("docs/OuroProvider.md"));
  assert.deepEqual(Object.keys(files), ["components/ouro-router-link.tsx", "root.tsx"]);
  assert.match(files["components/ouro-router-link.tsx"], /export function OuroRouterLink/);
  assert.match(files["root.tsx"], /<OuroProvider linkComponent=\{OuroRouterLink\}>/);
  assert.doesNotMatch(files["root.tsx"], /next\/link/);
  const script = read("scripts/install-test.sh");
  assert.match(script, /readme-steps\.mjs" write-router "\$app"/);
});
