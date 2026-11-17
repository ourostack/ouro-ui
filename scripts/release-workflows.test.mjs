import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxEnv } from "./sandbox.mjs";
import { scratchDir } from "./scratch.mjs";

// The workflow files a release pushes must already be main's tip's (ourostack/ouro-ui#1951): release.yml's guard
// before its push, and release-auto.yml's choice of the commit to release. Both run here as written, against a
// local bare repository as origin, with no network.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

/** Release auto's check of the workflow files, from its comment down to the release loop, which follows it. */
const autoCheck = () => {
  const text = readFileSync(join(root, ".github/workflows/release-auto.yml"), "utf8");
  const start = text.indexOf("          # The workflow files Release pushes");
  const end = text.indexOf("          for status in queued in_progress; do");
  assert.ok(start !== -1 && end > start, "release-auto.yml has no workflow-file check before the release loop");
  return text.slice(start, end).split("\n").map((line) => line.slice(10)).join("\n");
};

/** Git with a fixed identity for the commits the fixture makes; the release step sets its own. */
const git = (cwd, ...args) => execFileSync("git", ["-c", "safe.bareRepository=all", ...args], {
  cwd,
  encoding: "utf8",
  env: sandboxEnv({ GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" }),
}).trim();
const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};

/**
 * origin's main holds the released commit R and, after it, M, which changes app.txt and, when `mainWorkflowsMoved`,
 * the workflows too (ci.yml changed, lane.yml went, new.yml came). The work folder is the release checkout, detached
 * at R. Its release-commit.sh stand-in writes CHANGES.md; TOUCH_WORKFLOW makes it change ci.yml too, and MOVER makes
 * it push that clone's main first.
 */
function fixture({ mainWorkflowsMoved = false } = {}) {
  const dir = scratchDir("ouro-release-workflows-");
  const origin = join(dir, "origin.git");
  const work = join(dir, "work");
  const mover = join(dir, "mover");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "init", "-q", "-b", "main", work);
  git(work, "remote", "add", "origin", pathToFileURL(origin).href);
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

/** Runs Release auto's workflow-file check for `sha` in the work folder; it prints "proceeds" when it lets the release on. */
const runAutoCheck = (f, sha) => spawnSync("bash", ["-e", "-o", "pipefail", "-c", `sha=${sha}\n${autoCheck()}\necho proceeds`], {
  cwd: f.work,
  encoding: "utf8",
  env: sandboxEnv(),
});

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
  assert.doesNotMatch(result.stdout, /proceeds/);
});

test("release auto goes on with a commit whose workflows equal main's tip", () => {
  const f = fixture();
  const result = runAutoCheck(f, f.released);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "proceeds\n");
});
