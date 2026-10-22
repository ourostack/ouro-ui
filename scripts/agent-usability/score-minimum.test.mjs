import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { screens } from "./screens.mts";
import { scoreOf } from "./score-fixture.mjs";

// The scorer is proven on a known-good version of every screen (test/screens/<screen>.tsx,
// plain React on test/fixture-app), which must score full marks, and on copies that each break
// one thing: every copy must lose exactly that part's points and nothing else (score-fixture.mjs).

// Three at a time: a page with only a heading never gets ready, so each check waits out its readiness
// timeout, and the scorings spend most of their time waiting rather than building.
describe("a page that does only the minimum scores 0 on every screen", { concurrency: 3 }, () => {
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
