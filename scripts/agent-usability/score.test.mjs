import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { checksFor } from "./checks/index.mts";
import { points, weights } from "./formula.mts";
import { arms, prompt } from "./prompt.mts";
import { acceptanceItems, screens } from "./screens.mts";
import { score } from "./score.mts";
import { resultsTable } from "./table.mts";
import { addScreenFiles } from "./workspace.mts";

// The scorer is proven on a known-good version of every screen (test/screens/<screen>.tsx,
// plain React on test/fixture-app), which must score full marks, and on copies of the
// confirm-delete one that each break one thing: every copy must lose exactly that part's
// points and nothing else.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
mkdirSync(join(root, ".tmp"), { recursive: true });
// Inside the repository, so the fixture resolves react, vite and typescript from its node_modules.
const scratch = mkdtempSync(join(root, ".tmp", "agent-usability-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A copy of the known-good app for a screen (test/screens/<screen>.tsx on test/fixture-app), with one file changed by `edit`. */
function fixture(name, screen, edit = (source) => source, file = "src/App.tsx") {
  const dir = join(scratch, name);
  cpSync(join(here, "test/fixture-app"), dir, { recursive: true });
  cpSync(join(here, "test/screens", `${screen}.tsx`), join(dir, "src/App.tsx"));
  addScreenFiles(dir, screen);
  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  const after = edit(before);
  if (name !== screen) assert.notEqual(after, before, `${name}: the edit changed nothing`);
  writeFileSync(path, after);
  return dir;
}

const run = (name, edit, file) =>
  score({ arm: "ouro", screen: "confirm-delete", dir: fixture(name, "confirm-delete", edit, file), out: join(scratch, `${name}-score`) });

describe("a known-good screen scores full marks", { concurrency: 2 }, () => {
  for (const screen of screens) {
    test(`${screen}: 100`, async () => {
      const result = await score({ arm: "ouro", screen, dir: fixture(screen, screen), out: join(scratch, `${screen}-score`) });
      assert.deepEqual(result.failures, [], JSON.stringify(result.failures, null, 2));
      assert.equal(result.points.score, 100);
      assert.equal(result.axe.length, 4);
      assert.ok(result.screenshots.length >= 4);
      assert.deepEqual(result.behavior.map((check) => check.id), checksFor(screen).checks.map((check) => check.id));
    });
  }
});

describe("a broken copy of the confirm-delete screen loses exactly the expected points", { concurrency: 2 }, () => {
  const behaviorCount = checksFor("confirm-delete").checks.length;

  test("the score is written as JSON and as a markdown summary", async () => {
    const result = await run("written", (source) => `${source}\n`);
    assert.equal(result.points.score, 100);
    const written = JSON.parse(readFileSync(join(scratch, "written-score/score.json"), "utf8"));
    assert.deepEqual(written.points, { typecheck: 20, lint: 10, axe: 20, behavior: 50, score: 100, max: 100 });
    assert.equal(written.formulaVersion, 1);
    assert.match(readFileSync(join(scratch, "written-score/summary.md"), "utf8"), /\| confirm-delete \| ouro \| 100 \|/);
  });

  test("a type error loses exactly the typecheck points", async () => {
    const result = await run("type-error", (source) => source.replace("useState(false)", "useState<number>(false)"));
    assert.equal(result.checks.typecheck.pass, false);
    assert.match(result.checks.typecheck.output, /TS2345|TS2322|TS2769/);
    assert.equal(result.points.score, 100 - weights.typecheck);
  });

  test("an axe violation loses exactly the axe points of the configurations it shows in", async () => {
    const result = await run("axe-violation", (source) =>
      source.replace("<h1>Cookbooks</h1>", '<h1>Cookbooks</h1>\n      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="1" height="1" />'),
    );
    assert.deepEqual(
      result.axe.map((config) => config.violations.map((violation) => violation.id)),
      [["image-alt"], ["image-alt"], ["image-alt"], ["image-alt"]],
    );
    assert.equal(result.points.score, 100 - weights.axe);
  });

  test("a failing behavior loses exactly its share of the behavior points", async () => {
    const result = await run("behavior", (source) =>
      source.replace("cancel.current?.focus();", 'dialog.current?.querySelector<HTMLElement>(".destructive")?.focus();'),
    );
    assert.deepEqual(
      result.behavior.filter((check) => !check.pass).map((check) => check.id),
      ["focus-starts-on-cancel"],
    );
    assert.equal(result.points.score, 100 - weights.behavior / behaviorCount);
  });

  test("a lint error loses exactly the lint points", async () => {
    const result = await run("lint", (source) => source.replace("  useEffect(() => {\n    listCookbooks()", "  if (cookbooks?.length === -1) useEffect(() => {}, []);\n  useEffect(() => {\n    listCookbooks()"));
    assert.equal(result.checks.lint.pass, false);
    assert.match(result.checks.lint.output, /rules-of-hooks/);
    assert.equal(result.points.score, 100 - weights.lint);
  });

  test("a changed backend stand-in loses the axe and behavior points, with the reason", async () => {
    const result = await run("tampered", (source) => source.replace("sharedWith: 3", "sharedWith: 0"), "src/api/cookbooks.ts");
    assert.deepEqual(result.checks.fixtures.changed, ["src/api/cookbooks.ts"]);
    assert.equal(result.points.score, weights.typecheck + weights.lint);
  });
});

test("a list whose rows ignore touch loses exactly the two swipe checks", async () => {
  // Without touch-action, the browser takes the horizontal drag for itself, as on a real phone.
  const dir = fixture("no-swipe", "recipe-list", (css) => css.replace("  touch-action: pan-y;\n", ""), "src/index.css");
  const result = await score({ arm: "ouro", screen: "recipe-list", dir, out: join(scratch, "no-swipe-score") });
  assert.deepEqual(
    result.behavior.filter((check) => !check.pass).map((check) => check.id),
    ["swipe-reveals-actions", "swipe-delete"],
  );
  const { points: scored } = result;
  assert.equal(scored.behavior, (weights.behavior * (result.behavior.length - 2)) / result.behavior.length);
  assert.deepEqual([scored.typecheck, scored.lint, scored.axe], [weights.typecheck, weights.lint, weights.axe]);
});

test("the formula adds each part's share", () => {
  assert.deepEqual(points({ typecheck: true, lint: false, axe: [true, true, false, true], behavior: [true, false] }), {
    typecheck: 20,
    lint: 0,
    axe: 15,
    behavior: 25,
    score: 60,
    max: 100,
  });
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

test("the README gives the prompt as prompt.mts writes it", () => {
  const readme = readFileSync(join(here, "README.md"), "utf8");
  for (const arm of arms) {
    const [setup, ...shared] = prompt(arm, "app-shell", "<workspace>").split("# App shell")[0].trim().split("\n");
    assert.ok(readme.includes(`\`${arm}\`: \`${setup}\``), `the ${arm} setup line`);
    assert.ok(readme.includes(shared.join("\n").trim()), "the shared part of the prompt");
  }
});

test("no screen spec names a library or its components", () => {
  for (const screen of screens) {
    const text = readFileSync(join(here, "screens", screen, "task.md"), "utf8");
    assert.doesNotMatch(text, /ouro|shadcn|base ui|radix/i, screen);
    assert.doesNotMatch(text, /<[A-Z]\w+/, `${screen} names a component`);
  }
});

test("the results table lists every arm and screen, with the missing ones marked", () => {
  const dir = join(scratch, "table");
  const write = (arm, screen, score) => {
    mkdirSync(join(dir, arm, screen, "score"), { recursive: true });
    writeFileSync(
      join(dir, arm, screen, "score", "score.json"),
      JSON.stringify({ arm, screen, formulaVersion: 1, points: { typecheck: 20, lint: 10, axe: 20, behavior: score - 50, score, max: 100 } }),
    );
  };
  write("ouro", "app-shell", 100);
  write("shadcn", "app-shell", 62.5);
  write("ouro", "confirm-delete", 90);
  const table = resultsTable(dir);
  const lines = table.split("\n");
  assert.ok(lines.includes("| Screen | shadcn/ui | shadcn/ui with its skill | Ouro HX |"), table);
  assert.ok(lines.includes("| app-shell | 62.5 | not run | 100 |"), table);
  assert.ok(lines.includes("| confirm-delete | not run | not run | 90 |"), table);
  assert.ok(lines.includes("| settings-form | not run | not run | not run |"), table);
  assert.ok(lines.includes("| Mean of the screens run | 62.5 | not run | 95 |"), table);
});

test("the workflow scores committed output on demand and weekly, never on pull requests", () => {
  const workflow = readFileSync(join(root, ".github/workflows/agent-usability.yml"), "utf8");
  assert.match(workflow, /^on:\n {2}workflow_dispatch:/m);
  assert.match(workflow, /^ {2}schedule:\n {4}- cron: /m);
  assert.doesNotMatch(workflow, /^ {2}(pull_request|push):/m);
  assert.match(workflow, /scripts\/agent-usability\/score-runs\.mts/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
});

test("the arm script pins the shadcn CLI the install test verifies, the skills CLI and the skill's commit", () => {
  const create = readFileSync(join(here, "arms/create.sh"), "utf8");
  const install = readFileSync(join(root, "scripts/install-test.sh"), "utf8");
  const pin = /shadcn@(\d+\.\d+\.\d+)/;
  assert.equal(create.match(pin)?.[1], install.match(pin)?.[1]);
  assert.match(create, /skills@\d+\.\d+\.\d+/);
  assert.match(create, /SHADCN_SKILL_REF:-[0-9a-f]{40}\}/);
});
