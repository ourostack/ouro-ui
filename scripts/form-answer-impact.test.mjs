import assert from "node:assert/strict";
import { test } from "node:test";
import { proofImpact, proofFolders } from "./form-answer-impact.mjs";

/** A plan that runs everything for lib/ and selects each changed component folder, plus form when text-field changes. */
const plan = (files) => {
  if (files.some((path) => !path.startsWith("registry/ouro/components/ouro/"))) return { full: true, reasons: ["full"], components: [] };
  const folders = new Set(files.map((path) => path.split("/")[4]));
  if (folders.has("text-field")) folders.add("form");
  return { full: false, reasons: [], components: [...folders] };
};
const folders = (components) => components.join(",");
const run = (files) => proofImpact(files, plan, folders).run;

test("the Form answer proof runs for a change that reaches form, link or radio-group, through the plan's import graph", () => {
  assert.deepEqual(proofFolders, ["form", "link", "radio-group"]);
  assert.equal(run(["registry/ouro/components/ouro/link/link.tsx"]), true);
  assert.equal(run(["registry/ouro/components/ouro/text-field/text-field.tsx", "README.md"]), true);
  assert.equal(run(["registry/ouro/components/ouro/avatar/avatar.tsx"]), false);
});

test("the Form answer proof runs whenever the plan runs everything, for its own files, and when the diff is empty", () => {
  for (const path of ["registry/ouro/lib/ouro/form-answer.ts", "registry/ouro/theme/ouro-base.css", "test/form-answer.probe.tsx", "test/form-answer.config.ts", "test/form-answer-fixture/package.json", "test/conformance/commands.ts", "vitest.config.ts", "pnpm-lock.yaml", "app.css", "scripts/vitest-shards.mts", "scripts/shard.mjs", "scripts/shard-timings.json", "site/scripts/proof.mts", ".github/workflows/form-answer-proof.yml", ".github/actions/playwright-browsers/action.yml"]) {
    assert.equal(run([path]), true, path);
  }
  assert.equal(run([]), true);
});

test("the Form answer proof skips a change to paths it never loads, which CI's plan would run everything for", () => {
  const files = ["scripts/claims-urls.json", "scripts/ci-budget.mjs", "site/src/styles.css", "site/scripts/prerender.mts", "test/__screenshots__/screenshots.visual.test.tsx/avatar-linux.png", "test/install-fixture/package.json", "test/inspector-toaster.test.tsx", "registry/ouro/e2e/ouro/dialog.spec.ts", "stories/reference/a.stories.tsx", ".github/workflows/ci.yml"];
  for (const path of files) assert.equal(run([path]), false, path);
  const { reasons } = proofImpact(files, plan, folders);
  assert.equal(reasons.length, files.length);
  assert.match(reasons[0], /^scripts\/claims-urls\.json: a script vitest\.config\.ts does not import, which the proof does not load$/);
});

test("with the repository's own plan, a change to time-grid skips the proof and one to text-field, which form imports, runs it", async () => {
  const { storyFolders, testImpact } = await import("./test-impact.mjs");
  const real = (files) => proofImpact(files, testImpact, storyFolders).run;
  assert.equal(real(["registry/ouro/components/ouro/time-grid/time-grid.tsx", "changes/time-grid.md", "scripts/claims-urls.json"]), false);
  assert.equal(real(["registry/ouro/components/ouro/text-field/text-field.tsx"]), true);
  assert.equal(real(["registry/ouro/components/ouro/radio-group/radio-group.tsx"]), true);
});
