import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { storyFileSelected } from "../test/story-selection.ts";
import { decideReducedRun, e2eArgs, runBrowserShard, storyFolders, testImpact, vitestArgs } from "./test-impact.mjs";

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
  write(`${components}/checkbox/checkbox-styles.ts`, 'import { cn } from "@/registry/ouro/lib/ouro/cn";\nexport const box = cn("size-4");\n');
  // lib/: cn loads tones at run time and kind only for a type; the checkbox test's act is the test kit; nothing loads toast.
  write("registry/ouro/lib/ouro/cn.ts", 'import { tone } from "./tones";\nimport type { Kind } from "./kind";\nexport const cn = (name: Kind) => tone + name;\n');
  write("registry/ouro/lib/ouro/cn.test.ts", 'import { cn } from "./cn";\nexport const used = cn;\n');
  write("registry/ouro/lib/ouro/tones.ts", 'export const tone = "";\n');
  write("registry/ouro/lib/ouro/kind.ts", "export type Kind = string;\n");
  write("registry/ouro/lib/ouro/toast.ts", "export const toast = 1;\n");
  write("registry/ouro/lib/ouro/testing/act.ts", "export const act = 1;\n");
  write(`${components}/checkbox/checkbox.test.tsx`, 'import { act } from "@/registry/ouro/lib/ouro/testing/act";\nexport const used = act;\n');
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
  write("site/src/docs/demos/checklist.demo.tsx", 'import { Checklist } from "@/registry/ouro/components/ouro/checklist/checklist";\nimport { Icon } from "../../components/icons";\nimport { wait } from "./wait";\nexport default [Checklist, Icon, wait];\n');
  // Files the demos load (and so the text-size scan renders), and a site page they do not.
  write("site/src/docs/demos/wait.ts", "export const wait = 1;\n");
  write("site/src/components/icons.tsx", 'import type { JSX } from "react";\nexport const Icon = (): JSX.Element | null => null;\n');
  write("site/src/pages/home.tsx", 'import { Icon } from "../components/icons";\nexport default Icon;\n');
  // toggle's own code imports nothing, but its docs demo renders a checkbox.
  write(`${components}/toggle/component.json`, JSON.stringify({ order: 7, components: ["toggle"] }));
  write(`${components}/toggle/toggle.tsx`, "export const Toggle = 1;\n");
  write("site/src/docs/demos/toggle.demo.tsx", 'import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";\nexport default Checkbox;\n');
  write("registry/ouro/e2e/ouro/checklist.spec.ts", 'import { test } from "../ouro-fixtures";\ntest("x", () => {});\n');
  return dir;
}

test("a change to checkbox-styles.ts selects checkbox, its siblings and every component that imports them, and not slider", () => {
  const impact = testImpact([`${components}/checkbox/checkbox-styles.ts`], fixture());
  assert.equal(impact.full, false);
  // An import through a component's runtime carries on to its importers; one from a test or story stops there.
  assert.deepEqual(impact.components, ["checkbox", "checkbox-group", "checklist", "form", "radio", "toggle"]);
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
  assert.deepEqual(impact, { full: false, reasons: ["registry/ouro/e2e/ouro/checklist.spec.ts: checklist's end-to-end spec", "form: its tests, stories or docs demo import checklist"], components: ["checklist", "form"] });
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
    assert.deepEqual(impact.components, ["checkbox", "checkbox-group", "checklist", "field", "form", "radio", "slider", "toggle"]);
  });
}

test("no changed file at all runs everything", () => {
  assert.deepEqual(testImpact([], fixture()).full, true);
});

test("docs, change fragments, generated files and the site affect no component's tests", () => {
  const impact = testImpact(["README.md", "docs/Checkbox.md", "changes/checkbox.md", "registry.json", "site/src/docs/catalog.json", "site/public/llms.txt", "UPGRADING.md"], fixture());
  assert.ok(impact.reasons.some((reason) => reason.startsWith("site/src/docs/catalog.json: the site")));
  assert.equal(impact.full, false);
  assert.deepEqual(impact.components, []);
  assert.equal(impact.reasons.length, 7);
});

test("the reduced Vitest run keeps every project, measures coverage over the selected folders and the lib/ files they load, and filters the stories", () => {
  const dir = fixture();
  const args = vitestArgs(["checkbox-group", "checklist"], dir);
  for (const project of ["ouro-chromium", "ouro-webkit", "ouro-touch", "site"]) assert.ok(args.includes(`--project=${project}`), project);
  assert.ok(args.includes("--coverage"));
  // lib/ files load at run time through checkbox-styles (cn) and through cn (tones); not kind (a type), toast (unloaded) or the test kit.
  assert.deepEqual(args.filter((arg) => arg.startsWith("--coverage.include=")), [`--coverage.include=${components}/checkbox/**`, `--coverage.include=${components}/checklist/**`, "--coverage.include=registry/ouro/lib/ouro/cn.ts", "--coverage.include=registry/ouro/lib/ouro/tones.ts"]);
  // Those lib/ files' own tests, the shared suites in test/ and the site's tests run too, so every project writes its partition.
  assert.deepEqual(args.filter((arg) => !arg.startsWith("--")), [`${components}/checkbox/`, `${components}/checklist/`, "registry/ouro/lib/ouro/cn.", "test/", "site/"]);
  assert.equal(storyFolders(["checkbox-group", "checklist"], dir), "checkbox,checklist");
});

test("a folder the selected components import is measured and tested too: checklist brings checkbox, and not slider", () => {
  const args = vitestArgs(["checklist"], fixture());
  assert.ok(args.includes(`--coverage.include=${components}/checkbox/**`) && args.includes(`${components}/checkbox/`), args.join(" "));
  assert.ok(!args.some((arg) => arg.includes("/slider/")));
  // Its stories stay out: only the selected folders' stories are scanned.
  assert.equal(storyFolders(["checklist"], fixture()), "checklist");
});

test("a folder only the selected components' tests or stories import is measured and tested too, one step out: field's test brings radio, and not radio's checkbox", () => {
  const args = vitestArgs(["field"], fixture());
  assert.ok(args.includes(`--coverage.include=${components}/radio/**`) && args.includes(`${components}/radio/`), args.join(" "));
  // radio is reached by field's test, not changed: what radio's own test imports stays out.
  assert.ok(!args.some((arg) => arg.includes("/checkbox/")), args.join(" "));
  // form's story renders checklist, whose code renders checkbox: both are measured, with the lib/ files checkbox loads.
  const form = vitestArgs(["form"], fixture());
  for (const folder of ["checklist", "checkbox"]) assert.ok(form.includes(`--coverage.include=${components}/${folder}/**`), `${folder}: ${form.join(" ")}`);
  assert.ok(form.includes("--coverage.include=registry/ouro/lib/ouro/cn.ts"), form.join(" "));
});

test("in this repository, a change to radio-group's tests measures form, which only radio-group's tests reach in places", () => {
  const impact = testImpact([`${components}/radio-group/radio-group.test.tsx`]);
  assert.equal(impact.full, false);
  const args = vitestArgs(impact.components);
  assert.ok(args.includes(`--coverage.include=${components}/form/**`) && args.includes(`${components}/form/`), args.join(" "));
});

test("in this repository, a change to dialog's tests measures button, sheet and the lib/ files they load too, so a branch only dialog's tests reached cannot drop out", () => {
  const impact = testImpact([`${components}/dialog/dialog.test.tsx`]);
  assert.equal(impact.full, false);
  assert.ok(impact.components.includes("dialog"));
  const args = vitestArgs(impact.components);
  for (const folder of ["dialog", "button", "sheet"]) {
    assert.ok(args.includes(`--coverage.include=${components}/${folder}/**`), folder);
    assert.ok(args.includes(`${components}/${folder}/`), folder);
  }
  // confirm-dialog loads tones and button loads appearance-hints; nothing in dialog's reach loads toast or the test kit.
  for (const file of ["tones.ts", "appearance-hints.ts", "cn.ts"]) assert.ok(args.includes(`--coverage.include=registry/ouro/lib/ouro/${file}`), file);
  assert.ok(args.includes("registry/ouro/lib/ouro/appearance-hints."));
  assert.ok(!args.some((arg) => /lib\/ouro\/(toast\.ts|testing\/)/.test(arg)), args.join(" "));
});

test("a docs demo selects its component; the site's stylesheet, which the text-size scan reads, runs everything", () => {
  const dir = fixture();
  assert.deepEqual(testImpact(["site/src/docs/demos/checklist.demo.tsx"], dir), { full: false, reasons: ["site/src/docs/demos/checklist.demo.tsx: checklist's docs demo", "form: its tests, stories or docs demo import checklist"], components: ["checklist", "form"] });
  const css = testImpact(["site/src/styles.css"], dir);
  assert.equal(css.full, true);
  assert.match(css.reasons[0], /^site\/src\/styles\.css: the site's stylesheet, which the text-size scan reads/);
  assert.equal(testImpact(["site/src/docs/demos/nobody.demo.tsx"], dir).full, true);
  // What the demos load renders in the scan too; the rest of the site is the site project's.
  for (const path of ["site/src/docs/demos/wait.ts", "site/src/components/icons.tsx"]) {
    const loaded = testImpact([path], dir);
    assert.equal(loaded.full, true, path);
    assert.match(loaded.reasons[0], new RegExp(`^${path.replaceAll(".", "\\.")}: loaded by the docs demos the text-size scan renders, so everything runs$`));
  }
  assert.equal(testImpact(["site/src/pages/home.tsx"], dir).full, false);
  // A demo is its component's: a change to a component it renders selects it, one step out, as a story would.
  const toggle = testImpact([`${components}/checkbox/checkbox.tsx`], dir);
  assert.ok(toggle.components.includes("toggle"), toggle.components.join());
  assert.ok(toggle.reasons.includes("toggle: its tests, stories or docs demo import checkbox"), toggle.reasons.join("\n"));
  // Every demo in this repository is named after a component, so none forces a full run.
  const demos = readdirSync(join(root, "site/src/docs/demos"), { recursive: true }).map(String).filter((file) => file.endsWith(".demo.tsx"));
  assert.ok(demos.length > 0);
  for (const demo of demos) assert.equal(testImpact([`site/src/docs/demos/${demo}`]).full, false, demo);
});

test("the reference stories (stories/), which no folder owns, are scanned on every reduced run", () => {
  // Their components are the shared ones (sheet-feel renders Button and Sheet); a change to them runs everything.
  const selected = new Set(["checkbox"]);
  assert.equal(storyFileSelected("../stories/reference/sheet-feel.stories.tsx", selected), true);
  assert.equal(storyFileSelected("../stories/reference/sheet-feel.stories.tsx", new Set()), true);
  assert.equal(storyFileSelected("../registry/ouro/components/ouro/checkbox/checkbox.stories.tsx", selected), true);
  assert.equal(storyFileSelected("../registry/ouro/components/ouro/sheet/sheet.stories.tsx", selected), false);
  assert.equal(storyFileSelected("../registry/ouro/components/ouro/sheet/sheet.stories.tsx", null), true);
  assert.equal(testImpact(["stories/reference/sheet-feel.stories.tsx"]).full, true);
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

test("a reduced shard runs its share of the selected tests, with the selected stories", async () => {
  const calls = [];
  const status = await runBrowserShard(["checkbox"], "2/6", {
    root: fixture(),
    spawn: async (command, args, env) => {
      calls.push([command, ...args, env.OURO_STORIES].join(" "));
      return { status: 3 };
    },
    log: () => {},
  });
  assert.equal(status, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^pnpm exec vitest run --project=ouro-chromium .*--coverage .*registry\/ouro\/components\/ouro\/checkbox\/ .*test\/ site\/ --shard=2\/6 checkbox$/);
});

test("the reduced run stands when the shards' merged coverage reaches 100%, and the full suite decides only when it falls short", async () => {
  const run = async (results, components = ["checkbox"]) => {
    const calls = [];
    const outputs = [];
    const status = await decideReducedRun(components, "/cov", 6, {
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
  const covered = await run([{ status: 0 }]);
  assert.equal(covered.status, 0);
  assert.deepEqual(covered.calls.map((call) => call.split(" ").slice(0, 5).join(" ")), ["node scripts/coverage-merge.mjs /cov --shards 6"]);
  assert.deepEqual(covered.outputs, ["reduced=true", "stems=checkbox,checkbox-group", "fallback=false"]);

  const short = await run([{ status: 1 }, { status: 0 }, { status: 0 }]);
  assert.equal(short.status, 0);
  assert.deepEqual(short.calls.slice(1), ["scripts/retry.sh pnpm exec playwright install --with-deps chromium webkit (every story)", "pnpm test (every story)"]);
  assert.deepEqual(short.outputs, ["reduced=false", "stems=", "fallback=true"]);

  const fullFails = await run([{ status: 1 }, { status: 0 }, { status: 1 }]);
  assert.equal(fullFails.status, 1);

  // A shard's coverage missing is no question for the full suite: the run fails.
  const missing = await run([{ status: 3 }]);
  assert.equal(missing.status, 3);
  assert.equal(missing.calls.length, 1);
  assert.deepEqual(missing.outputs, []);

  // No component selected: nothing was measured, so there is no coverage to merge.
  const none = await run([], []);
  assert.equal(none.status, 0);
  assert.deepEqual(none.calls, []);
  assert.deepEqual(none.outputs, ["reduced=true", "stems=", "fallback=false"]);
});
