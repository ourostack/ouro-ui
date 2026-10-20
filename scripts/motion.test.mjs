import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readComponents, readMotion } from "./components.mts";
import { buildMotionMatrix } from "./control-matrix.mts";
import { STATE_ATTRIBUTES } from "./motion-states.mts";

// component.json `motion`: what each state change of a component animates, part by part, and
// the tests that prove it (scripts/components.mts). The reader rejects a map that names a kind,
// a state, a stem, a part or a test that does not exist, so scripts/motion-coverage.mts can
// trust every name it reads.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const components = readComponents(root);
const checkboxTests = "registry/ouro/components/ouro/checkbox/checkbox.test.tsx";
const tickTest = `${checkboxTests}::Checkbox look > fills the box, then draws the tick along its path, and only fades and recolours with reduced motion`;
const rtlTest = `${checkboxTests}::Checkbox look > draws the same way right to left`;
const interruptTest = `${checkboxTests}::Checkbox look > ends in the last state when toggled during its animation`;

/** A scratch copy of every component.json (with empty component files) and the whole checkbox folder, under .tmp/. */
function scratch() {
  const base = join(root, ".tmp");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "motion-"));
  for (const component of components) {
    const folder = join(dir, "registry/ouro/components/ouro", component.folder);
    mkdirSync(folder, { recursive: true });
    cpSync(join(root, "registry/ouro/components/ouro", component.folder, "component.json"), join(folder, "component.json"));
    writeFileSync(join(folder, `${component.stem}.tsx`), "");
  }
  // The folders whose component.json declares motion, whole: the reader checks their parts and test titles.
  for (const folder of new Set(readMotion(root).map((entry) => entry.folder))) cpSync(join(root, "registry/ouro/components/ouro", folder), join(dir, "registry/ouro/components/ouro", folder), { recursive: true });
  return dir;
}

/** Rewrites the checkbox folder's component.json in a scratch copy. */
function editCheckbox(dir, edit) {
  const file = join(dir, "registry/ouro/components/ouro/checkbox/component.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  edit(manifest);
  writeFileSync(file, JSON.stringify(manifest));
}

/** The checkbox's `data-checked` state in a manifest. */
const checked = (manifest) => manifest.motion.checkbox.states["data-checked"];

test("Checkbox declares today's motion, part by part, and only Checklist, Inspector and RouteProgress besides it declare any yet", () => {
  const motion = readMotion(root);
  assert.deepEqual(
    motion.map((entry) => entry.stem),
    ["checkbox", "checklist", "inspector", "route-progress"],
  );
  const { states } = motion[0].motion;
  assert.deepEqual(Object.keys(states), ["data-checked", "data-unchecked", "data-indeterminate", "data-disabled", "data-invalid", "data-readonly"]);
  const colours = ["background-color", "border-color"];
  for (const state of ["data-checked", "data-unchecked"]) {
    assert.equal(states[state].kind, "motion");
    // The tick draws along its path; with reduced motion nothing draws, and it only fades.
    assert.deepEqual(states[state].parts, { tick: { properties: ["stroke-dashoffset"], reduced: ["opacity"] }, box: { properties: colours, reduced: colours } });
  }
  assert.deepEqual(states["data-checked"].tests, [tickTest, rtlTest]);
  assert.deepEqual(states["data-unchecked"].tests, [tickTest]);
  assert.deepEqual(motion[0].motion.transitions, [{ from: "data-checked", to: "data-unchecked", interrupt: true, tests: [interruptTest] }]);
  // Entering these after the box renders runs the press utility's colour and opacity transitions.
  assert.deepEqual(states["data-indeterminate"].parts, { box: { properties: colours, reduced: colours } });
  assert.deepEqual(states["data-disabled"].parts, { box: { properties: ["opacity"], reduced: ["opacity"] } });
  assert.deepEqual(states["data-invalid"].parts, { box: { properties: ["border-color"], reduced: ["border-color"] } });
  assert.equal(states["data-readonly"].kind, "none");
  for (const [name, state] of Object.entries(states)) assert.equal(state.tests.length, name === "data-checked" ? 2 : 1, name);
});

test("the state attributes are a closed list, and no other data-* attribute is a state", () => {
  assert.deepEqual(STATE_ATTRIBUTES, [
    "data-checked",
    "data-unchecked",
    "data-indeterminate",
    "data-disabled",
    "data-readonly",
    "data-invalid",
    "data-open",
    "data-closed",
    "data-pressed",
    "data-selected",
    "data-highlighted",
    "data-expanded",
    "data-swiping",
    "data-dragging",
    "data-starting-style",
    "data-ending-style",
  ]);
});

test("a complete scratch copy reads, and a reduced list may be empty when nothing animates under reduced motion", () => {
  const dir = scratch();
  editCheckbox(dir, (manifest) => (checked(manifest).parts.tick.reduced = []));
  const [entry] = readMotion(dir);
  assert.deepEqual(entry.motion.states["data-checked"].parts.tick.reduced, []);
});

test("the reader rejects a motion map that names nothing real", () => {
  const cases = [
    ["an unknown kind", (manifest) => (checked(manifest).kind = "spring"), /checkbox's data-checked: "kind" must be "motion", "gesture-settle" or "none"/],
    ["a motion state with no parts", (manifest) => delete checked(manifest).parts, /checkbox's data-checked is "motion", so it needs "parts"/],
    ["a motion state with empty parts", (manifest) => (checked(manifest).parts = {}), /checkbox's data-checked is "motion", so it needs "parts"/],
    [
      "a gesture-settle state with no parts",
      (manifest) => (manifest.motion.checkbox.states["data-dragging"] = { kind: "gesture-settle", tests: [tickTest] }),
      /checkbox's data-dragging is "gesture-settle", so it needs "parts"/,
    ],
    ["a state with no tests", (manifest) => delete checked(manifest).tests, /checkbox's data-checked needs "tests"/],
    ["a state with an empty tests list", (manifest) => (checked(manifest).tests = []), /checkbox's data-checked needs "tests"/],
    ["a part with no properties", (manifest) => delete checked(manifest).parts.tick.properties, /checkbox's data-checked tick needs "properties"/],
    ["a part with empty properties", (manifest) => (checked(manifest).parts.tick.properties = []), /checkbox's data-checked tick needs "properties"/],
    ["a part with no reduced list", (manifest) => delete checked(manifest).parts.tick.reduced, /checkbox's data-checked tick needs "reduced"/],
    ["a property listed twice", (manifest) => (checked(manifest).parts.tick.properties = ["opacity", "opacity"]), /checkbox's data-checked tick lists opacity twice/],
    ["a reduced property listed twice", (manifest) => (checked(manifest).parts.box.reduced = ["border-color", "border-color"]), /checkbox's data-checked box lists border-color twice/],
    ["a property that is no CSS property name", (manifest) => (checked(manifest).parts.tick.properties = ["Opacity"]), /checkbox's data-checked tick needs "properties"/],
    ["an extra part the stem never renders", (manifest) => (checked(manifest).parts.glow = { properties: ["opacity"], reduced: [] }), /checkbox's data-checked names part glow, but checkbox never renders data-ouro-part="glow"/],
    ["a none state that declares parts", (manifest) => (manifest.motion.checkbox.states["data-readonly"].parts = checked(manifest).parts), /checkbox's data-readonly is "none", so it declares no "parts"/],
    ["a state attribute outside the closed list", (manifest) => (manifest.motion.checkbox.states["data-ouro-control"] = { kind: "none", tests: [tickTest] }), /checkbox's data-ouro-control is not a state attribute/],
    ["a malformed state value", (manifest) => (manifest.motion.checkbox.states["data-swiping=Left"] = { kind: "none", tests: [tickTest] }), /checkbox's data-swiping=Left is not a state attribute/],
    ["a stem the folder does not list", (manifest) => (manifest.motion.nope = manifest.motion.checkbox), /motion names nope, which "components" does not list/],
    ["a stem with no states", (manifest) => (manifest.motion.checkbox = {}), /checkbox's "motion" needs "states"/],
    ["a test id with no file part", (manifest) => (checked(manifest).tests = ["Checkbox look > grows"]), /names test "Checkbox look > grows", which is not <file>::<full test name>/],
    ["a test in a file that does not exist", (manifest) => (checked(manifest).tests = [`${checkboxTests.replace("checkbox.test", "nope.test")}::Checkbox look > grows`]), /names test .*nope\.test\.tsx.*, but that file does not exist/],
    ["a test whose name is not in its file", (manifest) => (checked(manifest).tests = [`${checkboxTests}::Checkbox look > never written`]), /names test .*never written.*, but checkbox\.test\.tsx has no test or describe titled "never written"/],
    ["a transition to a metadata attribute", (manifest) => (manifest.motion.checkbox.transitions = [{ from: "data-checked", to: "data-side", interrupt: true, tests: [tickTest] }]), /checkbox's transition data-checked to data-side names data-side, which is not a state attribute/],
    ["a transition with no interrupt flag", (manifest) => (manifest.motion.checkbox.transitions = [{ from: "data-checked", to: "data-checked", tests: [tickTest] }]), /checkbox's transitions each need "from", "to", "interrupt" and "tests"/],
    ["a gesture with no tests", (manifest) => (manifest.motion.checkbox.gestures = [{ name: "swipe", tests: [] }]), /checkbox's gestures each need a kebab-case "name" and "tests"/],
  ];
  for (const [what, edit, message] of cases) {
    const dir = scratch();
    editCheckbox(dir, edit);
    assert.throws(() => readMotion(dir), message, what);
  }
});

test("the reader rejects a declared part the stem's source does not render", () => {
  const dir = scratch();
  const file = join(dir, "registry/ouro/components/ouro/checkbox/checkbox.tsx");
  writeFileSync(file, readFileSync(file, "utf8").replace(' data-ouro-part="tick"', ""));
  assert.throws(() => readMotion(dir), /checkbox's data-checked names part tick, but checkbox never renders data-ouro-part="tick"/);
});

test("the motion matrix is plain data a browser test can import, one row per stem, state and part", () => {
  const rows = buildMotionMatrix(root);
  const file = JSON.parse(readFileSync(join(root, "test/generated/motion-matrix.json"), "utf8"));
  assert.deepEqual(file, rows);
  for (const row of rows) assert.deepEqual(Object.keys(row), ["item", "stem", "state", "kind", "part", "properties", "reduced", "tests"]);
  assert.deepEqual(
    rows.map((row) => `${row.stem} ${row.state} ${row.part ?? "-"}`),
    [
      "checkbox data-checked tick",
      "checkbox data-checked box",
      "checkbox data-unchecked tick",
      "checkbox data-unchecked box",
      "checkbox data-indeterminate box",
      "checkbox data-disabled box",
      "checkbox data-invalid box",
      "checkbox data-readonly -",
      "checklist data-checked tick",
      "checklist data-checked box",
      "checklist data-checked strike",
      "checklist data-checked label",
      "checklist data-checked value",
      "checklist data-unchecked tick",
      "checklist data-unchecked box",
      "checklist data-unchecked strike",
      "checklist data-unchecked label",
      "checklist data-unchecked value",
      "checklist data-disabled box",
      "checklist data-starting-style row",
      "checklist data-ending-style row",
      "inspector data-starting-style layer",
      "route-progress data-open bar",
      "route-progress data-closed bar",
    ],
  );
});

test("--check also fails when the motion matrix is stale", () => {
  const dir = scratch();
  const script = join(root, "scripts/control-matrix.mts");
  const run = (...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8" });
  const out = join(dir, "control-matrix.json");
  const motionOut = join(dir, "motion-matrix.json");
  assert.equal(run("--out", out, "--motion-out", motionOut).status, 0);
  assert.equal(run("--check", "--out", out, "--motion-out", motionOut).status, 0);
  writeFileSync(motionOut, "[]\n");
  const result = run("--check", "--out", out, "--motion-out", motionOut);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /motion-matrix\.json is stale.*pnpm controls:matrix/s);
});
