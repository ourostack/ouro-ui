import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readComponents } from "./components.mts";
import { buildMatrix, defaultMode, readStoryModes, sourceMarkers } from "./control-matrix.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/control-matrix.mts");
const run = (...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8" });
const components = readComponents(root);
const matrix = buildMatrix(root);
const storyModes = readStoryModes(root);
/** The components whose stories render a control of their own: a hand-kept record, so a component that drops its `controls` fails here. */
const interactive = JSON.parse(readFileSync(join(root, "scripts/fixtures/interactive-components.json"), "utf8"));

/** A scratch copy of the components' manifests (and empty component files) under .tmp/, where a test may break a manifest. */
function scratch() {
  const base = join(root, ".tmp");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "control-matrix-"));
  for (const component of components) {
    const folder = join(dir, "registry/ouro/components/ouro", component.folder);
    mkdirSync(folder, { recursive: true });
    cpSync(join(root, "registry/ouro/components/ouro", component.folder, "component.json"), join(folder, "component.json"));
    writeFileSync(join(folder, `${component.stem}.tsx`), "");
  }
  return dir;
}

/** Rewrites one folder's component.json in a scratch copy. */
function editManifest(dir, folder, edit) {
  const file = join(dir, "registry/ouro/components/ouro", folder, "component.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  edit(manifest);
  writeFileSync(file, JSON.stringify(manifest));
}

test("the committed control matrix is up to date", () => {
  const result = run("--check");
  assert.equal(result.status, 0, result.stderr);
});

test("--check fails when the control matrix is stale, and names the fix", () => {
  const dir = scratch();
  const out = join(dir, "control-matrix.json");
  assert.equal(run("--out", out).status, 0);
  assert.equal(run("--check", "--out", out).status, 0);
  const stale = JSON.parse(readFileSync(out, "utf8"));
  stale[0].role = "generic";
  writeFileSync(out, JSON.stringify(stale, null, 2) + "\n");
  const result = run("--check", "--out", out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale.*pnpm controls:matrix/s);
});

test("every interactive component declares its controls, and the fixture lists exactly those", () => {
  const declared = components.filter((component) => component.controls !== undefined).map((component) => component.name);
  const missing = interactive.filter((name) => !declared.includes(name));
  assert.deepEqual(missing, [], `declare "controls" in component.json for: ${missing.join(", ")}`);
  assert.deepEqual([...interactive].sort(), [...declared].sort());
});

test("every declared mode has a story, and every story names a mode its component declares", () => {
  for (const component of components) {
    const entries = storyModes.get(component.stem) ?? [];
    const modes = component.modes ?? [defaultMode];
    for (const mode of modes) {
      assert.ok(
        entries.some((entry) => (entry.mode ?? modes[0]) === mode),
        `${component.stem} declares mode "${mode}", but no story renders it: add a story with parameters: { mode: "${mode}" }`,
      );
    }
    for (const entry of entries) {
      if (entry.mode === undefined) continue;
      assert.ok(component.modes?.includes(entry.mode), `${entry.id} names mode "${entry.mode}", which ${component.stem}'s component.json does not declare`);
    }
  }
});

test("every story file belongs to a component, or is a repository-only reference", () => {
  const stems = new Set(components.map((component) => component.stem));
  for (const stem of storyModes.keys()) assert.ok(stems.has(stem), `${stem}.stories.tsx belongs to no component`);
});

test("each row is one part of one mode, found by its own stories, portaled parts included", () => {
  const seen = new Set();
  for (const row of matrix) {
    const key = `${row.stem} ${row.mode} ${row.part}`;
    assert.ok(!seen.has(key), `${key} is listed twice`);
    seen.add(key);
    assert.equal(row.item, row.stem);
    assert.ok(row.stories.length > 0, `${key} has no story to find it in`);
    for (const id of row.stories) assert.match(id, /^[A-Z][A-Za-z0-9]*\/[A-Z][A-Za-z0-9]*$/);
  }
  // Select's options and Dialog's close button live in a portal, opened from the story.
  assert.ok(matrix.some((row) => row.stem === "select" && row.part === "option" && row.role === "option" && row.portal));
  assert.ok(matrix.some((row) => row.stem === "dialog" && row.part === "close" && row.role === "button" && row.portal));
  // Button's modes change the element it renders.
  assert.ok(matrix.some((row) => row.stem === "button" && row.mode === "link" && row.role === "link"));
  assert.ok(matrix.some((row) => row.stem === "button" && row.mode === "button" && row.role === "button"));
});

test("the matrix holds only plain data a browser test can import", () => {
  const file = JSON.parse(readFileSync(join(root, "test/generated/control-matrix.json"), "utf8"));
  assert.deepEqual(file, matrix);
  for (const row of file) assert.deepEqual(Object.keys(row), ["item", "stem", "mode", "part", "role", "portal", "touch", "stories"]);
  // A part only a coarse pointer reaches (Combobox's sheet) is checked in the ouro-touch project.
  assert.ok(file.some((row) => row.stem === "combobox" && row.part === "done" && row.touch));
  assert.ok(file.every((row) => typeof row.touch === "boolean"));
});

test("the reader rejects controls and modes that name nothing real", () => {
  const cases = [
    [(manifest) => (manifest.controls = { nope: [{ part: "root", role: "button", portal: false }] }), /controls names nope/],
    [(manifest) => (manifest.modes = { button: ["button"] }), /at least two modes/],
    [(manifest) => (manifest.modes = { button: ["button", "button"] }), /at least two modes/],
    [(manifest) => (manifest.controls = { button: [{ part: "Root", role: "button", portal: false }] }), /part, a role and portal/],
    [(manifest) => (manifest.controls = { button: [{ part: "root", role: "button" }] }), /part, a role and portal/],
    [(manifest) => (manifest.controls = { button: [] }), /non-empty list/],
    [(manifest) => (manifest.controls.button[0].touch = false), /"touch": true or no "touch"/],
    [(manifest) => (manifest.controls.button[0].modes = ["menu"]), /mode menu, which button does not declare/],
    [(manifest) => manifest.controls.button.push({ ...manifest.controls.button[0] }), /lists button's root twice/],
  ];
  for (const [edit, message] of cases) {
    const dir = scratch();
    editManifest(dir, "button", edit);
    assert.throws(() => readComponents(dir), message);
  }
});

test("every control marker in the components' source names a part its item declares, and every declared part is marked", () => {
  const { markers, problems } = sourceMarkers(root);
  assert.deepEqual(problems, []);
  const declared = new Set(components.flatMap((component) => (component.controls ?? []).map((control) => `${component.name}/${control.part}`)));
  const marked = new Set(markers.map((marker) => `${marker.item}/${marker.part}`));
  const undeclared = markers.filter((marker) => !declared.has(`${marker.item}/${marker.part}`)).map((marker) => `${marker.item}/${marker.part} (${marker.where})`);
  assert.deepEqual(undeclared, [], "declare these parts in their component.json \"controls\"");
  assert.deepEqual([...declared].filter((key) => !marked.has(key)), [], "these declared parts are marked nowhere in the source");
  // Every way a marker is written is read: JSX, an object of props, setAttribute, controlRef and a
  // component's own …Marker(item, part) helper.
  for (const key of ["button/root", "dialog/trigger", "pagination/page", "checkbox/hidden-input", "slider/thumb", "toaster/alert", "toaster/toast", "combobox/dismiss", "combobox/popup-dismiss"]) assert.ok(marked.has(key), key);
});

test("the source scan reports a part with no item beside it", () => {
  const dir = scratch();
  const folder = join(dir, "registry/ouro/components/ouro/button");
  writeFileSync(join(folder, "button.tsx"), 'export const a = <button data-ouro-part="root" />;\nexport const b = <a data-ouro-control="button" data-ouro-part="extra" />;\n');
  const { markers, problems } = sourceMarkers(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /button\.tsx:1 .*data-ouro-part.*no data-ouro-control/);
  assert.deepEqual(markers.map((marker) => `${marker.item}/${marker.part}`), ["button/extra"]);
});
