import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { checksFor } from "./checks/index.mts";
import { median, points, weights } from "./formula.mts";
import { arms, prompt } from "./prompt.mts";
import { acceptanceItems, screens } from "./screens.mts";
import { score } from "./score.mts";
import { newFindings } from "./static.mts";
import { resultsTable } from "./table.mts";
import { armManifest, armRecordPath, changedConfig, collect, configHashes, createWorkspace } from "./workspace.mts";
import { fixture, here, root, scratch } from "./score-fixture.mjs";

// The scorer's baselines, formula, prompt, specs and results table. Its scores of each screen are
// proven in score-screens.test.mjs, score-broken.test.mjs and score-minimum.test.mjs.

// One at a time: each test type checks an app while it sets up, which would starve the other's browser.
describe("an agent pays only for what it did, not for what the app started with", () => {
  // A "library" file with one type error (an unused import) and one lint error, as an arm
  // might ship, recorded as the arm's baseline before the "agent" runs.
  const library = 'import { useEffect, useState } from "react";\n\nexport function useFlag(on: boolean) {\n  if (on) useEffect(() => {}, []);\n  return on;\n}\n';
  const arm = async (name) => {
    const dir = fixture(name, "confirm-delete", undefined, undefined, { "src/library.tsx": library });
    const record = await armManifest(dir, "ouro", { shadcnCli: "0.0.0" });
    return { dir, record, path: armRecordPath(dir) };
  };
  const edit = (dir, path, change) => writeFileSync(join(dir, path), change(readFileSync(join(dir, path), "utf8")));

  test("the baseline excuses the library's own errors, even after the agent edits the file", async () => {
    const { dir, record, path } = await arm("baseline");
    assert.deepEqual(record.baseline.typecheck.map((finding) => [finding.file, finding.rule]), [["src/library.tsx", "TS6133"]]);
    assert.deepEqual(record.baseline.lint.map((finding) => finding.file), ["src/library.tsx"]);
    // The agent's edit moves every line, and a reformatted package.json changes no setting.
    edit(dir, "src/library.tsx", (source) => `// Changed by the agent.\n\n${source}`);
    edit(dir, "package.json", (source) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(source)).reverse())));
    const result = await score({ arm: "ouro", screen: "confirm-delete", dir, record: path, out: join(scratch, "baseline-score") });
    assert.deepEqual(result.failures, []);
    assert.equal(result.points.score, 100);
    assert.deepEqual([result.checks.typecheck.excused, result.checks.lint.excused], [1, 1]);

    const unexcused = await score({ arm: "ouro", screen: "confirm-delete", dir, out: join(scratch, "baseline-none-score") });
    assert.equal(unexcused.points.score, 100 - weights.typecheck - weights.lint);
  });

  test("an error the agent adds to a file with baseline errors is charged", async () => {
    const { dir, path } = await arm("baseline-new");
    edit(dir, "src/library.tsx", (source) => `${source}\nexport const count: number = "one";\n`);
    const result = await score({ arm: "ouro", screen: "confirm-delete", dir, record: path, out: join(scratch, "baseline-new-score") });
    assert.deepEqual(result.checks.typecheck.new.map((finding) => [finding.file, finding.rule]), [["src/library.tsx", "TS2322"]]);
    assert.equal(result.checks.typecheck.excused, 1);
    assert.equal(result.points.score, 100 - weights.typecheck);
  });

  test("a tsconfig loosened to hide a type error still loses the type points, because the original is restored", async () => {
    const { dir, path } = await arm("config");
    edit(dir, "src/App.tsx", (source) => `${source}\nconst unusedByTheAgent = 1;\n`);
    edit(dir, "tsconfig.app.json", (source) => source.replace('"noUnusedLocals": true', '"noUnusedLocals": false'));
    const result = await score({ arm: "ouro", screen: "confirm-delete", dir, record: path, out: join(scratch, "config-score") });
    assert.deepEqual(result.checks.config.changed, ["tsconfig.app.json"]);
    assert.deepEqual(result.checks.typecheck.new.map((finding) => [finding.file, finding.rule]), [["src/App.tsx", "TS6133"]]);
    assert.equal(result.points.score, 100 - weights.typecheck);
    assert.match(readFileSync(join(dir, "tsconfig.app.json"), "utf8"), /"noUnusedLocals": true/);
    assert.match(readFileSync(join(dir, ".agent-config/tsconfig.app.json"), "utf8"), /"noUnusedLocals": false/);
    // Revert the scored run's config to the agent's, as a `git restore` of the run would, and
    // score again: the original is restored again and the result is the same.
    cpSync(join(dir, ".agent-config/tsconfig.app.json"), join(dir, "tsconfig.app.json"));
    const again = await score({ arm: "ouro", screen: "confirm-delete", dir, record: path, out: join(scratch, "config-again-score") });
    assert.deepEqual(again.checks.config.changed, ["tsconfig.app.json"]);
    assert.deepEqual(again.points, result.points);
    assert.match(readFileSync(join(dir, "tsconfig.app.json"), "utf8"), /"noUnusedLocals": true/);
    assert.match(readFileSync(join(dir, ".agent-config/tsconfig.app.json"), "utf8"), /"noUnusedLocals": false/);
  });

  test("a harmless config rewrite and an added config file cost nothing", async () => {
    const { dir, path } = await arm("config-harmless");
    edit(dir, "vite.config.ts", (source) => `${source}\n// Reformatted by the agent.\n`);
    writeFileSync(join(dir, "tsconfig.extra.json"), "{}\n");
    const result = await score({ arm: "ouro", screen: "confirm-delete", dir, record: path, out: join(scratch, "config-harmless-score") });
    assert.deepEqual(result.checks.config.changed, ["tsconfig.extra.json", "vite.config.ts"]);
    assert.equal(result.points.score, 100);
    assert.equal(existsSync(join(dir, "tsconfig.extra.json")), false);
  });

  test("the workspace hides the arm's record, and collecting keeps a copy the agent never saw", async () => {
    const { dir, path } = await arm("collect");
    const workspace = join(scratch, "collect-workspace");
    createWorkspace(dir, "confirm-delete", workspace);
    assert.equal(existsSync(join(workspace, ".agent-usability")), false);
    assert.ok(existsSync(join(workspace, "src/api/cookbooks.ts")));
    const runs = join(scratch, "collect-runs");
    const kept = collect(dir, "confirm-delete", workspace, runs, "1");
    assert.equal(kept, join(runs, "ouro/confirm-delete/1"));
    assert.ok(existsSync(join(kept, "src/App.tsx")));
    assert.equal(readFileSync(join(runs, "arms/ouro.json"), "utf8"), readFileSync(path, "utf8"));
    assert.throws(() => collect(dir, "confirm-delete", workspace, runs, "1"), /is not empty/);
    writeFileSync(path, readFileSync(path, "utf8").replace('"0.0.0"', '"9.9.9"'));
    assert.throws(() => collect(dir, "confirm-delete", workspace, runs, "2"), /every run of an arm must start from the same app/);
  });
});

test("findings match the baseline by file, rule and message, never by line, and one entry excuses one finding", () => {
  const unused = { file: "src/a.tsx", rule: "TS6133", message: "'React' is declared but its value is never read." };
  assert.deepEqual(newFindings([unused], [unused]), []);
  assert.deepEqual(newFindings([unused, unused], [unused]), [unused]);
  assert.deepEqual(newFindings([{ ...unused, file: "src/b.tsx" }], [unused]), [{ ...unused, file: "src/b.tsx" }]);
  assert.deepEqual(newFindings([{ ...unused, message: "'useState' is declared but its value is never read." }], [unused]).length, 1);
  assert.deepEqual(newFindings([], [unused]), []);
});

test("config files are compared by their settings, whatever the key order, and an added one is a change", () => {
  const dir = join(scratch, "config-hashes");
  cpSync(join(here, "test/fixture-app"), dir, { recursive: true });
  const recorded = configHashes(dir);
  assert.deepEqual(Object.keys(recorded), ["package.json", "tsconfig.app.json", "tsconfig.json", "tsconfig.node.json", "vite.config.ts"]);
  assert.deepEqual(changedConfig(dir, recorded), []);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(readFileSync(join(dir, "tsconfig.json"), "utf8"))).reverse()), null, 4));
  assert.deepEqual(changedConfig(dir, recorded), [], "reordered keys are the same settings");
  writeFileSync(join(dir, "tsconfig.extra.json"), "{}");
  writeFileSync(join(dir, "vite.config.ts"), `${readFileSync(join(dir, "vite.config.ts"), "utf8")}\n// changed\n`);
  assert.deepEqual(changedConfig(dir, recorded), ["tsconfig.extra.json", "vite.config.ts"]);
});

test("the formula adds each part's share, and gives nothing when no check that exercises the task passes", () => {
  assert.deepEqual(points({ typecheck: true, lint: false, axe: [true, true, false, true], behavior: [true, false], gates: [true, true] }), {
    typecheck: 20,
    lint: 0,
    axe: 15,
    behavior: 25,
    score: 60,
    max: 100,
  });
  // A passing check that a near-empty page also passes unlocks nothing and earns nothing alone.
  assert.equal(points({ typecheck: true, lint: true, axe: [true, true, true, true], behavior: [false, true], gates: [true, false] }).score, 0);
  assert.equal(points({ typecheck: true, lint: true, axe: [true, true, true, true], behavior: [true, true], gates: [true, false] }).score, 100);
  assert.deepEqual(points({ typecheck: true, lint: true, axe: [true, true, true, true], behavior: [false, false], gates: [true, true] }), {
    typecheck: 0,
    lint: 0,
    axe: 0,
    behavior: 0,
    score: 0,
    max: 100,
  });
  assert.equal(median([90, 40, 100]), 90);
  assert.equal(median([80, 90]), 85);
});

test("every acceptance item of every screen has a behavior check, or says what judges it", () => {
  assert.deepEqual(screens, ["settings-form", "recipe-list", "command-palette", "confirm-delete", "app-shell"]);
  for (const screen of screens) {
    const items = acceptanceItems(screen);
    const { checks, judgedElsewhere } = checksFor(screen);
    assert.ok(checks.length >= 4, `${screen} has ${checks.length} checks`);
    const covered = new Set([...checks.flatMap((check) => check.covers), ...Object.keys(judgedElsewhere).map(Number)]);
    assert.deepEqual(
      items.map((item) => item.number).filter((number) => !covered.has(number)),
      [],
      `${screen}: acceptance items with no check`,
    );
    for (const number of covered) assert.ok(number >= 1 && number <= items.length, `${screen} covers item ${number}, which does not exist`);
    assert.equal(new Set(checks.map((check) => check.id)).size, checks.length, `${screen}: check ids repeat`);
  }
});

test("the prompt is the same for every arm except its setup line", () => {
  assert.deepEqual(arms, ["shadcn", "shadcn-skill", "ouro"]);
  for (const screen of screens) {
    const prompts = arms.map((arm) => prompt(arm, screen, "/work/app"));
    const [first, ...rest] = prompts.map((text) => text.split("\n").slice(1).join("\n"));
    for (const other of rest) assert.equal(other, first);
    assert.equal(new Set(prompts.map((text) => text.split("\n")[0])).size, arms.length);
    assert.ok(first.includes(readFileSync(join(here, "screens", screen, "task.md"), "utf8").trim()));
    assert.ok(first.includes("/work/app"));
    assert.doesNotMatch(first, /ouro|shadcn/i, `${screen}: the shared part names a library`);
  }
  assert.match(prompt("shadcn-skill", "app-shell", "/work/app").split("\n")[0], /\.claude\/skills\/shadcn\/SKILL\.md/);
});

test("the README gives the prompt as prompt.mts writes it, and says how to start a fresh agent", () => {
  const readme = readFileSync(join(here, "README.md"), "utf8");
  for (const arm of arms) {
    const [setup, ...shared] = prompt(arm, "app-shell", "<workspace>").split("# App shell")[0].trim().split("\n");
    assert.ok(readme.includes(`\`${arm}\`: \`${setup}\``), `the ${arm} setup line`);
    assert.ok(readme.includes(shared.join("\n").trim()), "the shared part of the prompt");
  }
  // One command for every arm: a new process, no user or project instructions, the workspace as its folder.
  assert.match(readme, /cd "\$WORKSPACE" && claude -p .* --safe-mode --model "\$MODEL" --effort "\$EFFORT"/);
  // The formula is documented in formula.mts only.
  assert.doesNotMatch(readme, /\| (Typecheck|Lint|Axe|Behavior) \| \d+ \|/);
});

test("no screen spec names a library or its components, and each names the scan that judges it", () => {
  for (const screen of screens) {
    const text = readFileSync(join(here, "screens", screen, "task.md"), "utf8");
    assert.doesNotMatch(text, /ouro|shadcn|base ui|radix/i, screen);
    assert.doesNotMatch(text, /<[A-Z]\w+/, `${screen} names a component`);
    const last = acceptanceItems(screen).at(-1);
    assert.match(last.text, /axe-core's WCAG 2 A and AA rules/, screen);
    assert.match(text, /At 390px wide the page does not scroll sideways\./, screen);
  }
});

test("the results table lists every run, the median, the agent and each arm's pinned versions", () => {
  const dir = join(scratch, "table");
  const write = (arm, screen, run, total) => {
    mkdirSync(join(dir, arm, screen, String(run), "score"), { recursive: true });
    writeFileSync(
      join(dir, arm, screen, String(run), "score", "score.json"),
      JSON.stringify({
        arm,
        screen,
        formulaVersion: 4,
        versions: { harness: "0123456789abcdef0123456789abcdef01234567", axeCore: "4.12.0", chromium: "150.0.1" },
        points: { typecheck: 20, lint: 10, axe: 20, behavior: total - 50, score: total, max: 100 },
      }),
    );
  };
  const record = (arm, extra) => {
    mkdirSync(join(dir, "arms"), { recursive: true });
    writeFileSync(
      join(dir, "arms", `${arm}.json`),
      JSON.stringify({
        arm,
        createdAt: "2026-10-12T10:00:00.000Z",
        shadcnCli: "4.21.1",
        ouroRef: null,
        skill: null,
        llmsTxt: { url: "https://example.com/llms.txt", sha256: "abcdef0123456789abcdef" },
        packages: { react: "19.3.0" },
        files: { "src/a.tsx": "00" },
        config: {},
        configFiles: {},
        baseline: { typecheck: [], lint: [] },
        ...extra,
      }),
    );
  };
  for (const [run, total] of [[1, 100], [2, 62.5], [3, 90]]) write("ouro", "app-shell", run, total);
  write("shadcn", "app-shell", 1, 80);
  write("shadcn", "app-shell", 2, 70);
  record("ouro", { ouroRef: "v0.6.0" });
  assert.throws(() => resultsTable(dir), /run\.md is missing/);
  writeFileSync(join(dir, "run.md"), "- Model: some-model\n- Effort: high\n");
  assert.throws(() => resultsTable(dir), /no "- Agent: \.\.\." line/);
  writeFileSync(join(dir, "run.md"), "- Model: some-model\n- Effort: high\n- Agent: claude 2.1.296, safe mode\n");
  assert.throws(() => resultsTable(dir), /no arm record at .*arms\/shadcn\.json/);
  record("shadcn", { baseline: { typecheck: [{ file: "src/components/ui/scroll-area.tsx", rule: "TS6133", message: "unused" }], lint: [] } });

  const table = resultsTable(dir);
  const lines = table.split("\n");
  assert.ok(lines.includes("- Model: some-model"), table);
  assert.ok(lines.includes("| Screen | shadcn/ui | shadcn/ui with its skill | Ouro HX |"), table);
  assert.ok(lines.includes("| app-shell | 80, 70 (2 of 3 runs) | not run | 100, 62.5, 90 (median 90) |"), table);
  assert.ok(lines.includes("| settings-form | not run | not run | not run |"), table);
  assert.match(table, /No means are shown, because not every arm has 3 scored runs of every screen\./);
  assert.ok(lines.includes("| Pinned | shadcn/ui | Ouro HX |"), table);
  assert.ok(lines.includes("| shadcn CLI | 4.21.1 | 4.21.1 |"), table);
  assert.ok(lines.includes("| Ouro HX release | none | v0.6.0 |"), table);
  assert.ok(lines.includes("| llms.txt (sha256) | abcdef012345 | abcdef012345 |"), table);
  assert.ok(lines.includes("| react | 19.3.0 | 19.3.0 |"), table);
  assert.ok(lines.includes("| Type errors before the agent ran | 1 | 0 |"), table);
  assert.match(table, /Scored by harness commit 0123456789ab, axe-core 4\.12\.0, Chromium 150\.0\.1, formula 4 /);

  // With three runs of every screen for every arm, the means appear.
  for (const arm of arms) for (const screen of screens) for (const run of [1, 2, 3]) write(arm, screen, run, 60 + run * 10);
  record("shadcn-skill", {});
  assert.throws(() => resultsTable(dir), /no "- shadcn CLI the skill-arm agents ran: \.\.\." line/);
  writeFileSync(join(dir, "run.md"), "- Model: some-model\n- Effort: high\n- Agent: claude 2.1.296, safe mode\n- shadcn CLI the skill-arm agents ran: 4.21.2\n");
  const full = resultsTable(dir);
  assert.ok(full.split("\n").includes("| Mean of the five medians | 80 | 80 | 80 |"), full);
  assert.ok(full.split("\n").includes("| Ouro HX | 20 | 10 | 20 | 30 |"), full);
});

test("the workflow scores committed output on demand and weekly, never on pull requests, and fails when the scorer does", () => {
  const workflow = readFileSync(join(root, ".github/workflows/agent-usability.yml"), "utf8");
  assert.match(workflow, /^on:\n {2}workflow_dispatch:/m);
  assert.match(workflow, /^ {2}schedule:\n {4}- cron: /m);
  assert.doesNotMatch(workflow, /^ {2}(pull_request|push):/m);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  // Without pipefail the step would take tee's exit code and pass when the scorer crashed.
  assert.match(workflow, /set -o pipefail\n\s+node scripts\/agent-usability\/score-runs\.mts "\$DATE" \| tee -a "\$GITHUB_STEP_SUMMARY"/);
});

test("score-runs.mts exits 1 when it can't score a run", () => {
  const source = readFileSync(join(here, "score-runs.mts"), "utf8");
  assert.match(source, /if \(broken\.length > 0\) process\.exitCode = 1;/);
});

test("the Ouro arm installs base tokens once before the runtime components", () => {
  const create = readFileSync(join(here, "arms/create.sh"), "utf8");
  const base = '"${shadcn[@]}" add --yes "ourostack/ouro-ui/ouro-base#$ouro_ref"';
  const components = '"${shadcn[@]}" add --yes "${addresses[@]}"';
  assert.equal(create.split(base).length - 1, 1);
  assert.ok(create.indexOf(base) < create.indexOf(components));
  const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
  assert.equal(registry.items.find((item) => item.name === "ouro-base")?.type, "registry:item");
});

test("the arm script pins the shadcn CLI the install test verifies, the skills CLI and the skill's commit", () => {
  const create = readFileSync(join(here, "arms/create.sh"), "utf8");
  const install = readFileSync(join(root, "scripts/install-test.sh"), "utf8");
  const pin = /shadcn@(\d+\.\d+\.\d+)/;
  assert.equal(create.match(pin)?.[1], install.match(pin)?.[1]);
  assert.match(create, /skills@\d+\.\d+\.\d+/);
  assert.match(create, /SHADCN_SKILL_REF:-[0-9a-f]{40}\}/);
  assert.match(create, /--save-exact "oxlint@\$oxlint"/);
});
