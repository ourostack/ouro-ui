// What the scorer's tests share (score*.test.mjs): a scratch folder and copies of the known-good
// app for a screen, each with one thing broken. The tests are split across files so CI's script test
// shards can run them side by side (scripts/shard.mjs); each file gets its own scratch folder.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";
import { checksFor } from "./checks/index.mts";
import { weights } from "./formula.mts";
import { score } from "./score.mts";
import { addScreenFiles } from "./workspace.mts";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "../..");
mkdirSync(join(root, ".tmp"), { recursive: true });
// Inside the repository, so the fixture resolves react, vite and typescript from its node_modules.
export const scratch = mkdtempSync(join(root, ".tmp", "agent-usability-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * A copy of the known-good app for a screen (test/screens/<screen>.tsx on test/fixture-app),
 * with one file changed by `edit` and the `extra` files added (path in the app: source).
 */
export function fixture(name, screen, edit, file = "src/App.tsx", extra = {}) {
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

export const scoreOf = (name, screen, edit, file, extra) => score({ arm: "ouro", screen, dir: fixture(name, screen, edit, file, extra), out: join(scratch, `${name}-score`) });
export const run = (name, edit, file) => scoreOf(name, "confirm-delete", edit, file);
export const failed = (result) => result.behavior.filter((check) => !check.pass).map((check) => check.id);
export const share = (screen, lost) => (weights.behavior * lost) / checksFor(screen).checks.length;
/** Equal but for the last bits of a division by seven. */
export const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
/** The violations of each configuration, in order: 390px light, 390px dark, 1280px light, 1280px dark. */
export const violations = (result) => result.axe.map((config) => [...new Set(config.violations.map((violation) => violation.id))]);

