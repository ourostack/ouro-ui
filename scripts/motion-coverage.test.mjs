import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readMotion } from "./components.mts";
import { checkCoverage, mergePartitions, parseExpect, readPartitions } from "./motion-coverage.mts";
import { partitionFile, partitionOf, projectNames, writePartition } from "./motion-reporter.mts";

// The motion evidence: each Vitest run writes one partition per project and shard
// (.tmp/motion/<project>.<shard>.<worker>.json, scripts/motion-reporter.mts) holding the tests it
// ran and the motion records its passing tests made (test/motion.ts). scripts/motion-coverage.mts
// merges the partitions CI uploads and holds the component.json maps complete against them.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/motion-coverage.mts");
const file = "registry/ouro/components/ouro/fixture/fixture.test.tsx";
const id = (name) => `${file}::Fixture > ${name}`;

/** A map like a component.json's, for the stem `fixture`. */
const maps = () => [
  {
    name: "fixture",
    folder: "fixture",
    stem: "fixture",
    motion: {
      states: {
        "data-open": {
          kind: "motion",
          parts: {
            panel: { properties: ["opacity", "scale"], reduced: ["opacity"] },
            backdrop: { properties: ["opacity"], reduced: [] },
          },
          tests: [id("opens"), id("opens with reduced motion")],
        },
        "data-disabled": { kind: "none", tests: [id("disables")] },
      },
      transitions: [{ from: "data-open", to: "data-closed", interrupt: true, tests: [id("closes mid-open")] }],
      gestures: [{ name: "swipe", tests: [id("swipes")] }],
    },
  },
];

const state = (testName, part, properties, reduced, extra = {}) => ({ kind: "state", stem: "fixture", part, state: "data-open", properties, reduced, dir: "ltr", testId: id(testName), ...extra });
/** Records that cover the fixture map exactly. */
const complete = () => [
  state("opens", "panel", ["opacity", "scale"], false),
  state("opens", "backdrop", ["opacity"], false),
  state("opens with reduced motion", "panel", ["opacity"], true),
  state("opens with reduced motion", "backdrop", [], true),
  { kind: "state", stem: "fixture", part: "root", state: "data-disabled", properties: [], reduced: false, dir: "ltr", testId: id("disables") },
  { kind: "transition", stem: "fixture", from: "data-open", to: "data-closed", interrupt: true, testId: id("closes mid-open") },
  { kind: "gesture", stem: "fixture", gesture: "swipe", testId: id("swipes") },
];
const allTests = ["opens", "opens with reduced motion", "disables", "closes mid-open", "swipes"].map(id);
const merged = (records = complete(), tests = allTests) => ({ records, tests, problems: [] });

test("a complete record set covers the map", () => {
  assert.deepEqual(checkCoverage(maps(), merged()), []);
});

test("a declared state, transition or gesture with no record from one of its tests is unexercised", () => {
  const cases = [
    [complete().filter((record) => record.testId !== id("opens with reduced motion")), /fixture data-open: test .*opens with reduced motion.* ran but made no record \(unexercised\)/],
    [complete().filter((record) => record.state !== "data-disabled"), /fixture data-disabled: test .*disables.* ran but made no record \(unexercised\)/],
    [complete().filter((record) => record.kind !== "transition"), /fixture transition data-open to data-closed \(interrupt\): test .*closes mid-open.* ran but made no record \(unexercised\)/],
    [complete().filter((record) => record.kind !== "gesture"), /fixture gesture swipe: test .*swipes.* ran but made no record \(unexercised\)/],
  ];
  for (const [records, message] of cases) {
    const problems = checkCoverage(maps(), merged(records));
    assert.ok(problems.some((problem) => message.test(problem)), `${message}\n${problems.join("\n")}`);
  }
});

test("a reduced run's --stems leaves other stems' maps alone, but still checks every record", () => {
  const other = { stem: "other", motion: { states: { "data-open": { kind: "motion", parts: { panel: { properties: ["opacity"], reduced: [] } }, tests: [id("other opens")] } } } };
  assert.deepEqual(checkCoverage([...maps(), other], merged(), new Set(["fixture"])), []);
  assert.ok(checkCoverage([...maps(), other], merged()).some((problem) => /other data-open: names test .*other opens.* \(stale\)/.test(problem)));
  // With no stem selected, no map need be complete; an undeclared record still fails.
  assert.deepEqual(checkCoverage(maps(), merged([]), new Set()), []);
  const stray = { kind: "state", stem: "nowhere", part: "root", state: "data-open", properties: [], reduced: false, dir: "ltr", testId: id("opens") };
  assert.ok(checkCoverage(maps(), merged([stray]), new Set()).some((problem) => /nowhere data-open: .* names a stem with no motion map \(undeclared\)/.test(problem)));
});

test("a named test that no partition ran is stale", () => {
  const tests = allTests.filter((name) => name !== id("opens"));
  const problems = checkCoverage(maps(), merged(complete().filter((record) => record.testId !== id("opens")), tests));
  assert.ok(problems.some((problem) => /fixture data-open: names test .*Fixture > opens", which no partition ran \(stale\)/.test(problem)), problems.join("\n"));
});

test("a record of a state, part, transition, gesture or stem the maps do not declare is undeclared", () => {
  const cases = [
    [{ ...complete()[0], state: "data-checked" }, /fixture data-checked: a record from .*opens.* names a state the map does not declare \(undeclared\)/],
    [{ ...complete()[0], part: "glow" }, /fixture data-open glow: a record from .*opens.* names a part the state does not declare \(undeclared\)/],
    [{ ...complete()[0], stem: "button" }, /button data-open: a record from .*opens.* names a stem with no motion map \(undeclared\)/],
    [{ ...complete()[5], interrupt: false }, /fixture transition data-open to data-closed: a record from .*closes mid-open.* names a transition the map does not declare \(undeclared\)/],
    [{ ...complete()[6], gesture: "pinch" }, /fixture gesture pinch: a record from .*swipes.* names a gesture the map does not declare \(undeclared\)/],
  ];
  for (const [record, message] of cases) {
    const problems = checkCoverage(maps(), merged([...complete(), record]));
    assert.ok(problems.some((problem) => message.test(problem)), `${message}\n${problems.join("\n")}`);
  }
});

test("a motion state with no reduced-motion record for a part fails, even when that part's reduced list is empty", () => {
  for (const part of ["panel", "backdrop"]) {
    const records = complete().filter((record) => !(record.part === part && record.reduced));
    const problems = checkCoverage(maps(), merged(records));
    assert.ok(problems.some((problem) => new RegExp(`fixture data-open ${part}: no reduced-motion record`).test(problem)), problems.join("\n"));
  }
});

test("the properties recorded for a part, state and reduced setting must union to the declared list exactly", () => {
  const cases = [
    [[state("opens", "panel", ["opacity"], false)], /fixture data-open panel: declared opacity, scale but the tests recorded opacity \(missing scale\)/],
    [[state("opens", "panel", ["opacity", "scale", "translate"], false)], /fixture data-open panel: declared opacity, scale but the tests recorded opacity, scale, translate \(extra translate\)/],
    [[state("opens with reduced motion", "backdrop", ["opacity"], true)], /fixture data-open backdrop with reduced motion: declared nothing but the tests recorded opacity \(extra opacity\)/],
  ];
  for (const [replacements, message] of cases) {
    const records = complete().map((record) => replacements.find((next) => next.testId === record.testId && next.part === record.part && next.reduced === record.reduced) ?? record);
    const problems = checkCoverage(maps(), merged(records));
    assert.ok(problems.some((problem) => message.test(problem)), `${message}\n${problems.join("\n")}`);
  }
  // Two tests may each prove part of a list: the union is what counts.
  const split = [...complete().filter((record) => !(record.part === "panel" && !record.reduced)), state("opens", "panel", ["opacity"], false), state("opens with reduced motion", "panel", ["scale"], false)];
  assert.deepEqual(checkCoverage(maps(), merged(split)), []);
});

test("a none state fails when a test recorded motion for it", () => {
  const records = complete().map((record) => (record.state === "data-disabled" ? { ...record, properties: ["opacity"] } : record));
  const problems = checkCoverage(maps(), merged(records));
  assert.ok(problems.some((problem) => /fixture data-disabled: declared no motion but .*disables.* recorded opacity on root \(extra opacity\)/.test(problem)), problems.join("\n"));
});

/** A partition as the reporter writes it. */
const partition = (project, index, count, records = [], tests = []) => ({ project, shard: { index, count }, worker: `w${index}${project.length}`, tests, records });

test("--expect names each project and its shard count", () => {
  assert.deepEqual(parseExpect("ouro-chromium:2,ouro-webkit:1"), [
    { project: "ouro-chromium", count: 2 },
    { project: "ouro-webkit", count: 1 },
  ]);
  assert.throws(() => parseExpect("ouro-chromium"), /--expect takes <project>:<shard count>/);
  assert.throws(() => parseExpect("ouro-chromium:0"), /--expect takes <project>:<shard count>/);
  assert.throws(() => parseExpect("ouro-chromium:1,ouro-chromium:2"), /--expect names ouro-chromium twice/);
});

test("the merge is deterministic: sorted and de-duplicated by exact record, whatever order the files come in", () => {
  const [a, b] = [complete().slice(0, 4), complete().slice(2)];
  const files = [
    { file: "x/ouro-chromium.1of1.a.json", data: partition("ouro-chromium", 1, 1, a, allTests.slice(0, 3)) },
    { file: "y/ouro-webkit.1of1.b.json", data: partition("ouro-webkit", 1, 1, b, allTests.slice(2)) },
  ];
  const forward = mergePartitions(files);
  const backward = mergePartitions([...files].reverse());
  assert.deepEqual(forward, backward);
  assert.deepEqual(forward.problems, []);
  assert.equal(forward.records.length, complete().length);
  assert.deepEqual(forward.tests, [...allTests].sort());
  assert.deepEqual(checkCoverage(maps(), forward), []);
});

test("the merge fails on an expected partition that is missing, one that appears twice and one nobody expected", () => {
  const expected = parseExpect("ouro-chromium:2,ouro-webkit:1");
  const missing = mergePartitions([{ file: "a/ouro-chromium.1of2.a.json", data: partition("ouro-chromium", 1, 2) }, { file: "b/ouro-webkit.1of1.b.json", data: partition("ouro-webkit", 1, 1) }], expected);
  assert.deepEqual(missing.problems, ["partition ouro-chromium shard 2 of 2 is missing"]);
  const twice = mergePartitions(
    [
      { file: "a/ouro-chromium.1of2.a.json", data: partition("ouro-chromium", 1, 2) },
      { file: "b/ouro-chromium.2of2.b.json", data: partition("ouro-chromium", 2, 2) },
      { file: "c/ouro-chromium.2of2.c.json", data: { ...partition("ouro-chromium", 2, 2), worker: "c" } },
      { file: "d/ouro-webkit.1of1.d.json", data: partition("ouro-webkit", 1, 1) },
    ],
    expected,
  );
  assert.deepEqual(twice.problems, ["partition ouro-chromium shard 2 of 2 appears twice: b/ouro-chromium.2of2.b.json, c/ouro-chromium.2of2.c.json"]);
  const extra = mergePartitions(
    [
      { file: "a/ouro-chromium.1of2.a.json", data: partition("ouro-chromium", 1, 2) },
      { file: "b/ouro-chromium.2of2.b.json", data: partition("ouro-chromium", 2, 2) },
      { file: "d/ouro-webkit.1of1.d.json", data: partition("ouro-webkit", 1, 1) },
      { file: "e/site.1of1.e.json", data: partition("site", 1, 1) },
      { file: "f/ouro-webkit.1of3.f.json", data: partition("ouro-webkit", 1, 3) },
    ],
    expected,
  );
  assert.deepEqual(extra.problems, ["partition ouro-webkit shard 1 of 3 (f/ouro-webkit.1of3.f.json) is not expected", "partition site shard 1 of 1 (e/site.1of1.e.json) is not expected"]);
  // Without --expect, any set of partitions merges, but one still may not appear twice.
  assert.deepEqual(mergePartitions([]).problems, ["no motion partitions found: run pnpm test first"]);
  assert.match(mergePartitions([{ file: "a/site.1of1.a.json", data: partition("site", 1, 1) }, { file: "b/site.1of1.b.json", data: partition("site", 1, 1) }]).problems[0], /appears twice/);
});

test("the merge rejects a file whose name does not match its partition", () => {
  const result = mergePartitions([{ file: "a/ouro-webkit.1of1.a.json", data: partition("ouro-chromium", 1, 1) }]);
  assert.deepEqual(result.problems, ["a/ouro-webkit.1of1.a.json holds partition ouro-chromium shard 1 of 1, which its name does not match"]);
});

test("the reporter's partition lists every test it ran and the records of the tests that passed, sorted", () => {
  const data = partitionOf({
    project: "ouro-chromium",
    shard: { index: 1, count: 1 },
    worker: "w",
    cases: [
      { testId: id("opens"), state: "passed", records: [state("opens", "panel", ["scale", "opacity"], false), state("opens", "backdrop", ["opacity"], false)] },
      { testId: id("disables"), state: "failed", records: [complete()[4]] },
      { testId: id("swipes"), state: "skipped", records: [] },
    ],
  });
  assert.deepEqual(data.tests, [id("disables"), id("opens"), id("swipes")]);
  assert.deepEqual(
    data.records.map((record) => `${record.part} ${record.properties.join(" ")}`),
    ["backdrop opacity", "panel opacity scale"],
  );
  assert.equal(partitionFile(data), "ouro-chromium.1of1.w.json");
});

test("the reporter names a browser project's partition by its project, unless the run has several instances of it", () => {
  assert.deepEqual(Object.fromEntries(projectNames(["ouro-chromium (chromium)", "ouro-webkit (webkit)", "site (chromium)", "plain"])), {
    "ouro-chromium (chromium)": "ouro-chromium",
    "ouro-webkit (webkit)": "ouro-webkit",
    "site (chromium)": "site",
    plain: "plain",
  });
  assert.deepEqual(Object.fromEntries(projectNames(["app (chromium)", "app (webkit)"])), { "app (chromium)": "app-chromium", "app (webkit)": "app-webkit" });
});

test("the reporter writes one file per project and replaces the project's partitions from an earlier run", () => {
  const base = join(root, ".tmp");
  mkdirSync(base, { recursive: true });
  const dir = join(mkdtempSync(join(base, "motion-partitions-")), "motion");
  writePartition(dir, partition("ouro-chromium", 1, 3));
  writePartition(dir, partition("ouro-webkit", 1, 1));
  writePartition(dir, { ...partition("ouro-chromium", 1, 1), worker: "later" });
  assert.deepEqual(readdirSync(dir).sort(), ["ouro-chromium.1of1.later.json", `ouro-webkit.1of1.${partition("ouro-webkit", 1, 1).worker}.json`]);
  assert.equal(readPartitions(dir).length, 2);
});

test("motion:coverage merges the partitions under a folder and checks the repository's maps", () => {
  const base = join(root, ".tmp");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "motion-coverage-"));
  // Records that cover every declared state, part and reduced setting, from every named test.
  const records = [];
  const tests = new Set();
  for (const { stem, motion } of readMotion(root)) {
    for (const [name, declared] of Object.entries(motion.states)) {
      for (const testId of declared.tests) {
        tests.add(testId);
        if (declared.kind === "none") records.push({ kind: "state", stem, part: "root", state: name, properties: [], reduced: false, dir: "ltr", testId });
        for (const [part, { properties, reduced }] of Object.entries(declared.parts ?? {})) {
          records.push({ kind: "state", stem, part, state: name, properties: [...properties].sort(), reduced: false, dir: "ltr", testId });
          records.push({ kind: "state", stem, part, state: name, properties: [...reduced].sort(), reduced: true, dir: "ltr", testId });
        }
      }
    }
    for (const { from, to, interrupt, tests: named } of motion.transitions ?? []) {
      for (const testId of named) {
        tests.add(testId);
        records.push({ kind: "transition", stem, from, to, interrupt, testId });
      }
    }
    for (const { name: gesture, tests: named } of motion.gestures ?? []) {
      for (const testId of named) {
        tests.add(testId);
        records.push({ kind: "gesture", stem, gesture, testId });
      }
    }
  }
  mkdirSync(join(dir, "motion-ci"), { recursive: true });
  const chromium = partitionOf({ project: "ouro-chromium", shard: { index: 1, count: 1 }, worker: "a", cases: [...tests].map((testId) => ({ testId, state: "passed", records: records.filter((record) => record.testId === testId) })) });
  writeFileSync(join(dir, "motion-ci", partitionFile(chromium)), JSON.stringify(chromium));
  const webkit = partitionOf({ project: "ouro-webkit", shard: { index: 1, count: 1 }, worker: "b", cases: [] });
  writeFileSync(join(dir, "motion-ci", partitionFile(webkit)), JSON.stringify(webkit));
  const run = (...args) => spawnSync("node", [script, "--dir", dir, ...args], { cwd: root, encoding: "utf8" });
  const passing = run("--expect", "ouro-chromium:1,ouro-webkit:1");
  assert.equal(passing.status, 0, passing.stderr);
  assert.match(passing.stdout, /2 partitions/);
  const missing = run("--expect", "ouro-chromium:1,ouro-webkit:1,ouro-touch:1");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /partition ouro-touch shard 1 of 1 is missing/);
  // A record dropped from the evidence fails the check by name.
  chromium.records = chromium.records.filter((record) => record.reduced === false);
  writeFileSync(join(dir, "motion-ci", partitionFile(chromium)), JSON.stringify(chromium));
  const unreduced = run();
  assert.equal(unreduced.status, 1);
  assert.match(unreduced.stderr, /checkbox data-checked tick: no reduced-motion record/);
  // A reduced run that selected no motion map passes on the same evidence, and says what it checked.
  const scoped = run("--stems", "");
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.match(scoped.stdout, /0 motion maps \(of \d+; this run's stems: none\)/);
  assert.ok(existsSync(join(dir, "motion-ci")));
});

test("pnpm motion:coverage runs the checker", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["motion:coverage"], "node scripts/motion-coverage.mts");
  assert.match(pkg.scripts["test:scripts"], /scripts\/motion\.test\.mjs scripts\/motion-coverage\.test\.mjs/);
});
