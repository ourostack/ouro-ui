import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { NEXT, changesProblem, listed } from "./changes.mjs";

// CHANGES.md holds one release's behaviour changes. release.yml refuses to release when it
// lists none, or when it still lists the last release's, and after a release it opens a PR
// that starts the file again.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
const script = join(root, "scripts/changes.mjs");

const changes = `${NEXT}\nRe-add your Ouro items.\n\n- Sheets stack at --ouro-layer.\n- ConfirmDialog resets on reopen.\n`;
const lastNotes = "Install an item.\n\n### Changes in this release\n\n- Sheets stack at --ouro-layer.\n";

test("listed() returns the change lines and nothing else", () => {
  assert.deepEqual(listed(changes), ["- Sheets stack at --ouro-layer.", "- ConfirmDialog resets on reopen."]);
  assert.deepEqual(listed(NEXT), []);
  assert.deepEqual(listed(""), []);
});

test("the started file is the heading the release notes turn into a section", () => {
  assert.equal(NEXT, "# Changes in this release\n");
});

test("a file that lists no change is a problem, whether it is empty or only the heading", () => {
  for (const markdown of ["", NEXT, `${NEXT}\nRe-add your Ouro items.\n`]) {
    assert.match(changesProblem(markdown, ""), /lists no change/);
  }
});

test("a change the last release already listed is a problem that names it", () => {
  const problem = changesProblem(changes, lastNotes);
  assert.match(problem, /still lists the last release's changes/);
  assert.match(problem, /- Sheets stack at --ouro-layer\./);
  assert.match(problem, /Start CHANGES\.md for the next release/);
});

test("new changes pass, with or without a last release", () => {
  assert.equal(changesProblem(changes, ""), null);
  assert.equal(changesProblem(`${NEXT}\n- Something new.\n`, lastNotes), null);
});

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("`check` exits 1 with a GitHub error for a problem, and 0 otherwise", () => {
  const dir = mkdtempSync(join(tmpdir(), "changes-"));
  const file = join(dir, "CHANGES.md");
  const notes = join(dir, "notes.md");
  writeFileSync(notes, lastNotes);

  writeFileSync(file, NEXT);
  let result = run("check", file, notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::CHANGES\.md lists no change/);

  writeFileSync(file, changes);
  result = run("check", file, notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::CHANGES\.md still lists/);

  writeFileSync(file, `${NEXT}\n- Something new.\n`);
  result = run("check", file, notes);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("`reset` starts the file again", () => {
  const file = join(mkdtempSync(join(tmpdir(), "changes-")), "CHANGES.md");
  writeFileSync(file, changes);
  assert.equal(run("reset", file).status, 0);
  assert.equal(readFileSync(file, "utf8"), NEXT);
});

test("an unknown mode exits with the usage", () => {
  const result = run("nope");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: changes\.mjs/);
});

const step = (name) => {
  const start = release.indexOf(`name: ${name}`);
  assert.notEqual(start, -1, `release.yml has no "${name}" step`);
  const next = release.indexOf("\n      - ", start);
  return { start, body: release.slice(start, next === -1 ? undefined : next) };
};

test("release.yml checks CHANGES.md against the last release before it pushes anything", () => {
  const check = step("Check CHANGES.md");
  assert.ok(check.start < step("Push the release branch").start);
  assert.match(check.body, /gh release view .*--json body/);
  assert.match(check.body, /node scripts\/changes\.mjs check CHANGES\.md /);
});

test("release.yml opens the PR that starts CHANGES.md after the release is published, and runs CI on it", () => {
  const reset = step("Start CHANGES.md for the next release");
  assert.ok(reset.start > step("Tag and publish the release").start);
  assert.match(reset.body, /git switch -c "\$NEXT_BRANCH" "\$MAIN_SHA"/);
  assert.match(reset.body, /node scripts\/changes\.mjs reset CHANGES\.md/);
  assert.match(reset.body, /gh pr create --base main --head "\$NEXT_BRANCH" --title "Start CHANGES\.md for the next release"/);
  assert.match(reset.body, /gh workflow run ci\.yml --ref "\$NEXT_BRANCH"/);
  assert.match(release, /pull-requests: write/);
});
