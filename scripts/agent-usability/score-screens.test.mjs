import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { checksFor } from "./checks/index.mts";
import { withLibraryMenu } from "./preflight.mts";
import { screens } from "./screens.mts";
import { failed, here, near, scoreOf, share } from "./score-fixture.mjs";

// The scorer is proven on a known-good version of every screen (test/screens/<screen>.tsx,
// plain React on test/fixture-app), which must score full marks, and on copies that each break
// one thing: every copy must lose exactly that part's points and nothing else (score-fixture.mjs).

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
