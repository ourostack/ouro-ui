import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The workflows publish the registry and push to the repository, so what they run must not
// change under them: every action is pinned to a commit, and only the release job keeps the
// checkout's token.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".github/workflows");
const workflows = readdirSync(dir)
  .filter((file) => file.endsWith(".yml"))
  .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));

test("every action is pinned to a full commit SHA, with its version in a comment", () => {
  assert.ok(workflows.length >= 4);
  const unpinned = workflows.flatMap(({ file, text }) =>
    text
      .split("\n")
      .filter((line) => /^\s*(- )?uses: /.test(line) && !/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line))
      .map((line) => `${file}: ${line.trim()}`),
  );
  assert.deepEqual(unpinned, [], "Pin with owner/repo@<40-character SHA> # vX.Y.Z.");
});

test("only release.yml, which pushes, keeps the checkout's credentials", () => {
  const problems = [];
  for (const { file, text } of workflows) {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!/uses: actions\/checkout@/.test(line)) return;
      const step = lines.slice(index + 1, index + 4).join("\n");
      const persists = !/^\s+persist-credentials: false$/m.test(step);
      if (persists !== (file === "release.yml")) problems.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(problems, [], "Set persist-credentials: false on every checkout that never pushes.");
});

test("Dependabot proposes new action pins weekly", () => {
  const config = readFileSync(join(root, ".github/dependabot.yml"), "utf8");
  assert.match(config, /package-ecosystem: github-actions\n\s+directory: \/\n\s+schedule:\n\s+interval: weekly/);
});

const scheduled = readFileSync(join(dir, "scheduled-install.yml"), "utf8");
const job = (name) => {
  const start = scheduled.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `scheduled-install.yml has no ${name} job`);
  const next = scheduled.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return scheduled.slice(start, next === -1 ? undefined : start + 1 + next);
};

test("Scheduled install fails when main's ouro.latestRelease is not GitHub's newest release", () => {
  const latest = job("latest");
  assert.match(latest, /gh api "repos\/\$REPO\/releases\/latest" --jq \.tag_name/);
  assert.match(latest, /\[ "\$newest" = "\$TAG" \] \|\| \{ echo "::error::/);
});

test("Scheduled install reports any failure in one issue, with issues: write on that job only", () => {
  const report = job("report");
  assert.match(report, /needs: \[refs, latest, install\]\n\s+if: failure\(\)/);
  assert.match(report, /permissions:\n\s+contents: read\n\s+issues: write/);
  assert.match(report, /run: scripts\/scheduled-failure\.sh /);
  assert.match(scheduled, /^permissions:\n {2}contents: read\njobs:/m);
});

test("scheduled-failure.sh opens the issue once, then comments on it", () => {
  const bin = mkdtempSync(join(tmpdir(), "ouro-gh-"));
  const log = join(bin, "calls.log");
  // A stand-in gh: logs its arguments, and answers `issue list` with $OPEN (the jq result).
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\nall="$*"\nprintf '%s\\n' "\${all//$'\\n'/ }" >> "${log}"\nif [ "$1 $2" = "issue list" ]; then printf '%s' "$OPEN"; fi\n`);
  chmodSync(join(bin, "gh"), 0o755);
  const run = (open) =>
    spawnSync("bash", [join(root, "scripts/scheduled-failure.sh"), "https://github.com/o/r/actions/runs/1"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPEN: open },
    });
  assert.equal(run("").status, 0);
  assert.equal(run("42").status, 0);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.match(calls[0], /^issue list --state open --search in:title "Scheduled install failed"/);
  assert.match(calls[1], /^issue create --title Scheduled install failed --body The weekly install of main and the newest release failed: https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  assert.match(calls[2], /^issue list /);
  assert.equal(calls[3], "issue comment 42 --body Failed again: https://github.com/o/r/actions/runs/1");
  assert.equal(calls.length, 4);
});

// v0.7.0 was out for two hours while the site's llms.txt and main's README still gave install
// commands for v0.6.0: main named the old release until a person merged the "Prepare main"
// pull request, and Pages then skipped three deploys in a row because main kept moving.

const workflow = (file) => workflows.find((entry) => entry.file === file).text;

test("Pages names GitHub's newest release before it builds, whatever main's package.json says", () => {
  const pages = workflow("pages.yml");
  const name = pages.indexOf('gh api "repos/$REPO/releases/latest" --jq .tag_name');
  const set = pages.indexOf('node scripts/latest-release.mjs set "$newest"');
  assert.ok(name > 0 && set > name, "pages.yml asks GitHub for the newest release and sets it");
  assert.ok(pages.indexOf("pnpm run docs", set) > set, "then regenerates the docs that name it");
  assert.ok(pages.indexOf("pnpm site:build") > set, "before the site builds");
  assert.ok(pages.indexOf("scripts/namespace.sh _site/r") > set, "and before the namespace builds");
});

test("Release merges the pull request that prepares main, then runs CI there, so main names the release", () => {
  const release = workflow("release.yml");
  assert.match(release, /gh run watch "\$run" --exit-status --interval 30 && gh pr merge "\$NEXT_BRANCH" --squash --delete-branch/);
  assert.match(release, /gh workflow run ci\.yml --ref main/);
  // The next release accepts that dispatched run: a merge made with the workflow's token starts no push run.
  assert.match(release, /select\(\.event == "push" or \.event == "workflow_dispatch"\)/);
});

test("Release deploys Pages itself and fails when the published llms.txt or README names another release", () => {
  const release = workflow("release.yml");
  const deploy = release.indexOf("gh workflow run pages.yml --ref main");
  const check = release.indexOf('node scripts/published-release.mjs "$TAG" --wait');
  assert.ok(deploy > release.indexOf('gh release create "$TAG"'), "Pages is deployed after the release is created");
  assert.ok(check > deploy, "and the published pages are checked last");
});

test("Scheduled install checks that the published llms.txt and README name the newest release", () => {
  assert.match(job("latest"), /node scripts\/published-release\.mjs "\$newest"/);
});
