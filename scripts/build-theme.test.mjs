import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/build-theme.mts");
const run = (...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8" });

test("the committed src/generated/theme.css is up to date", () => {
  const result = run("--check");
  assert.equal(result.status, 0, result.stderr);
});

test("--check fails on a stale or missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-theme-"));
  const file = join(dir, "theme.css");
  const missing = run("--check", "--out", file);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /stale/);
  writeFileSync(file, "/* old */\n");
  assert.equal(run("--check", "--out", file).status, 1);
});

test("generating writes a file that then passes --check and matches the committed one", () => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-theme-"));
  const file = join(dir, "nested", "theme.css");
  assert.equal(run("--out", file).status, 0);
  assert.equal(run("--check", "--out", file).status, 0);
  assert.equal(readFileSync(file, "utf8"), readFileSync(join(root, "src/generated/theme.css"), "utf8"));
});
