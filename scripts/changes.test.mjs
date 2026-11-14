import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { HEADING, assemble, changesProblem, fragmentProblems, listed } from "./changes.mjs";
import { scratchDir } from "./scratch.mjs";

// changes/*.md hold one release's behaviour changes, one fragment per change, so parallel
// pull requests never edit the same file. release.yml assembles them into the notes' "Changes
// in this release" section, refuses to release when there are none, or when one is still in
// the last release's notes; fragments stay on main and each release skips the lines its predecessor printed.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
const script = join(root, "scripts/changes.mjs");

const NEXT = `${HEADING}\n`;
const changes = `${NEXT}\nRe-add your Ouro items.\n\n- Sheets stack at --ouro-layer.\n- ConfirmDialog resets on reopen.\n`;
/** A changes/ folder with these fragments. */
const fragments = (files) => {
  const dir = join(scratchDir("changes-"), "changes");
  mkdirSync(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
const lastNotes = "Install an item.\n\n### Changes in this release\n\n- Sheets stack at --ouro-layer.\n";

test("listed() returns the change lines and nothing else", () => {
  assert.deepEqual(listed(changes), ["- Sheets stack at --ouro-layer.", "- ConfirmDialog resets on reopen."]);
  assert.deepEqual(listed(NEXT), []);
  assert.deepEqual(listed(""), []);
});

test("the heading is the one the release notes turn into a section", () => {
  assert.equal(HEADING, "# Changes in this release");
});

test("assemble() lists every fragment's change lines under the heading, by file name", () => {
  const dir = fragments({ "sheet-layer.md": "- Sheets stack at --ouro-layer.\n", "a-confirm.md": "Context for reviewers.\n\n- ConfirmDialog resets on reopen.\n- And a second line.\n", "notes.txt": "- not a fragment\n" });
  assert.equal(assemble(dir), `${HEADING}\n\n- ConfirmDialog resets on reopen.\n- And a second line.\n- Sheets stack at --ouro-layer.\n`);
  assert.equal(assemble(join(dir, "missing")), NEXT);
  assert.equal(assemble(fragments({})), NEXT);
});

test("a file that lists no change is a problem, whether it is empty or only the heading", () => {
  for (const markdown of ["", NEXT, `${NEXT}\nRe-add your Ouro items.\n`]) {
    assert.match(changesProblem(markdown, ""), /lists no change/);
  }
});

test("fragments the last release already listed are not this release's: with none new, that is a problem", () => {
  assert.match(changesProblem(changes, lastNotes + "- ConfirmDialog resets on reopen.\n"), /lists no change that the last release's notes do not already hold/);
  assert.equal(changesProblem(changes, lastNotes), null);
  assert.equal(assemble(fragments({ "a.md": "- Sheets stack at --ouro-layer.\n", "b.md": "- New.\n" }), lastNotes), `${HEADING}\n\n- New.\n`);
});

test("new changes pass, with or without a last release", () => {
  assert.equal(changesProblem(changes, ""), null);
  assert.equal(changesProblem(`${NEXT}\n- Something new.\n`, lastNotes), null);
});

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("`check` exits 1 with a GitHub error for a problem, and 0 otherwise", () => {
  const notes = join(scratchDir("changes-"), "notes.md");
  writeFileSync(notes, lastNotes);

  let result = run("check", fragments({}), notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\/ lists no change/);

  result = run("check", fragments({ "layer.md": "- Sheets stack at --ouro-layer.\n" }), notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\/ lists no change that/);

  result = run("check", fragments({ "new.md": "- Something new.\n" }), notes);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("`assemble` prints the section the release notes show", () => {
  const result = run("assemble", fragments({ "new.md": "- Something new.\n" }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${HEADING}\n\n- Something new.\n`);
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

test("release.yml checks the changes against the last release before it pushes anything, and prints them in the notes", () => {
  const check = step("Check the changes");
  assert.ok(check.start < step("Push the release branch").start);
  assert.match(check.body, /gh release view .*--json body/);
  assert.match(check.body, /node scripts\/changes\.mjs check changes /);
  // The release commit, and so the tag, holds the assembled CHANGES.md; the notes print it.
  // (scripts/release-commit.sh writes the release commit's files.)
  assert.match(step("Push the release branch").body, /scripts\/release-commit\.sh "\$VERSION"\n\s*git add CHANGES\.md\n\s*git commit -am "Release \$TAG"/);
  assert.match(readFileSync(new URL("./release-commit.sh", import.meta.url), "utf8"), /\nnode scripts\/changes\.mjs assemble changes "\$notes" > CHANGES\.md\n/);
  assert.match(step("Tag and publish the release").body, /sed -e '1s\/\^# \/### \/' CHANGES\.md/);
  // Main keeps fragments only: no other step writes CHANGES.md.
  for (const name of ["Check the changes"]) assert.doesNotMatch(step(name).body, /CHANGES\.md/, name);
});

test("`check` fails on a fragment line that is not a top-level change, naming the file and line", () => {
  const notes = join(scratchDir("changes-"), "notes.md");
  writeFileSync(notes, "");
  const dir = fragments({ "ok.md": "- Fine.\n\n", "wrapped.md": "- Wrapped bullet that\n  continues here.\n  - sub item\n" });
  assert.deepEqual(fragmentProblems(dir), ["changes/wrapped.md:2:   continues here.", "changes/wrapped.md:3:   - sub item"]);
  const result = run("check", dir, notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::Each changes\/ fragment line is one change.*changes\/wrapped\.md:2: {3}continues here\./);
  assert.deepEqual(fragmentProblems(fragments({ "ok.md": "- Fine.\n" })), []);
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
