import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import fc from "fast-check";
import { unmarkedCounts, updateBaseline } from "../../registry/ouro/census/census.mjs";
import { BASELINE_PATH, compareWithBaseline, countFingerprints, findRegressions, isScannedFile, main, narrowedSettings } from "../../registry/ouro/source-rules/source-rules.mjs";

// Property tests of the two ratchets (docs/guides/conformance.md): whatever edits a pull request
// makes to the code, the settings or the baselines, neither kit lets the counted offenders rise,
// or stop being counted, without a recorded reason. Each property runs a few hundred generated
// cases from a fixed seed, so a run is deterministic; a failure prints the smallest case it found.

const runs = { seed: 133, numRuns: 300 };

describe("ouro-census: updateBaseline", () => {
  const PROJECTS = ["desktop-chrome", "iphone-webkit"];
  const IDENTITIES = ['button "Save" [-/-] in main', 'link "Recipes" [-/-] in navigation "Site"', 'button "Save" [button/root] in main', 'switch "Dark" [switch/root] in main'];
  const multiset = fc.uniqueArray(fc.record({ identity: fc.constantFrom(...IDENTITIES), count: fc.integer({ min: 1, max: 4 }) }), { selector: (entry) => entry.identity, maxLength: IDENTITIES.length });
  const states = fc.dictionary(fc.constantFrom("start", "open", "saved"), multiset, { minKeys: 1 });
  const journeys = fc.dictionary(fc.constantFrom("home", "recipe", "settings"), states, { minKeys: 1 });
  /** A census: every project records its own counts of the same journeys and states. */
  const census = journeys.chain((shape) =>
    fc.tuple(...PROJECTS.map(() => fc.tuple(...Object.values(shape).flatMap((byState) => Object.keys(byState).map(() => multiset))))).map((perProject) =>
      Object.fromEntries(
        PROJECTS.map((project, index) => {
          const sets = [...perProject[index]];
          return [project, Object.fromEntries(Object.entries(shape).map(([journey, byState]) => [journey, Object.fromEntries(Object.keys(byState).map((state) => [state, sets.shift()]))]))];
        }),
      ),
    ),
  );
  /** A run's merged actual: the census, carrying the expected set it covers. */
  const merged = (counts) => {
    const shape = counts[PROJECTS[0]];
    return { $expected: { $projects: [...PROJECTS], ...Object.fromEntries(Object.entries(shape).map(([journey, byState]) => [journey, Object.keys(byState).sort()])) }, ...counts };
  };
  const statesOf = (counts) =>
    Object.entries(unmarkedCounts(counts)).flatMap(([project, byJourney]) =>
      Object.entries(byJourney).flatMap(([journey, byState]) => Object.entries(byState).map(([state, unmarked]) => ({ project, journey, state, unmarked }))),
    );
  const key = ({ project, journey, state }) => `${project} / ${journey} / ${state}`;

  it("accepts a run without a reason exactly when no state is dropped and no state's unmarked count rises", () => {
    fc.assert(
      fc.property(census, census, (previous, actual) => {
        const after = new Map(statesOf(actual).map((entry) => [key(entry), entry.unmarked]));
        const ratchets = statesOf(previous).every((entry) => after.has(key(entry)) && after.get(key(entry)) <= entry.unmarked);
        let baseline;
        try {
          ({ baseline } = updateBaseline({ previous, actual: merged(actual) }));
        } catch {
          assert.equal(ratchets, false, "refused a run that drops nothing and raises nothing");
          return;
        }
        assert.equal(ratchets, true, "accepted a run that drops a state or raises one without a reason");
        assert.equal(baseline.$allowedRegressions, undefined);
        assert.equal(baseline.$removed, undefined);
      }),
      runs,
    );
  });

  it("records every rise and every drop it accepts, with its reason and the counts it moves between", () => {
    fc.assert(
      fc.property(census, census, (previous, actual) => {
        const remove = [...new Set(statesOf(previous).filter((entry) => !statesOf(actual).some((other) => key(other) === key(entry))).map((entry) => `${entry.project}/${entry.journey}/${entry.state}`))];
        const { baseline } = updateBaseline({ previous, actual: merged(actual), allowRegression: "a reviewed rise", remove, removeReason: "a reviewed drop" });
        const before = new Map(statesOf(previous).map((entry) => [key(entry), entry.unmarked]));
        const allowed = new Map((baseline.$allowedRegressions ?? []).filter((entry) => entry.replaces === undefined).map((entry) => [key(entry), entry]));
        for (const entry of statesOf(baseline)) {
          const from = before.get(key(entry));
          if (from === undefined || entry.unmarked <= from) continue;
          assert.deepEqual(allowed.get(key(entry)), { project: entry.project, journey: entry.journey, state: entry.state, from, to: entry.unmarked, reason: "a reviewed rise" });
        }
        const removed = new Map((baseline.$removed ?? []).map((entry) => [entry.key, entry]));
        assert.equal(removed.size, remove.length);
        for (const name of remove) {
          const [project, journey, state] = name.split("/");
          assert.deepEqual(removed.get(key({ project, journey, state })), { key: key({ project, journey, state }), unmarked: before.get(key({ project, journey, state })), reason: "a reviewed drop" });
        }
        // Every unmarked control the new baseline counts beyond the previous one, in a state both have, is a recorded rise.
        const risen = statesOf(baseline).reduce((total, entry) => total + Math.max(0, entry.unmarked - (before.get(key(entry)) ?? entry.unmarked)), 0);
        const recorded = [...allowed.values()].reduce((total, entry) => total + entry.to - entry.from, 0);
        assert.equal(recorded, risen);
      }),
      runs,
    );
  });

  it("refuses a renamed journey or state that holds more unmarked controls than the one it replaces, without a reason", () => {
    fc.assert(
      fc.property(census, fc.constantFrom("home", "recipe", "settings"), fc.integer({ min: 1, max: 3 }), (previous, renamed, extra) => {
        // Rename one journey on every project, and give the new name more unmarked controls.
        const journey = Object.keys(previous[PROJECTS[0]])[0];
        fc.pre(renamed !== journey && !(renamed in previous[PROJECTS[0]]));
        const actual = Object.fromEntries(
          PROJECTS.map((project) => {
            const { [journey]: moved, ...rest } = previous[project];
            const [first, ...others] = Object.entries(moved);
            const raised = [...first[1].filter(({ identity }) => identity !== IDENTITIES[0]), { identity: IDENTITIES[0], count: (first[1].find(({ identity }) => identity === IDENTITIES[0])?.count ?? 0) + extra }];
            return [project, { ...rest, [renamed]: Object.fromEntries([[first[0], raised], ...others]) }];
          }),
        );
        assert.throws(() => updateBaseline({ previous, actual: merged(actual), remove: [journey], removeReason: "renamed" }), /unmarked controls may only fall/);
        const { baseline } = updateBaseline({ previous, actual: merged(actual), remove: [journey], removeReason: "renamed", allowRegression: "a reviewed rename" });
        assert.ok(baseline.$allowedRegressions.some((entry) => entry.replaces === journey && entry.journey === renamed && entry.to - entry.from >= extra));
      }),
      runs,
    );
  });

  it("takes a baseline updated from itself unchanged, with nothing to record", () => {
    fc.assert(
      fc.property(census, (counts) => {
        const { baseline, regressions, removed } = updateBaseline({ previous: counts, actual: merged(counts) });
        assert.deepEqual([regressions, removed], [[], []]);
        assert.deepEqual(unmarkedCounts(baseline), unmarkedCounts(counts));
        // Updating again from the result changes nothing either.
        assert.deepEqual(updateBaseline({ previous: baseline, actual: merged(counts) }).baseline, baseline);
      }),
      runs,
    );
  });
});

describe("ouro-source-rules: narrowedSettings", () => {
  const segment = fc.constantFrom("app", "src", "web", "components", "ouro", "lib", "routes", "generated");
  const folder = fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => `${parts.join("/")}/`);
  const settings = fc.record({
    src: fc.constantFrom("app", "src", "web"),
    ouroDirs: fc.array(folder, { maxLength: 3 }),
    exclude: fc.array(folder, { maxLength: 2 }),
    hookPrefix: fc.constantFrom("", "app", "ui"),
    baseline: fc.constantFrom(BASELINE_PATH, "test/ouro-source-rules.baseline.json"),
  });
  const file = fc.tuple(fc.array(segment, { minLength: 1, maxLength: 4 }), fc.constantFrom(".tsx", ".ts", ".css")).map(([parts, extension]) => `${parts.join("/")}/file${extension}`);

  it("reports a change whenever the head's settings stop reading a file the base's read", () => {
    fc.assert(
      fc.property(settings, settings, fc.array(file, { minLength: 1, maxLength: 20 }), (base, head, files) => {
        const hidden = files.filter((name) => isScannedFile(name, base) && !isScannedFile(name, head));
        if (hidden.length > 0) assert.ok(narrowedSettings(base, head).length > 0, `${hidden.join(", ")} stopped being read with no change reported`);
      }),
      runs,
    );
  });

  it("reports nothing for the same settings or a scan that only widens, and each change once with its own fingerprint", () => {
    fc.assert(
      fc.property(settings, fc.nat(), (base, drop) => {
        assert.deepEqual(narrowedSettings(base, base), []);
        // Reading more: fewer skipped folders and no hook prefix.
        const wider = { ...base, ouroDirs: base.ouroDirs.filter((_, index) => index !== drop % (base.ouroDirs.length || 1)), exclude: [], hookPrefix: "" };
        assert.deepEqual(narrowedSettings(base, wider), []);
        const changes = narrowedSettings(wider, base);
        assert.equal(new Set(changes.map((change) => change.fingerprint)).size, changes.length);
      }),
      runs,
    );
  });
});

describe("ouro-source-rules: findRegressions", () => {
  const FILES = ["app/routes/a.tsx", "app/routes/b.tsx", "app/lib/c.tsx"];
  const COMPONENTS = ["A", "B", "Card"];
  const fingerprint = fc
    .record({
      file: fc.constantFrom(...FILES),
      component: fc.constantFrom(...COMPONENTS),
      category: fc.constantFrom("raw-button", "raw-anchor", "uses-hand-rolled-control"),
      tag: fc.constantFrom("button", "a", "app/lib/c.tsx#Card", "app/routes/b.tsx#NiceLink"),
      props: fc.constantFrom("", "type=button", "href={}", "aria-label=Save"),
    })
    .map(({ file, component, category, tag, props }) => ({ file, fingerprint: `${file}::${component}::${category}::${tag}::${props}` }));
  const offenders = fc.array(fingerprint, { maxLength: 12 }).map((list) => list.map((offender, line) => ({ ...offender, category: offender.fingerprint.split("::")[2], line: line + 1 })));
  const baseline = fc.array(fingerprint, { maxLength: 12 }).map((list) => countFingerprints(list));
  const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);

  it("pairs each move one to one, within a file or a component, and counts every other addition as a regression", () => {
    fc.assert(
      fc.property(offenders, baseline, (scan, counts) => {
        const { added, removed } = compareWithBaseline(scan, counts);
        const { regressions, moves } = findRegressions(scan, counts);
        const sum = (entries) => entries.reduce((all, entry) => all + entry.count, 0);
        assert.equal(sum(regressions) + moves.length, sum(added));
        assert.ok(moves.length <= sum(removed));
        // A fix elsewhere never pays for a new control: a move stays in its file or its component.
        for (const { from, to } of moves) {
          const [fromFile, fromComponent] = from.split("::");
          const [toFile, toComponent] = to.split("::");
          assert.ok(fromFile === toFile || fromComponent === toComponent, `${from} → ${to}`);
        }
        // So the regressions are never fewer than the controls the scan gained overall.
        assert.ok(sum(regressions) >= scan.length - total(counts));
      }),
      runs,
    );
  });

  it("finds nothing against a baseline that counts exactly the scan", () => {
    fc.assert(
      fc.property(offenders, (scan) => {
        assert.deepEqual(findRegressions(scan, countFingerprints(scan)), { regressions: [], moves: [] });
      }),
      runs,
    );
  });
});

describe("ouro-source-rules: main against a base ref", () => {
  // Raw buttons in three files, each in its own component with its own `type`, so no two are a move.
  const FILES = [
    { file: "app/routes/a.tsx", component: "A", type: "button" },
    { file: "app/routes/b.tsx", component: "B", type: "submit" },
    { file: "app/routes/c.tsx", component: "C", type: "reset" },
  ];
  const fingerprintOf = ({ file, component, type }) => `${file}::${component}::raw-button::button::type=${type}`;
  const counts = fc.tuple(...FILES.map(() => fc.integer({ min: 0, max: 3 })));
  const baselineText = (offenders, allowedRegressions) => `${JSON.stringify(allowedRegressions ? { allowedRegressions, offenders } : { offenders }, null, 2)}\n`;
  const countsOf = (perFile) => Object.fromEntries(FILES.map((entry, index) => [fingerprintOf(entry), perFile[index]]).filter(([, count]) => count > 0));

  /** A repository whose head has `head` buttons per file and a committed baseline of exactly them, against a base whose baseline counted `base`. */
  function repository(head, base, { allowedRegressions } = {}) {
    const store = Object.fromEntries(
      FILES.map(({ file, component, type }, index) => [
        `/repo/${file}`,
        `export function ${component}() { return <>${Array.from({ length: head[index] }, () => `<button type="${type}" />`).join("")}</>; }`,
      ]),
    );
    store[path.join("/repo", BASELINE_PATH)] = baselineText(countsOf(head), allowedRegressions);
    const missing = (file) => Object.assign(new Error(`ENOENT: ${file}`), { code: "ENOENT" });
    const written = [];
    const errors = [];
    let code = 0;
    const deps = {
      root: "/repo",
      readFile: (file) => {
        if (!(file in store)) throw missing(file);
        return store[file];
      },
      readdir: (directory) => {
        const inside = Object.keys(store).filter((file) => file.startsWith(`${directory}/`));
        if (inside.length === 0) throw missing(directory);
        return inside.map((file) => file.slice(directory.length + 1));
      },
      writeFile: (file, text) => written.push({ file, text }),
      io: { log: () => {}, error: (line) => errors.push(line) },
      exit: (value) => {
        code = value;
      },
      gitShow: (_root, _ref, file) => (file === BASELINE_PATH ? baselineText(countsOf(base)) : undefined),
    };
    return { deps, written, errors, code: () => code };
  }

  it("fails exactly when a file gained buttons the base's baseline did not count, unless this pull request recorded why", () => {
    fc.assert(
      fc.property(counts, counts, fc.boolean(), (head, base, explained) => {
        const rises = FILES.map((entry, index) => ({ fingerprint: fingerprintOf(entry), count: head[index] - base[index] })).filter(({ count }) => count > 0);
        const allowedRegressions = explained && rises.length > 0 ? rises.map((rise) => ({ ...rise, reason: "reviewed" })) : undefined;
        const { deps, code, errors } = repository(head, base, { allowedRegressions });
        main(["--base", "origin/main"], deps);
        assert.equal(code(), rises.length > 0 && !explained ? 1 : 0, errors.join("\n"));
      }),
      runs,
    );
  });

  it("writes a baseline only when every rise has a reason, and records each rise with it", () => {
    fc.assert(
      fc.property(counts, counts, fc.constantFrom(undefined, "reviewed"), (head, base, reason) => {
        const rises = FILES.map((entry, index) => ({ fingerprint: fingerprintOf(entry), count: head[index] - base[index] })).filter(({ count }) => count > 0);
        const { deps, code, written } = repository(head, base);
        main(["--write-baseline", "--base", "origin/main", ...(reason ? ["--allow-regression", reason] : [])], deps);
        if (rises.length > 0 && !reason) {
          assert.deepEqual([code(), written], [1, []]);
          return;
        }
        assert.equal(code(), 0);
        const { offenders, allowedRegressions = [] } = JSON.parse(written[0].text);
        assert.deepEqual(offenders, countsOf(head));
        assert.deepEqual(allowedRegressions, rises.map((rise) => ({ ...rise, reason })));
      }),
      runs,
    );
  });
});
