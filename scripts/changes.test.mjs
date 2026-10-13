import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HEADING, assemble, changesProblem, fragmentProblems, listed } from "./changes.mjs";

// changes/*.md hold one release's behaviour changes, one fragment per change, so parallel
// pull requests never edit the same file. release.yml assembles them into the notes' "Changes
// in this release" section, refuses to release when there are none, or when one is still in
// the last release's notes, and after a release opens a PR that deletes the fragments it used.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
const script = join(root, "scripts/changes.mjs");

const NEXT = `${HEADING}\n`;
const changes = `${NEXT}\nRe-add your Ouro items.\n\n- Sheets stack at --ouro-layer.\n- ConfirmDialog resets on reopen.\n`;
/** A changes/ folder with these fragments. */
const fragments = (files) => {
  const dir = join(mkdtempSync(join(tmpdir(), "changes-")), "changes");
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
  const notes = join(mkdtempSync(join(tmpdir(), "changes-")), "notes.md");
  writeFileSync(notes, lastNotes);

  let result = run("check", fragments({}), notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\/ lists no change/);

  result = run("check", fragments({ "layer.md": "- Sheets stack at --ouro-layer.\n", "new.md": "- Something new.\n" }), notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::changes\/ still lists/);

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
  assert.match(step("Push the release branch").body, /node scripts\/changes\.mjs assemble changes > CHANGES\.md\n\s*git add CHANGES\.md\n\s*git commit -am "Release \$TAG"/);
  assert.match(step("Tag and publish the release").body, /sed -e '1s\/\^# \/### \/' CHANGES\.md/);
  // Main keeps fragments only: no other step writes CHANGES.md.
  for (const name of ["Check the changes", "Prepare main for the next release"]) assert.doesNotMatch(step(name).body, /CHANGES\.md/, name);
});

test("`check` fails on a fragment line that is not a top-level change, naming the file and line", () => {
  const notes = join(mkdtempSync(join(tmpdir(), "changes-")), "notes.md");
  writeFileSync(notes, "");
  const dir = fragments({ "ok.md": "- Fine.\n\n", "wrapped.md": "- Wrapped bullet that\n  continues here.\n  - sub item\n" });
  assert.deepEqual(fragmentProblems(dir), ["changes/wrapped.md:2:   continues here.", "changes/wrapped.md:3:   - sub item"]);
  const result = run("check", dir, notes);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::Each changes\/ fragment line is one change.*changes\/wrapped\.md:2: {3}continues here\./);
  assert.deepEqual(fragmentProblems(fragments({ "ok.md": "- Fine.\n" })), []);
});

test("release.yml opens the PR that prepares main after the release is published, and approves its held CI", () => {
  const reset = step("Prepare main for the next release");
  assert.ok(reset.start > step("Tag and publish the release").start);
  assert.match(reset.body, /git switch -c "\$NEXT_BRANCH" "\$MAIN_SHA"/);
  // The fragments this release used, and only those: the branch starts at the released main commit.
  assert.match(reset.body, /git rm --quiet -- 'changes\/\*\.md'/);
  // The same PR makes the tag the newest release, and regenerates the docs that name it.
  assert.match(reset.body, /node scripts\/latest-release\.mjs set "\$TAG"\n\s*pnpm run docs\n\s*git commit -am "Prepare main for the next release"/);
  assert.match(reset.body, /gh pr create --base main --head "\$NEXT_BRANCH" --title "Prepare main for the next release"/);
  // The held pull_request CI run is approved so the ruleset's required checks report; when that fails,
  // CI is dispatched and the exact approve command goes to the job summary and the PR body.
  assert.match(reset.body, /--event pull_request/);
  assert.match(reset.body, /gh api -X POST "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$run\/approve"/);
  assert.match(reset.body, /else\n[\s\S]*GITHUB_STEP_SUMMARY[\s\S]*gh pr edit "\$NEXT_BRANCH" --body[\s\S]*gh workflow run ci\.yml --ref "\$NEXT_BRANCH" \|\| echo "::warning::/);
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

// Runs the approval part of "Prepare main for the next release" against a stand-in gh and git.
// MODE: ok (approve works), refuse (approve fails), flaky (the first `run list` fails, then works),
// nodispatch (approve fails and so does the dispatch), redci (approve works, the run fails),
// nomerge (approve works, the run passes, the merge is refused).
const runApproval = (mode) => {
  const body = step("Prepare main for the next release").body;
  const from = body.indexOf("          sha=$(git rev-parse HEAD)");
  assert.notEqual(from, -1);
  const script = body.slice(from).replace(/^ {10}/gm, "");
  const dir = mkdtempSync(join(tmpdir(), "ouro-approve-"));
  const log = join(dir, "calls.log");
  const summary = join(dir, "summary.md");
  writeFileSync(
    join(dir, "gh"),
    `#!/usr/bin/env bash
all="$*"; printf '%s\\n' "\${all//$'\\n'/ }" >> "${log}"
case "$1 $2" in
  "run list") if [ "$MODE" = flaky ] && [ ! -e "${dir}/once" ]; then : > "${dir}/once"; exit 1; fi; echo 77 ;;
  "api -X") [ "$MODE" = ok ] || [ "$MODE" = redci ] || [ "$MODE" = nomerge ] || exit 1 ;;
  "run watch") [ "$MODE" = redci ] && exit 1 ;;
  "pr merge") [ "$MODE" = nomerge ] && exit 1 ;;
  "pr view") echo "old body" ;;
  "workflow run") [ "$MODE" = nodispatch ] && exit 1 ;;
esac
exit 0
`,
  );
  writeFileSync(join(dir, "git"), "#!/usr/bin/env bash\necho abc123\n");
  chmodSync(join(dir, "gh"), 0o755);
  chmodSync(join(dir, "git"), 0o755);
  writeFileSync(summary, "");
  const result = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MODE: mode, POLL_SECONDS: "0", NEXT_BRANCH: "prepare/after-v1.2.3", GITHUB_REPOSITORY: "o/r", GITHUB_STEP_SUMMARY: summary },
  });
  return { result, calls: readFileSync(log, "utf8").trim().split("\n"), summary: readFileSync(summary, "utf8") };
};

test("the approval step approves the held run, merges the pull request when it passes and runs CI on main", () => {
  const { result, calls, summary } = runApproval("ok");
  assert.equal(result.status, 0, result.stderr);
  const at = (start) => calls.findIndex((c) => c.startsWith(start));
  assert.ok(at("api -X POST repos/o/r/actions/runs/77/approve") !== -1);
  assert.ok(at("run watch 77 --exit-status") > at("api -X POST"));
  assert.ok(at("pr merge prepare/after-v1.2.3 --squash --delete-branch") > at("run watch 77"));
  assert.ok(at("workflow run ci.yml --ref main") > at("pr merge"));
  assert.ok(!calls.some((c) => c.startsWith("pr edit")));
  assert.match(summary, /Approved CI run 77/);
  assert.match(summary, /Merged "Prepare main for the next release"/);
});

test("the approval step never merges a pull request whose CI failed, and says what a refused merge leaves", () => {
  for (const mode of ["redci", "nomerge"]) {
    const { result, calls } = runApproval(mode);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.some((c) => c.startsWith("pr merge")), mode === "nomerge");
    assert.ok(!calls.some((c) => c.startsWith("workflow run")), "no CI on main without a merge");
    assert.match(result.stdout, /::warning::Could not merge "Prepare main for the next release"\. Merge it by hand/);
  }
});

test("the approval step, when the approval is refused, leaves the command in the summary and the PR body, then dispatches", () => {
  const { result, calls, summary } = runApproval("refuse");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::warning::Could not approve the held CI run/);
  assert.match(summary, /gh api -X POST repos\/o\/r\/actions\/runs\/77\/approve/);
  const edit = calls.findIndex((c) => c.startsWith("pr edit prepare/after-v1.2.3 --body old body"));
  assert.notEqual(edit, -1);
  assert.match(calls[edit], /gh api -X POST repos\/o\/r\/actions\/runs\/77\/approve/);
  assert.ok(calls.findIndex((c) => c.startsWith("workflow run ci.yml --ref prepare/after-v1.2.3")) > edit);
});

test("the approval step survives a failed dispatch and a failed first poll", () => {
  const failed = runApproval("nodispatch");
  assert.equal(failed.result.status, 0, failed.result.stderr);
  assert.match(failed.result.stdout, /::warning::Could not dispatch CI/);
  assert.match(failed.summary, /approve/);
  const flaky = runApproval("flaky");
  assert.equal(flaky.result.status, 0, flaky.result.stderr);
  assert.equal(flaky.calls.filter((c) => c.startsWith("run list")).length, 2);
  assert.match(flaky.calls.join("\n"), /runs\/77\/approve/);
});

test("preparing main deletes the fragments the release used and keeps one added to main during the release", () => {
  // The step's own lines, from switching to the branch through `git rm`, run in a scratch repository.
  const body = step("Prepare main for the next release").body;
  const from = body.indexOf('          git switch -c "$NEXT_BRANCH" "$MAIN_SHA"');
  const to = body.indexOf("\n", body.indexOf("git rm "));
  assert.ok(from !== -1 && to > from);
  const lines = body.slice(from, to).replace(/^ {10}/gm, "");
  const repo = mkdtempSync(join(tmpdir(), "ouro-race-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  mkdirSync(join(repo, "changes"));
  writeFileSync(join(repo, "changes/a.md"), "- A.\n");
  writeFileSync(join(repo, "changes/b.md"), "- B.\n");
  writeFileSync(join(repo, "changes/.keep"), "");
  git("add", "-A");
  git("commit", "-qm", "released");
  const mainSha = git("rev-parse", "HEAD");
  // Main moves on during the release.
  writeFileSync(join(repo, "changes/late.md"), "- Late.\n");
  git("add", "-A");
  git("commit", "-qm", "late change");
  const result = spawnSync("bash", ["-eo", "pipefail", "-c", lines], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, NEXT_BRANCH: "prepare/after-v1.2.3", MAIN_SHA: mainSha },
  });
  assert.equal(result.status, 0, result.stderr);
  git("commit", "-qm", "Prepare main for the next release");
  git("switch", "-q", "main");
  git("merge", "-q", "--no-edit", "prepare/after-v1.2.3");
  assert.deepEqual(git("ls-files", "changes").split("\n"), ["changes/.keep", "changes/late.md"]);
  assert.equal(assemble(join(repo, "changes")), `${HEADING}\n\n- Late.\n`);
});
