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
  assert.match(problem, /Prepare main for the next release/);
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

test("release.yml opens the PR that prepares main after the release is published, and approves its held CI", () => {
  const reset = step("Prepare main for the next release");
  assert.ok(reset.start > step("Tag and publish the release").start);
  assert.match(reset.body, /git switch -c "\$NEXT_BRANCH" "\$MAIN_SHA"/);
  assert.match(reset.body, /node scripts\/changes\.mjs reset CHANGES\.md/);
  // The same PR makes the tag the newest release, and regenerates the docs that name it.
  assert.match(reset.body, /node scripts\/latest-release\.mjs set "\$TAG"\n\s*pnpm run docs\n\s*git commit -am "Prepare main for the next release"/);
  assert.match(reset.body, /gh pr create --base main --head "\$NEXT_BRANCH" --title "Prepare main for the next release"/);
  // The held pull_request CI run is approved so the ruleset's required checks report; when that fails,
  // CI is dispatched and the exact approve command goes to the job summary and the PR body.
  assert.match(reset.body, /--event pull_request/);
  assert.match(reset.body, /gh api -X POST "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$run\/approve"/);
  assert.match(reset.body, /else\n[\s\S]*gh workflow run ci\.yml --ref "\$NEXT_BRANCH"[\s\S]*GITHUB_STEP_SUMMARY[\s\S]*gh pr edit "\$NEXT_BRANCH" --body/);
  assert.match(release, /pull-requests: write/);
});

test("release.yml advises deleting a tag only when GitHub says its release was not found", () => {
  const check = step("Check the version, the tag and main's CI");
  const cleanup = step("Clean up after a failure");
  for (const body of [check.body, cleanup.body]) {
    assert.match(body, /out=\$\(gh release view "\$TAG" --json tagName 2>&1\)/);
    assert.match(body, /if grep -q 'release not found' <<<"\$out"; then\n\s*echo "::error::Tag \$TAG .*Delete the tag/);
    assert.match(body, /else\n\s*echo "::error::Could not check the release for \$TAG: \$out"/);
    assert.doesNotMatch(body, />\/dev\/null 2>&1; then\n\s*echo "::error::Tag/);
  }
});
