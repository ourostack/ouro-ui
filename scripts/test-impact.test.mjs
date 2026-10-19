import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { coverageOnlyFailure, e2eArgs, runBrowserTests, storyFolders, testImpact, vitestArgs } from "./test-impact.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const components = "registry/ouro/components/ouro";

/**
 * A repository of component folders: checklist's runtime imports checkbox, form's story renders a
 * checklist, radio's test a checkbox, field's test a radio, and slider imports none of them.
 */
function fixture() {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp/test-impact-"));
  const write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  write(`${components}/checkbox/component.json`, JSON.stringify({ order: 1, components: ["checkbox", "checkbox-group"] }));
  write(`${components}/checkbox/checkbox-styles.ts`, 'export const box = "size-4";\n');
  write(`${components}/checkbox/checkbox.tsx`, 'import { box } from "./checkbox-styles";\nexport const Checkbox = () => box;\n');
  write(`${components}/checkbox/checkbox-group.tsx`, 'import { Checkbox } from "./checkbox";\nexport const CheckboxGroup = Checkbox;\n');
  write(`${components}/checklist/component.json`, JSON.stringify({ order: 2, components: ["checklist"] }));
  write(`${components}/checklist/checklist.tsx`, 'import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";\nexport const Checklist = Checkbox;\n');
  write(`${components}/form/component.json`, JSON.stringify({ order: 3, components: ["form"] }));
  write(`${components}/form/form.stories.tsx`, 'import { Checklist } from "../checklist/checklist";\nexport default { title: "Forms/Form", component: Checklist };\n');
  write(`${components}/slider/component.json`, JSON.stringify({ order: 4, components: ["slider"] }));
  write(`${components}/slider/slider.tsx`, '// import { Checkbox } from "../checkbox/checkbox";\nimport { cn } from "@/registry/ouro/lib/ouro/cn";\nexport const Slider = cn;\n');
  // radio's test renders a checkbox; field's test renders a radio, whose runtime never imports checkbox.
  write(`${components}/radio/component.json`, JSON.stringify({ order: 5, components: ["radio"] }));
  write(`${components}/radio/radio.test.tsx`, 'import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";\nexport const used = Checkbox;\n');
  write(`${components}/radio/radio.tsx`, "export const Radio = 1;\n");
  write(`${components}/field/component.json`, JSON.stringify({ order: 6, components: ["field"] }));
  write(`${components}/field/field.test.tsx`, 'import { Radio } from "../radio/radio";\nexport const used = Radio;\n');
  write("registry/ouro/e2e/ouro/checklist.spec.ts", 'import { test } from "../ouro-fixtures";\ntest("x", () => {});\n');
  return dir;
}

test("a change to checkbox-styles.ts selects checkbox, its siblings and every component that imports them, and not slider", () => {
  const impact = testImpact([`${components}/checkbox/checkbox-styles.ts`], fixture());
  assert.equal(impact.full, false);
  // An import through a component's runtime carries on to its importers; one from a test or story stops there.
  assert.deepEqual(impact.components, ["checkbox", "checkbox-group", "checklist", "form", "radio"]);
  assert.ok(!impact.components.includes("slider"));
  assert.ok(impact.reasons.some((reason) => reason.startsWith(`${components}/checkbox/checkbox-styles.ts: `)));
  assert.ok(impact.reasons.some((reason) => /checklist: imports checkbox/.test(reason)), impact.reasons.join("\n"));
});

test("in this repository, a change to checkbox-styles.ts selects checkbox and checkbox-group, and not slider", () => {
  const impact = testImpact([`${components}/checkbox/checkbox-styles.ts`]);
  assert.equal(impact.full, false);
  assert.ok(impact.components.includes("checkbox") && impact.components.includes("checkbox-group"), impact.components.join());
  assert.ok(!impact.components.includes("slider"));
});

test("a component's own end-to-end spec selects that component", () => {
  const impact = testImpact(["registry/ouro/e2e/ouro/checklist.spec.ts"], fixture());
  assert.deepEqual(impact, { full: false, reasons: ["registry/ouro/e2e/ouro/checklist.spec.ts: checklist's end-to-end spec", "form: its tests or stories import checklist"], components: ["checklist", "form"] });
});

for (const [path, reason] of [
  ["registry/ouro/theme/ouro-base.css", /the theme/],
  ["registry/ouro/lib/ouro/cn.ts", /shared helper/],
  ["scripts/registry.mts", /generator or check/],
  ["test/stories.tsx", /shared test setup/],
  ["vitest.config.ts", /Vitest configuration/],
  ["vitest.workspace.config.mts", /Vitest configuration/],
  ["package.json", /dependencies/],
  ["pnpm-lock.yaml", /dependencies/],
  [".github/workflows/ci.yml", /workflow/],
  ["registry/ouro/e2e/ouro/story.ts", /shared end-to-end/],
  ["stories/reference/sheet-feel.stories.tsx", /not mapped/],
  ["app.css", /not mapped/],
  [`${components}/gone/gone.tsx`, /no component\.json/],
]) {
  test(`${path} runs everything, with the reason`, () => {
    const impact = testImpact(["README.md", path], fixture());
    assert.equal(impact.full, true);
    assert.ok(impact.reasons.some((line) => line.startsWith(`${path}: `) && reason.test(line)), impact.reasons.join("\n"));
    assert.deepEqual(impact.components, ["checkbox", "checkbox-group", "checklist", "field", "form", "radio", "slider"]);
  });
}

test("no changed file at all runs everything", () => {
  assert.deepEqual(testImpact([], fixture()).full, true);
});

test("docs, change fragments, generated files and the site affect no component's tests", () => {
  const impact = testImpact(["README.md", "docs/Checkbox.md", "changes/checkbox.md", "registry.json", "site/src/docs/catalog.json", "site/public/llms.txt", "UPGRADING.md"], fixture());
  assert.equal(impact.full, false);
  assert.deepEqual(impact.components, []);
  assert.equal(impact.reasons.length, 7);
});

test("the reduced Vitest run keeps every project, measures coverage over the selected folders only and filters the stories", () => {
  const dir = fixture();
  const args = vitestArgs(["checkbox-group", "checklist"], dir);
  for (const project of ["ouro-chromium", "ouro-webkit", "ouro-touch", "site"]) assert.ok(args.includes(`--project=${project}`), project);
  assert.ok(args.includes("--coverage"));
  assert.deepEqual(args.filter((arg) => arg.startsWith("--coverage.include=")), [`--coverage.include=${components}/checkbox/**`, `--coverage.include=${components}/checklist/**`]);
  // The shared suites in test/ and the site's tests always run, so every project writes its partition.
  assert.deepEqual(args.filter((arg) => !arg.startsWith("--")), [`${components}/checkbox/`, `${components}/checklist/`, "test/", "site/"]);
  assert.equal(storyFolders(["checkbox-group", "checklist"], dir), "checkbox,checklist");
});

test("with no component selected, the reduced Vitest run measures no coverage and still runs every project", () => {
  const args = vitestArgs([], fixture());
  assert.ok(!args.some((arg) => arg.startsWith("--coverage")));
  assert.deepEqual(args.filter((arg) => !arg.startsWith("--")), ["test/", "site/"]);
  assert.equal(args.filter((arg) => arg.startsWith("--project=")).length, 4);
});

test("each project in the reduced run has test files in test/ or site/, so none goes missing from the motion evidence", () => {
  const files = (dir) => readdirSync(join(root, dir), { recursive: true }).map(String);
  const shared = files("test").filter((file) => !file.startsWith("themes") && !file.includes("install-fixture") && !file.includes("form-answer"));
  assert.ok(shared.some((file) => /(?<!\.touch|\.visual)\.test\.tsx?$/.test(file)), "ouro-chromium and ouro-webkit");
  assert.ok(shared.some((file) => /\.touch\.test\.tsx?$/.test(file)), "ouro-touch");
  assert.ok(files("site").some((file) => /\.test\.tsx?$/.test(file) && !file.startsWith("e2e")), "site");
});

test("the reduced end-to-end run takes the selected components' specs and the site's", () => {
  const args = e2eArgs(["checkbox", "checklist"], fixture());
  assert.deepEqual(args, ["registry/ouro/e2e/ouro/checklist.spec.ts", "site/e2e/"]);
  assert.deepEqual(e2eArgs([], fixture()), ["site/e2e/"]);
  // In this repository, every component the plan can name has a spec file there or none.
  for (const arg of e2eArgs(["checkbox", "dialog"])) assert.ok(existsSync(join(root, arg)), arg);
});

const vitestLog = (summary) => `\n Test Files  ${summary}\n      Tests  12 passed (12)\n`;

test("a coverage threshold is the only failure the full suite decides", () => {
  assert.equal(coverageOnlyFailure(`${vitestLog("4 passed (4)")}ERROR: Coverage for branches (97.5%) does not meet global threshold (100%)\n`), true);
  assert.equal(coverageOnlyFailure(`\x1b[31m${vitestLog("1 failed | 3 passed (4)")}\x1b[39mERROR: Coverage for lines (97%) does not meet global threshold (100%)\n`), false);
  assert.equal(coverageOnlyFailure(vitestLog("4 passed (4)")), false);
  assert.equal(coverageOnlyFailure(`${vitestLog("4 passed (4)")}Unhandled Errors\nERROR: Coverage for lines (97%) does not meet global threshold (100%)\n`), false);
});

test("the reduced run passes on its own, and falls back to the full suite only when only coverage failed", async () => {
  const run = async (results) => {
    const calls = [];
    const outputs = [];
    const status = await runBrowserTests(["checkbox"], {
      root: fixture(),
      spawn: async (command, args, env) => {
        calls.push([command, ...args, env.OURO_STORIES ?? "(every story)"].join(" "));
        return results.shift();
      },
      output: (line) => outputs.push(line),
      log: () => {},
    });
    return { status, calls, outputs };
  };
  const passed = await run([{ status: 0, log: vitestLog("4 passed (4)") }]);
  assert.equal(passed.status, 0);
  assert.equal(passed.calls.length, 1);
  assert.match(passed.calls[0], /^pnpm exec vitest run .*registry\/ouro\/components\/ouro\/checkbox\/ test\/ site\/ checkbox$/);
  assert.deepEqual(passed.outputs, ["reduced=true", "stems=checkbox,checkbox-group"]);

  const failed = await run([{ status: 1, log: vitestLog("1 failed | 3 passed (4)") }]);
  assert.equal(failed.status, 1);
  assert.equal(failed.calls.length, 1);

  const coverage = await run([
    { status: 1, log: `${vitestLog("4 passed (4)")}ERROR: Coverage for lines (99%) does not meet global threshold (100%)` },
    { status: 0, log: "" },
  ]);
  assert.equal(coverage.status, 0);
  assert.deepEqual(coverage.calls[1], "pnpm test (every story)");
  assert.deepEqual(coverage.outputs, ["reduced=false", "stems="]);
});
