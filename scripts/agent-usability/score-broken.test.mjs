import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { weights } from "./formula.mts";
import { failed, near, root, run, scratch, share, violations } from "./score-fixture.mjs";

// The scorer is proven on a known-good version of every screen (test/screens/<screen>.tsx,
// plain React on test/fixture-app), which must score full marks, and on copies that each break
// one thing: every copy must lose exactly that part's points and nothing else (score-fixture.mjs).

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
