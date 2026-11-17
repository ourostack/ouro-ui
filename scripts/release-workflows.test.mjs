import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxEnv } from "./sandbox.mjs";
import { scratchDir } from "./scratch.mjs";

// The workflow files a release pushes must already be main's tip's (ourostack/ouro-ui#1951): release.yml's guard
// before its push, and release-auto.yml's choice of the commit to release and its waits. Both run here as written,
// against a local bare repository as origin, with no network and a stand-in gh.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dedent = (block) => block.split("\n").map((line) => line.slice(10)).join("\n");

/** A run block of a step in a workflow, as GitHub reads it (the step's ten-space indent removed). */
const stepRun = (file, name) => {
  const text = readFileSync(join(root, ".github/workflows", file), "utf8");
  const start = text.indexOf(`name: ${name}\n`);
  assert.notEqual(start, -1, `${file} has no ${name} step`);
  const step = text.slice(start).split("\n      - ")[0];
  const lines = step.split("        run: |\n")[1].split("\n");
  const end = lines.findIndex((line) => line !== "" && !line.startsWith(" ".repeat(10)));
  return lines.slice(0, end === -1 ? undefined : end).map((line) => line.slice(10)).join("\n");
};

/** Release auto's wait_for function, then its check of the workflow files, as the step runs them. */
const autoCheck = () => {
  const text = readFileSync(join(root, ".github/workflows/release-auto.yml"), "utf8");
  const fnStart = text.indexOf("          wait_for() {\n");
  const fnEnd = text.indexOf("\n          }\n", fnStart);
  const start = text.indexOf("          # The workflow files Release pushes");
  const end = text.indexOf("          for status in queued in_progress; do");
  assert.ok(fnStart !== -1 && fnEnd > fnStart && start > fnEnd && end > start, "release-auto.yml has no wait_for and workflow-file check before the release loop");
  return `${dedent(text.slice(fnStart, fnEnd + "\n          }".length))}\n${dedent(text.slice(start, end))}`;
};

/** Git with a fixed identity; `at` (Unix seconds) dates the commits the fixture makes. */
const git = (cwd, ...args) => execFileSync("git", ["-c", "safe.bareRepository=all", ...args], {
  cwd,
  encoding: "utf8",
  env: sandboxEnv({ GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" }),
}).trim();
const gitAt = (cwd, at, ...args) => execFileSync("git", ["-c", "safe.bareRepository=all", ...args], {
  cwd,
  encoding: "utf8",
  env: sandboxEnv({ GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com", GIT_AUTHOR_DATE: `@${at} +0000`, GIT_COMMITTER_DATE: `@${at} +0000` }),
}).trim();
const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};

/** A bare origin and a work folder with its remote; the work folder is not yet on any commit. */
function repos() {
  const dir = scratchDir("ouro-release-workflows-");
  const origin = join(dir, "origin.git");
  const work = join(dir, "work");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "init", "-q", "-b", "main", work);
  git(work, "remote", "add", "origin", pathToFileURL(origin).href);
  return { dir, origin, work };
}

/**
 * origin's main holds the released commit R and, after it, M, which changes app.txt and, when `mainWorkflowsMoved`,
 * the workflows too (ci.yml changed, lane.yml went, new.yml came). The work folder is the release checkout, detached
 * at R. Its release-commit.sh stand-in writes CHANGES.md; TOUCH_WORKFLOW makes it change ci.yml too, and MOVER makes
 * it push that clone's main first.
 */
function fixture({ mainWorkflowsMoved = false } = {}) {
  const { dir, origin, work } = repos();
  const mover = join(dir, "mover");
  write(work, ".github/workflows/ci.yml", "ci: released\n");
  write(work, ".github/workflows/lane.yml", "lane: released\n");
  write(work, "app.txt", "released content\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "released");
  const released = git(work, "rev-parse", "HEAD");
  write(work, "app.txt", "main content\n");
  if (mainWorkflowsMoved) {
    write(work, ".github/workflows/ci.yml", "ci: main\n");
    rmSync(join(work, ".github/workflows/lane.yml"));
    write(work, ".github/workflows/new.yml", "new: main\n");
  }
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "main moves on");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "--detach", released);
  write(work, "scripts/release-commit.sh", '#!/usr/bin/env bash\nprintf "released %s\\n" "$1" > CHANGES.md\nif [ -n "${TOUCH_WORKFLOW:-}" ]; then printf "touched\\n" > .github/workflows/ci.yml; fi\nif [ -n "${MOVER:-}" ]; then git -C "$MOVER" push -q origin main; fi\n');
  chmodSync(join(work, "scripts/release-commit.sh"), 0o755);
  git(dir, "clone", "-q", pathToFileURL(origin).href, mover);
  return { dir, origin, work, mover, released };
}

/**
 * A release v1.0.0 whose release commit sits on R0, and main past R0: optionally a pin-only commit `pinAgeMinutes` ago,
 * then a commit `ageMinutes` ago that changes the workflows and brings a change fragment. Release auto's wait for R0 is
 * then a wait for main's workflows, and the pending change has waited `ageMinutes`.
 */
function ageFixture({ ageMinutes, pinAgeMinutes }) {
  const { dir, origin, work } = repos();
  const now = Math.floor(Date.now() / 1000);
  write(work, ".github/workflows/ci.yml", "ci: released\n");
  write(work, "app.txt", "released content\n");
  git(work, "add", "-A");
  gitAt(work, now - 3 * 3600, "commit", "-q", "-m", "released");
  const released = git(work, "rev-parse", "HEAD");
  git(work, "checkout", "-q", "-b", "release");
  write(work, "CHANGES.md", "released 1.0.0\n");
  git(work, "add", "-A");
  gitAt(work, now - 3 * 3600, "commit", "-q", "-m", "Release v1.0.0");
  git(work, "tag", "v1.0.0");
  git(work, "checkout", "-q", "main");
  if (pinAgeMinutes !== undefined) {
    write(work, "README.md", "Install #v1.0.0.\n");
    git(work, "add", "-A");
    gitAt(work, now - pinAgeMinutes * 60, "commit", "-q", "-m", "Point the docs at a release");
  }
  write(work, ".github/workflows/ci.yml", "ci: main\n");
  write(work, "changes/fresh.md", "- New: a change\n");
  git(work, "add", "-A");
  gitAt(work, now - ageMinutes * 60, "commit", "-q", "-m", "main changes its workflows");
  git(work, "push", "-q", "origin", "main", "refs/tags/v1.0.0");
  git(work, "checkout", "-q", "--detach", released);
  return { dir, origin, work, released };
}

/** Runs release.yml's push step in the work folder, as the release job does, with MAIN_SHA set as the check step sets it. */
function runPush(f, extra = {}) {
  const summary = join(f.dir, "summary.md");
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", stepRun("release.yml", "Push the release branch")], {
    cwd: f.work,
    encoding: "utf8",
    env: sandboxEnv({ BRANCH: "release/v9.9.9", VERSION: "9.9.9", TAG: "v9.9.9", MAIN_SHA: f.released, GITHUB_STEP_SUMMARY: summary, ...extra }),
  });
  return { ...result, summary: () => readFileSync(summary, "utf8") };
}

/**
 * Runs Release auto's wait_for and workflow-file check for `sha` in the work folder, with `last` as the newest release's
 * tag. It prints "proceeds" when it lets the release on. The release's scripts are copied in, and `bin` holds a stand-in
 * gh that logs its calls to bin/calls.log.
 */
function runAutoCheck(f, sha, { last = "", bin } = {}) {
  for (const script of ["scheduled-failure.sh", "release-wait.mjs", "changes.mjs"]) {
    mkdirSync(join(f.work, "scripts"), { recursive: true });
    copyFileSync(join(root, "scripts", script), join(f.work, "scripts", script));
    chmodSync(join(f.work, "scripts", script), 0o755);
  }
  const summary = join(f.dir, "summary.md");
  rmSync(summary, { force: true });
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `sha=${sha}\nlast='${last}'\n${autoCheck()}\necho proceeds`], {
    cwd: f.work,
    encoding: "utf8",
    env: sandboxEnv({
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "ourostack/ouro-ui",
      GITHUB_RUN_ID: "42",
      GH_REPO: "ourostack/ouro-ui",
    }, bin ? [bin] : []),
  });
  return { ...result, summary: () => (existsSync(summary) ? readFileSync(summary, "utf8") : "") };
}

/** A stand-in gh: logs each call, and answers `issue list` with nothing, so the issue is opened. */
function stubGh() {
  const bin = scratchDir("ouro-release-wait-bin-");
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\necho "$*" >> "${join(bin, "calls.log")}"\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return bin;
}

/** Whether origin has the release branch. */
const branchPushed = (f) => spawnSync("git", ["-c", "safe.bareRepository=all", "-C", f.origin, "rev-parse", "--verify", "-q", "refs/heads/release/v9.9.9"], { encoding: "utf8" }).status === 0;

test("a release branch pushes the released commit with workflows that equal main's, and its own content", () => {
  const f = fixture();
  const result = runPush(f);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const branch = "refs/heads/release/v9.9.9";
  assert.equal(git(f.origin, "rev-parse", `${branch}^`), f.released);
  assert.equal(git(f.origin, "rev-parse", `${branch}:.github/workflows`), git(f.origin, "rev-parse", "main:.github/workflows"));
  assert.equal(git(f.origin, "show", `${branch}:app.txt`), "released content");
  assert.equal(git(f.origin, "show", `${branch}:CHANGES.md`), "released 9.9.9");
});

test("a release commit that changes a workflow file pushes nothing", () => {
  const f = fixture();
  const result = runPush(f, { TOUCH_WORKFLOW: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::The workflow files of \S+ and the release commit do not match main's: \.github\/workflows\/ci\.yml\. GitHub/m);
  assert.match(result.summary(), /^The release commit changes these workflow files, which release-commit\.sh must never do:\n- \.github\/workflows\/ci\.yml$/m);
  assert.equal(branchPushed(f), false);
});

test("a release of a commit whose workflows main has moved past pushes nothing", () => {
  const f = fixture({ mainWorkflowsMoved: true });
  const result = runPush(f);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::.* main's: \.github\/workflows\/ci\.yml \.github\/workflows\/lane\.yml \.github\/workflows\/new\.yml\. GitHub/m);
  assert.match(result.stdout, /GitHub refuses a push by this token that adds or changes workflow content no branch holds \(ourostack\/ouro-ui#1951\)/);
  assert.match(result.summary(), /^- \.github\/workflows\/new\.yml$/m);
  assert.equal(branchPushed(f), false);
});

test("a workflow change main makes while the release commit is made stops the push", () => {
  const f = fixture();
  write(f.mover, ".github/workflows/ci.yml", "ci: moved\n");
  git(f.mover, "commit", "-q", "-am", "main moves its workflows again");
  const result = runPush(f, { MOVER: f.mover });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::.* main's: \.github\/workflows\/ci\.yml\. GitHub/m);
  assert.equal(branchPushed(f), false);
});

test("release auto waits for a commit whose workflows main has moved past", () => {
  const f = fixture({ mainWorkflowsMoved: true });
  const result = runAutoCheck(f, f.released);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`::notice::main's .github/workflows changed after ${f.released}, so the release waits`), result.stdout);
  assert.match(result.summary(), /^- main's \.github\/workflows changed after \S+, so the release waits/m);
  assert.doesNotMatch(result.stdout, /proceeds/);
});

test("release auto goes on with a commit whose workflows equal main's tip", () => {
  const f = fixture();
  const result = runAutoCheck(f, f.released);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "proceeds\n");
});

test("a wait under an hour says why in the step summary, and opens no issue", () => {
  const f = ageFixture({ ageMinutes: 30 });
  const bin = stubGh();
  const result = runAutoCheck(f, f.released, { last: "v1.0.0", bin });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.summary(), /^- main's \.github\/workflows changed after \S+, so the release waits/m);
  assert.equal(existsSync(join(bin, "calls.log")), false);
});

test("a wait runs from the pending change, not from a pin-only commit that came before it", () => {
  const f = ageFixture({ ageMinutes: 10, pinAgeMinutes: 120 });
  const bin = stubGh();
  const result = runAutoCheck(f, f.released, { last: "v1.0.0", bin });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.summary(), /^- main's \.github\/workflows changed after \S+, so the release waits/m);
  assert.equal(existsSync(join(bin, "calls.log")), false);
});

test("a release that has waited over an hour opens the Release waiting issue and fails release auto", () => {
  const f = ageFixture({ ageMinutes: 120 });
  const bin = stubGh();
  const result = runAutoCheck(f, f.released, { last: "v1.0.0", bin });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^::error::main's \.github\/workflows changed after \S+, so the release waits .* has waited 120 minutes, over an hour\. Release waiting: https:\/\/github\.com\/ourostack\/ouro-ui\/actions\/runs\/42$/m);
  assert.match(result.summary(), /has waited 120 minutes, over an hour/);
  const calls = readFileSync(join(bin, "calls.log"), "utf8");
  assert.match(calls, /^issue create --title Release waiting --body .*has waited 120 minutes, over an hour/m);
  assert.doesNotMatch(calls, /proceeds/);
});
