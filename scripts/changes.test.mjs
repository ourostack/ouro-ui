import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { HEADING, assemble, changesProblem, fragmentProblems, listed, releasedAt } from "./changes.mjs";
import { scratchDir } from "./scratch.mjs";

// changes/*.md hold one release's behaviour changes, one fragment per change, so parallel
// pull requests never edit the same file. release.yml assembles them into the notes' "Changes
// in this release" section, refuses to release when there are none new, and leaves out the lines the
// fragments at the last release's tag held; fragments stay on main after the release that used them.

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
  assert.match(changesProblem(changes, lastNotes + "- ConfirmDialog resets on reopen.\n"), /lists no change that the last release did not already publish/);
  assert.equal(changesProblem(changes, lastNotes), null);
  assert.equal(assemble(fragments({ "a.md": "- Sheets stack at --ouro-layer.\n", "b.md": "- New.\n" }), lastNotes), `${HEADING}\n\n- New.\n`);
});

test("new changes pass, with or without a last release", () => {
  assert.equal(changesProblem(changes, ""), null);
  assert.equal(changesProblem(`${NEXT}\n- Something new.\n`, lastNotes), null);
});

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

/**
 * A repository whose changes/ folder goes through `steps` in order: each step's fragments are added (a
 * `null` text deletes the file), committed, and tagged when the step names a tag. Returns its folder.
 */
function history(steps) {
  const repo = scratchDir("changes-git-");
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  mkdirSync(join(repo, "changes"));
  for (const { files, tag } of steps) {
    for (const [name, text] of Object.entries(files)) {
      if (text === null) rmSync(join(repo, "changes", name));
      else writeFileSync(join(repo, "changes", name), text);
    }
    git("add", "--all");
    git("commit", "--quiet", "--allow-empty", "-m", tag ?? "work");
    if (tag) git("tag", tag);
  }
  return repo;
}
const runIn = (repo, ...args) => spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: "utf8" });

test("`check` exits 1 with a GitHub error for a problem, and 0 otherwise", () => {
  let result = run("check", fragments({}));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\/ lists no change/);

  const released = history([{ files: { "layer.md": "- Sheets stack at --ouro-layer.\n" }, tag: "v1.0.0" }]);
  result = runIn(released, "check", "changes", "--since", "v1.0.0");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\/ lists no change that/);

  result = runIn(history([{ files: { "layer.md": "- Sheets stack at --ouro-layer.\n" }, tag: "v1.0.0" }, { files: { "new.md": "- Something new.\n" } }]), "check", "changes", "--since", "v1.0.0");
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("a release lists only the fragment lines its predecessor's tag did not hold, so it never lists the one before that again", () => {
  // v1.0.1 published A and v1.0.2 published B; the next release, with C new, lists C alone. Leaving out
  // only v1.0.2's notes (B) listed A again: v1.3.160's notes were v1.3.158's (#1485).
  const repo = history([
    { files: { "a.md": "- A.\n" }, tag: "v1.0.1" },
    { files: { "b.md": "- B.\n" }, tag: "v1.0.2" },
    { files: { "c.md": "- C.\n" } },
  ]);
  let result = runIn(repo, "assemble", "changes", "--since", "v1.0.2");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${HEADING}\n\n- C.\n`);
  assert.deepEqual(releasedAt("v1.0.2", "changes", repo), ["- A.", "- B."]);
  // A fragment deleted after its release is still released; with nothing new, there is nothing to release.
  const quiet = history([{ files: { "a.md": "- A.\n", "b.md": "- B.\n" }, tag: "v1.0.2" }, { files: { "a.md": null } }]);
  result = runIn(quiet, "check", "changes", "--since", "v1.0.2");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\/ lists no change that the last release did not already publish/);
});

test("`--since` a tag the checkout lacks fails with the fetch that brings it", () => {
  const result = runIn(history([{ files: { "a.md": "- A.\n" } }]), "assemble", "changes", "--since", "v9.9.9");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\.mjs: v9\.9\.9 is not in this checkout\. Fetch it: git fetch --no-tags --depth=1 origin refs\/tags\/v9\.9\.9:refs\/tags\/v9\.9\.9$/m);
  assert.equal(run("assemble", "changes", "--since").status, 2);
  assert.equal(run("assemble", "changes", "v1.0.0").status, 2);
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
  assert.match(check.body, /last=\$\(gh release view --json tagName --jq \.tagName/);
  assert.match(check.body, /git fetch --quiet --no-tags --depth=1 origin "refs\/tags\/\$last:refs\/tags\/\$last"\n\s*node scripts\/changes\.mjs check changes --since "\$last"/);
  // The release commit, and so the tag, holds the assembled CHANGES.md; the notes print it.
  // (scripts/release-commit.sh writes the release commit's files.)
  assert.match(step("Push the release branch").body, /scripts\/release-commit\.sh "\$VERSION"\n\s*git add CHANGES\.md\n\s*git commit -am "Release \$TAG"/);
  assert.match(readFileSync(new URL("./release-commit.sh", import.meta.url), "utf8"), /\n {2}node scripts\/changes\.mjs assemble changes --since "\$last" > CHANGES\.md\n/);
  assert.match(step("Tag and publish the release").body, /sed -e '1s\/\^# \/### \/' CHANGES\.md/);
  // Main keeps fragments only: no other step writes CHANGES.md.
  for (const name of ["Check the changes"]) assert.doesNotMatch(step(name).body, /CHANGES\.md/, name);
});

test("`check` fails on a fragment line that is not a top-level change, naming the file and line", () => {
  const dir = fragments({ "ok.md": "- Fine.\n\n", "wrapped.md": "- Wrapped bullet that\n  continues here.\n  - sub item\n" });
  assert.deepEqual(fragmentProblems(dir), ["changes/wrapped.md:2:   continues here.", "changes/wrapped.md:3:   - sub item"]);
  const result = run("check", dir);
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
