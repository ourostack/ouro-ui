import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { checksFor } from "./checks/index.mts";
import { median, points, weights } from "./formula.mts";
import { withLibraryMenu } from "./preflight.mts";
import { arms, prompt } from "./prompt.mts";
import { acceptanceItems, screens } from "./screens.mts";
import { score } from "./score.mts";
import { newFindings } from "./static.mts";
import { resultsTable } from "./table.mts";
import { addScreenFiles, armManifest, armRecordPath, changedConfig, collect, configHashes, createWorkspace } from "./workspace.mts";

// The scorer is proven on a known-good version of every screen (test/screens/<screen>.tsx,
// plain React on test/fixture-app), which must score full marks, and on copies that each break
// one thing: every copy must lose exactly that part's points and nothing else.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
mkdirSync(join(root, ".tmp"), { recursive: true });
// Inside the repository, so the fixture resolves react, vite and typescript from its node_modules.
const scratch = mkdtempSync(join(root, ".tmp", "agent-usability-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * A copy of the known-good app for a screen (test/screens/<screen>.tsx on test/fixture-app),
 * with one file changed by `edit` and the `extra` files added (path in the app: source).
 */
function fixture(name, screen, edit, file = "src/App.tsx", extra = {}) {
  const dir = join(scratch, name);
  cpSync(join(here, "test/fixture-app"), dir, { recursive: true });
  cpSync(join(here, "test/screens", `${screen}.tsx`), join(dir, "src/App.tsx"));
  for (const [path, source] of Object.entries(extra)) writeFileSync(join(dir, path), source);
  addScreenFiles(dir, screen);
  if (!edit) return dir;
  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  assert.notEqual(edit(before), before, `${name}: the edit changed nothing`);
  writeFileSync(path, edit(before));
  return dir;
}

const scoreOf = (name, screen, edit, file, extra) => score({ arm: "ouro", screen, dir: fixture(name, screen, edit, file, extra), out: join(scratch, `${name}-score`) });
const run = (name, edit, file) => scoreOf(name, "confirm-delete", edit, file);
const failed = (result) => result.behavior.filter((check) => !check.pass).map((check) => check.id);
const share = (screen, lost) => (weights.behavior * lost) / checksFor(screen).checks.length;
/** Equal but for the last bits of a division by seven. */
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
/** The violations of each configuration, in order: 390px light, 390px dark, 1280px light, 1280px dark. */
const violations = (result) => result.axe.map((config) => [...new Set(config.violations.map((violation) => violation.id))]);

describe("a known-good screen scores full marks", { concurrency: 2 }, () => {
  for (const screen of screens) {
    test(`${screen}: 100`, async () => {
      const result = await scoreOf(screen, screen);
      const errors = result.behavior.filter((check) => !check.pass).map((check) => `${check.id}: ${check.error}`);
      assert.deepEqual(result.failures, [], [...result.failures, ...errors].join("\n"));
      assert.equal(result.points.score, 100);
      assert.deepEqual(result.axe.map((config) => `${config.width} ${config.theme}`), ["390 light", "390 dark", "1280 light", "1280 dark"]);
      assert.ok(result.screenshots.length >= 4);
      assert.deepEqual(result.behavior.map((check) => check.id), checksFor(screen).checks.map((check) => check.id));
    });
  }

  test("recipe-list with a library menu, which renders in a portal outside every landmark: 100", async () => {
    // Base UI's Menu, as shadcn/ui's menu wraps it and as an app without a menu component uses it.
    const result = await scoreOf(
      "portal-menu",
      "recipe-list",
      withLibraryMenu,
      "src/App.tsx",
      { "src/ActionsMenu.tsx": readFileSync(join(here, "test/screens/actions-menu.base-ui.tsx"), "utf8") },
    );
    assert.deepEqual(result.failures, []);
    assert.equal(result.points.score, 100);
    // axe-core's best-practice `region` rule fires on the portal. It is listed and costs nothing.
    const advisories = result.axe.map((config) => [...new Set(config.advisories.filter((advisory) => advisory.state === "actions-menu-open").map((advisory) => advisory.id))]);
    assert.deepEqual(advisories, [["region"], ["region"], ["region"], ["region"]]);
  });

  test("recipe-list with a broken menu in a portal still loses the axe points", async () => {
    const result = await scoreOf("broken-portal-menu", "recipe-list", withLibraryMenu, "src/App.tsx", {
      "src/ActionsMenu.tsx": readFileSync(join(here, "test/screens/actions-menu.broken-portal.tsx"), "utf8"),
    });
    for (const config of result.axe) {
      assert.ok(config.states.every((state) => state.reached), JSON.stringify(config.states));
      assert.ok(config.violations.some((violation) => violation.id === "aria-required-children" && violation.state === "actions-menu-open"), JSON.stringify(config.violations));
    }
    assert.equal(result.points.axe, 0);
  });
});

describe("a broken copy of the confirm-delete screen loses exactly the expected points", { concurrency: 2 }, () => {
  test("the score is written as JSON and as a markdown summary", async () => {
    const result = await run("written", (source) => `${source}\n`);
    assert.equal(result.points.score, 100);
    const written = JSON.parse(readFileSync(join(scratch, "written-score/score.json"), "utf8"));
    assert.deepEqual(written.points, { typecheck: 20, lint: 10, axe: 20, behavior: 50, score: 100, max: 100 });
    assert.equal(written.formulaVersion, 4);
    assert.match(written.versions.axeCore, /^\d+\.\d+\.\d+/);
    assert.match(written.versions.chromium, /^\d+\./);
    if (existsSync(join(root, ".git"))) assert.match(written.versions.harness, /^[0-9a-f]{40}$/);
    const summary = readFileSync(join(scratch, "written-score/summary.md"), "utf8");
    assert.match(summary, /\| confirm-delete \| ouro \| 100 \|/);
    assert.match(summary, /Screenshots, as evidence only/);
  });

  test("a type error loses exactly the typecheck points", async () => {
    const result = await run("type-error", (source) => source.replace("useState(false)", "useState<number>(false)"));
    assert.equal(result.checks.typecheck.pass, false);
    assert.match(result.checks.typecheck.new[0].rule, /TS2345|TS2322|TS2769/);
    assert.equal(result.checks.typecheck.new[0].file, "src/App.tsx");
    assert.equal(result.points.score, 100 - weights.typecheck);
  });

  test("an axe violation in every configuration loses all the axe points", async () => {
    const result = await run("axe-violation", (source) =>
      source.replace("<h1>Cookbooks</h1>", '<h1>Cookbooks</h1>\n      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="1" height="1" />'),
    );
    assert.deepEqual(violations(result), [["image-alt"], ["image-alt"], ["image-alt"], ["image-alt"]]);
    assert.equal(result.points.score, 100 - weights.axe);
  });

  test("a contrast failure only in dark mode loses exactly the two dark configurations' points", async () => {
    const result = await run("dark-contrast", (css) => `${css}\n.dark h1 {\n  color: #1f2937;\n}\n`, "src/index.css");
    assert.deepEqual(violations(result), [[], ["color-contrast"], [], ["color-contrast"]]);
    assert.equal(result.points.axe, weights.axe / 2);
    assert.equal(result.points.score, 100 - weights.axe / 2);
  });

  test("a state that can't be reached loses the axe points, and the checks that need it fail", async () => {
    const result = await run("no-dialog", (source) => source.replace("dialog.current?.showModal();", ""));
    for (const config of result.axe) assert.deepEqual(config.states.map((state) => [state.name, state.reached]), [["initial", true], ["dialog-open", false]]);
    assert.equal(result.points.axe, 0);
    // Only the sideways-scroll check passes, which a near-empty page passes too, so nothing is earned.
    assert.deepEqual(result.behavior.filter((check) => check.pass).map((check) => check.id), ["fits-a-phone"]);
    assert.equal(result.points.score, 0);
  });

  test("a failing behavior loses exactly its share of the behavior points", async () => {
    const result = await run("behavior", (source) =>
      source.replace("cancel.current?.focus();", 'dialog.current?.querySelector<HTMLElement>(".destructive")?.focus();'),
    );
    assert.deepEqual(failed(result), ["focus-starts-on-cancel"]);
    near(result.points.score, 100 - share("confirm-delete", 1));
  });

  test("a lint error loses exactly the lint points", async () => {
    const result = await run("lint", (source) => source.replace("  useEffect(() => {\n    listCookbooks()", "  if (cookbooks?.length === -1) useEffect(() => {}, []);\n  useEffect(() => {\n    listCookbooks()"));
    assert.equal(result.checks.lint.pass, false);
    assert.match(result.checks.lint.new[0].rule, /rules-of-hooks/);
    assert.equal(result.points.score, 100 - weights.lint);
  });

  test("a lint warning costs nothing", async () => {
    const result = await run("lint-warning", (source) => `${source}\nexport function notAComponent() {\n  return 1;\n}\n`);
    assert.equal(result.checks.lint.pass, true);
    assert.equal(result.points.score, 100);
  });

  test("a changed backend stand-in scores 0, with the reason", async () => {
    const result = await run("tampered", (source) => source.replace("sharedWith: 3", "sharedWith: 0"), "src/api/cookbooks.ts");
    assert.deepEqual(result.checks.fixtures.changed, ["src/api/cookbooks.ts"]);
    assert.equal(result.points.score, 0);
    assert.match(result.failures.join("\n"), /backend stand-in: the agent changed src\/api\/cookbooks\.ts/);
  });

  test("an app that does not build scores 0, with the reason", async () => {
    const result = await run("no-build", (source) => `import "./missing.css";\n${source}`);
    assert.equal(result.checks.build.pass, false);
    assert.equal(result.points.score, 0);
    assert.match(result.failures.join("\n"), /build: vite build failed/);
    assert.deepEqual(result.screenshots, []);
  });

  test("a screen that does nothing scores 0, however clean its code is", async () => {
    const result = await run("nothing", () => "export function App() {\n  return <main>The screen goes here.</main>;\n}\n");
    assert.equal(result.checks.typecheck.pass, true);
    assert.equal(result.checks.lint.pass, true);
    assert.deepEqual(result.points, { typecheck: 0, lint: 0, axe: 0, behavior: 0, score: 0, max: 100 });
    assert.match(result.failures.join("\n"), /nothing works/);
  });
});

describe("one broken copy of every other screen loses exactly the checks it breaks", { concurrency: 2 }, () => {
  test("recipe-list: rows that ignore touch lose the two swipe checks", async () => {
    // Without touch-action, the browser takes the horizontal drag for itself, as on a real phone.
    const result = await scoreOf("no-swipe", "recipe-list", (css) => css.replace("  touch-action: pan-y;\n", ""), "src/index.css");
    assert.deepEqual(failed(result), ["swipe-reveals-actions", "swipe-delete"]);
    near(result.points.score, 100 - share("recipe-list", 2));
  });

  test("settings-form: a saved message outside a live region loses the announcement check", async () => {
    const result = await scoreOf("not-announced", "settings-form", (source) => source.replace('<p role="status">{status}</p>', "<p>{status}</p>"));
    assert.deepEqual(failed(result), ["announces-saved"]);
    near(result.points.score, 100 - share("settings-form", 1));
  });

  test("command-palette: a filter that minds case loses the two checks that type in another case", async () => {
    const result = await scoreOf("case-filter", "command-palette", (source) => source.replace("command.label.toLowerCase().includes(query.toLowerCase())", "command.label.includes(query)"));
    assert.deepEqual(failed(result), ["filters-by-label", "arrows-and-enter-run"]);
    near(result.points.score, 100 - share("command-palette", 2));
  });

  test("app-shell: a page name that is not the level 1 heading loses the checks that read it", async () => {
    const result = await scoreOf("no-h1", "app-shell", (source) => source.replace("<h1>{current.name}</h1>", "<h2>{current.name}</h2>"));
    assert.deepEqual(failed(result), ["desktop-navigation", "links-mark-current-page", "phone-menu"]);
    // axe-core's heading rules are best-practice ones, so they cost nothing.
    near(result.points.score, 100 - share("app-shell", 3));
  });
});

describe("a page that does only the minimum scores 0 on every screen", { concurrency: 2 }, () => {
  const headings = { "settings-form": "Account settings", "recipe-list": "My recipes", "command-palette": "Kitchen", "confirm-delete": "Cookbooks", "app-shell": "Home" };
  for (const screen of screens) {
    test(screen, async () => {
      const result = await scoreOf(`heading-only-${screen}`, screen, () => `export function App() {\n  return (\n    <main>\n      <h1>${headings[screen]}</h1>\n    </main>\n  );\n}\n`);
      assert.equal(result.checks.typecheck.pass, true);
      assert.equal(result.checks.lint.pass, true);
      assert.deepEqual(result.points, { typecheck: 0, lint: 0, axe: 0, behavior: 0, score: 0, max: 100 });
    });
  }

  test("app-shell with a heading and a skip link", async () => {
    const page = '<a href="#main" onClick={(event) => {\n        event.preventDefault();\n        document.getElementById("main")?.focus();\n      }}>\n        Skip to content\n      </a>\n      <main id="main" tabIndex={-1}>\n        <h1>Home</h1>\n      </main>';
    const result = await scoreOf("skip-link-only", "app-shell", () => `export function App() {\n  return (\n    <>\n      ${page}\n    </>\n  );\n}\n`);
    assert.deepEqual(result.behavior.filter((check) => check.pass).map((check) => check.id).sort(), ["fits-a-phone", "skip-link"]);
    assert.deepEqual(result.points, { typecheck: 0, lint: 0, axe: 0, behavior: 0, score: 0, max: 100 });
  });
});

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
