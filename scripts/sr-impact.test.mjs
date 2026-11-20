import assert from "node:assert/strict";
import { test } from "node:test";
import { diskRepo, laneFiles, outputsOf, selectLane, selectPullRequestLane, storyId, storyIdTable, storyIdsOf } from "./sr-impact.mjs";

// Which screen-reader specs a change reaches (scripts/sr-impact.mjs). The fixture is a small repository
// in memory: two components whose stories load each other's code, a reference story that renders one
// of them, and the lane's own harness. Each case says which specs a change selects and why.

const component = (name, source) => ({ [`registry/ouro/components/ouro/${name}/component.json`]: `{"order":1,"components":["${name}"]}`, [`registry/ouro/components/ouro/${name}/${name}.tsx`]: source });

const fixture = {
  "registry/ouro/e2e/screen-reader/stories.ts": `export const storyIds = {
  button: "actions-button--loading",
  textField: "forms-textfield--states",
  formServerErrors: "forms-form--server-errors",
  dashboard: "reference-patterns--dashboard",
} as const;

export const checklistShipped = false;
`,
  "registry/ouro/e2e/screen-reader/button.sr.spec.ts": `import { storyIds } from "./stories";\ntest.use({ storyId: storyIds.button });\n`,
  "registry/ouro/e2e/screen-reader/text-field.sr.spec.ts": `import { storyIds } from "./stories";\ntest.use({ storyId: storyIds.textField });\ntest.use({ storyId: storyIds.formServerErrors });\n`,
  "registry/ouro/e2e/screen-reader/patterns.sr.spec.ts": `import { storyIds } from "./stories";\ntest.use({ storyId: storyIds.dashboard });\n`,
  "registry/ouro/e2e/screen-reader/phrases.ts": `export const MARK = "Speech check";\n`,
  ...component("button", `import type { TextFieldProps } from "../text-field/text-field";\n\nexport function Button() {}\n`),
  ...component("text-field", `export type TextFieldProps = {};\nexport function TextField() {}\n`),
  ...component("form", `import { TextField } from "../text-field/text-field";\n\nexport function Form() {}\n`),
  ...component("alert", `export function Alert() {}\n`),
  "registry/ouro/components/ouro/button/button.stories.tsx": `import { Button } from "./button";\n\nexport default { title: "Actions/Button" };\n\nexport const Loading = { args: {} };\n`,
  "registry/ouro/components/ouro/text-field/text-field.stories.tsx": `import { TextField } from "./text-field";\n\nconst meta = { title: "Forms/TextField" } satisfies Meta;\n\nexport default meta;\n\nexport const States = {};\n`,
  "registry/ouro/components/ouro/form/form.stories.tsx": `import { Form } from "./form";\n\nexport default { title: "Forms/Form" };\n\nexport const ServerErrors = {};\n`,
  "registry/ouro/components/ouro/alert/alert.stories.tsx": `import { Alert } from "./alert";\n\nexport default { title: "Feedback/Alert" };\n\nexport const Playground = {};\n`,
  "stories/reference/patterns.stories.tsx": `import { Button } from "@/registry/ouro/components/ouro/button/button";\n\nconst meta = { title: "Reference/Patterns" };\n\nexport default meta;\n\nexport const Dashboard = {};\n`,
  "registry/ouro/lib/ouro/dev.ts": `export const dev = true;\n`,
  "registry/ouro/theme/ouro-base.css": `:root {}\n`,
  "app.css": `@import "tailwindcss";\n`,
  "tsconfig.json": "{}\n",
  "playwright.screen-reader.config.ts": "export default {};\n",
  "docs/Button.md": "# Button\n",
  "README.md": "# Ouro UI\n",
  "changes/tidy.md": "- Fixed a thing.\n",
  "site/src/home.tsx": "export const Home = () => null;\n",
  ".github/workflows/release.yml": "name: Release\n",
  ".github/workflows/ci.yml": "name: CI\n",
  ".github/workflows/screen-reader.yml": "name: Screen reader\n",
  ".github/workflows/screen-reader-lane.yml": "name: Screen reader lane\n",
  "scripts/sr-impact.mjs": "export {};\n",
  "scripts/test-impact.mjs": "export {};\n",
  "package.json": "{}\n",
  "mystery/thing.ts": "export {};\n",
};

/** The fixture with extra files (or without the ones named `null`). */
const repoWith = (extra = {}) => {
  const files = { ...fixture, ...extra };
  for (const [path, text] of Object.entries(files)) if (text === null) delete files[path];
  return {
    read: (path) => (Object.hasOwn(files, path) ? files[path] : null),
    list: (dir) => Object.keys(files).filter((path) => path.startsWith(`${dir}/`)),
  };
};

const spec = (name) => `registry/ouro/e2e/screen-reader/${name}.sr.spec.ts`;
const BUTTON = spec("button");
const TEXT_FIELD = spec("text-field");
const PATTERNS = spec("patterns");

test("a story's id is Storybook's: its title with its export, kebab-cased, and a camel-case export split into words", () => {
  assert.equal(storyId("Lists/Checklist", "InContext"), "lists-checklist--in-context");
  assert.equal(storyId("Actions/ColorSchemeToggle", "Segmented"), "actions-colorschemetoggle--segmented");
  assert.equal(storyId("Reference/Patterns", "ListDetail"), "reference-patterns--list-detail");
});

test("a story file names the ids of its named exports under its title, whether the default export is an object or a variable", () => {
  assert.deepEqual(storyIdsOf("a.stories.tsx", `export default { title: "Forms/Form" };\nexport const ServerErrors = {};\n`), ["forms-form--server-errors"]);
  assert.deepEqual(storyIdsOf("b.stories.tsx", `const meta = { title: "Forms/TextField" } satisfies Meta;\nexport default meta;\nexport const States = {};\n`), ["forms-textfield--states"]);
  assert.deepEqual(storyIdsOf("c.stories.tsx", `export const Orphan = {};\n`), [], "no title, no story");
});

test("stories.ts's storyIds table maps each key to its story id", () => {
  assert.equal(storyIdTable(fixture["registry/ouro/e2e/screen-reader/stories.ts"]).get("formServerErrors"), "forms-form--server-errors");
  assert.equal(storyIdTable("export const other = {};"), null);
});

test("a change to a component selects the spec of every story that loads it, directly or through another component", () => {
  // Form's story renders TextField through form.tsx, so TextField's spec, which also opens Form's story, runs.
  assert.deepEqual(selectLane(["registry/ouro/components/ouro/text-field/text-field.tsx"], repoWith()), { lane: "list", specs: [TEXT_FIELD], reasons: ["registry/ouro/components/ouro/text-field/text-field.tsx: rendered by " + TEXT_FIELD] });
  assert.deepEqual(selectLane(["registry/ouro/components/ouro/form/form.tsx"], repoWith()).specs, [TEXT_FIELD]);
  // Button's story and the reference patterns that render Button both run.
  assert.deepEqual(selectLane(["registry/ouro/components/ouro/button/button.tsx"], repoWith()).specs, [BUTTON, PATTERNS]);
});

test("a component's own tests and stories count with its code, as a change to its files does", () => {
  assert.deepEqual(selectLane(["registry/ouro/components/ouro/button/button.test.tsx"], repoWith()).specs, [BUTTON, PATTERNS]);
});

test("a type-only import loads nothing, so a change to the type's folder does not select the importer's spec", () => {
  // button.tsx imports only a type from text-field: changing text-field reaches TextField's spec, not Button's.
  assert.deepEqual(selectLane(["registry/ouro/components/ouro/text-field/text-field.tsx"], repoWith()).specs, [TEXT_FIELD]);
});

test("a component no spec renders selects none", () => {
  assert.deepEqual(selectLane(["registry/ouro/components/ouro/alert/alert.tsx"], repoWith()), { lane: "none", specs: [], reasons: ["registry/ouro/components/ouro/alert/alert.tsx: no screen-reader spec renders it"] });
  assert.equal(selectLane(["registry/ouro/components/ouro/alert/alert.stories.tsx"], repoWith()).lane, "none");
});

test("prose, change fragments, the site and other workflows select none", () => {
  for (const path of ["docs/Button.md", "README.md", "changes/tidy.md", "site/src/home.tsx", ".github/workflows/release.yml"]) assert.equal(selectLane([path], repoWith()).lane, "none", path);
});

test("a spec file's own change selects that spec alone, since the harness it imports is shared", () => {
  assert.deepEqual(selectLane([TEXT_FIELD], repoWith()).specs, [TEXT_FIELD]);
});

test("a reference story selects the specs of the story files that name it, and its own spec", () => {
  assert.deepEqual(selectLane(["stories/reference/patterns.stories.tsx"], repoWith()).specs, [PATTERNS]);
});

test("a change to anything the lane shares runs every spec: the harness, the library, the theme, the lane's workflow and scripts, the dependencies and the build", () => {
  for (const path of [
    "registry/ouro/lib/ouro/dev.ts",
    "registry/ouro/theme/ouro-base.css",
    "registry/ouro/e2e/screen-reader/phrases.ts",
    "registry/ouro/e2e/screen-reader/stories.ts",
    "playwright.screen-reader.config.ts",
    ".github/workflows/screen-reader.yml",
    ".github/workflows/screen-reader-lane.yml",
    ".github/workflows/ci.yml",
    "scripts/sr-impact.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "app.css",
    "tsconfig.json",
    ".storybook/main.ts",
    "vite.config.ts",
  ]) {
    const result = selectLane([path], repoWith({ "pnpm-lock.yaml": "lock\n", ".storybook/main.ts": "export {};\n", "vite.config.ts": "export {};\n" }));
    assert.equal(result.lane, "all", path);
    assert.deepEqual(result.specs, [BUTTON, PATTERNS, TEXT_FIELD].sort(), path);
  }
});

test("a path the mapping cannot place runs every spec, and so does a change it cannot read", () => {
  assert.equal(selectLane(["mystery/thing.ts"], repoWith()).lane, "all");
  assert.equal(selectLane([], repoWith()).lane, "all");
});

test("a component folder without its manifest runs every spec, as the mapping cannot place it", () => {
  assert.equal(selectLane(["registry/ouro/components/ouro/gizmo/gizmo.tsx"], repoWith()).lane, "all");
});

test("a spec whose story id no story file defines runs every spec, rather than leaving it out", () => {
  const broken = repoWith({ "registry/ouro/e2e/screen-reader/broken.sr.spec.ts": `import { storyIds } from "./stories";\ntest.use({ storyId: storyIds.gone });\n` });
  assert.equal(selectLane(["docs/Button.md"], broken).lane, "all");
  const unlisted = repoWith({ "registry/ouro/e2e/screen-reader/stories.ts": fixture["registry/ouro/e2e/screen-reader/stories.ts"].replace('  dashboard: "reference-patterns--dashboard",\n', "") });
  assert.equal(selectLane(["docs/Button.md"], unlisted).lane, "all", "a key the table lacks");
});

test("a change that reaches every spec selects them all, and one that reaches some is a list", () => {
  assert.equal(selectLane(["registry/ouro/components/ouro/button/button.tsx", "registry/ouro/components/ouro/text-field/text-field.tsx", "stories/reference/patterns.stories.tsx"], repoWith()).lane, "all");
  assert.equal(selectLane(["registry/ouro/components/ouro/text-field/text-field.tsx", "README.md"], repoWith()).lane, "list");
});

test("the plan's outputs name the lane's value and the specs it runs, or all", () => {
  assert.deepEqual(outputsOf({ lane: "none", specs: [], reasons: [] }), { screen_reader: "none", screen_reader_specs: "" });
  assert.deepEqual(outputsOf({ lane: "list", specs: [BUTTON, PATTERNS], reasons: [] }), { screen_reader: "list", screen_reader_specs: `${BUTTON} ${PATTERNS}` });
  assert.deepEqual(outputsOf({ lane: "all", specs: [BUTTON], reasons: [] }), { screen_reader: "all", screen_reader_specs: "all" });
});

test("in this repository every spec's stories resolve, so a docs change selects none rather than every spec, and each real component's spec is found", () => {
  const repo = diskRepo();
  assert.equal(selectLane(["docs/Button.md"], repo).lane, "none");
  assert.ok(selectLane(["registry/ouro/components/ouro/text-field/text-field.tsx"], repo).specs.includes(TEXT_FIELD));
  assert.ok(selectLane(["registry/ouro/components/ouro/form/form.tsx"], repo).specs.includes(TEXT_FIELD), "Form's story renders TextField");
  assert.ok(selectLane(["registry/ouro/components/ouro/button/button.tsx"], repo).specs.includes(BUTTON));
});

test("a pull request runs the lane only when it changes the lane's own files, and then what the plan selects (#666)", () => {
  // A component, a library helper or ci.yml alone waits for main's push run, though the plan would select specs for them.
  for (const path of ["registry/ouro/components/ouro/button/button.tsx", "registry/ouro/lib/ouro/dev.ts", ".github/workflows/ci.yml", "README.md"]) assert.equal(selectPullRequestLane([path], repoWith()).lane, "none", path);
  // A spec selects itself; the harness, the configuration, the lane's workflows and scripts select every spec.
  assert.deepEqual(selectPullRequestLane([TEXT_FIELD], repoWith()).specs, [TEXT_FIELD]);
  for (const path of ["registry/ouro/e2e/screen-reader/phrases.ts", "playwright.screen-reader.config.ts", ".github/workflows/screen-reader.yml", ".github/workflows/screen-reader-lane.yml", "scripts/sr-impact.mjs"]) assert.equal(selectPullRequestLane([path], repoWith()).lane, "all", path);
  // A lane file beside other changes is judged with them; a change it cannot read runs every spec.
  assert.equal(selectPullRequestLane([TEXT_FIELD, "registry/ouro/lib/ouro/dev.ts"], repoWith()).lane, "all");
  assert.equal(selectPullRequestLane([], repoWith()).lane, "all");
  assert.equal(laneFiles.test("registry/ouro/e2e/ouro/menu.spec.ts"), false);
  assert.equal(laneFiles.test(".github/workflows/screen-reader-revert.yml"), false);
});
