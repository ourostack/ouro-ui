import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { runInNewContext } from "node:vm";
import { scratchDir } from "./scratch.mjs";

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

for (const [event, ref, expected] of [
  ["push", "refs/heads/main", true],
  ["workflow_dispatch", "refs/heads/main", true],
  ["pull_request", "refs/heads/main", false],
  ["pull_request", "refs/pull/99/merge", false],
  ["push", "refs/heads/feature", false],
  ["workflow_dispatch", "refs/heads/release/v1.0.0", false],
  ["workflow_dispatch", "refs/heads/prepare/after-v1.0.0", false],
  ["workflow_dispatch", "refs/tags/v1.0.0", false],
  ["push", "refs/tags/v1.0.0", false],
]) {
  test(`Unpinned GitHub install gate: ${event} ${ref} is ${expected ? "included" : "excluded"}`, () => {
    const ci = workflows.find(({ file }) => file === "ci.yml").text;
    const job = ci.split("\n  install-github:\n")[1]?.split(/\n {2}[\w-]+:\n/)[0];
    const condition = job?.match(/^ {4}if: (.+)$/m)?.[1];
    assert.ok(condition, "The actual install-github job must have a condition.");
    // These canonical string comparisons share JavaScript's boolean semantics.
    const actual = runInNewContext(condition, { github: { event_name: event, ref } }, { timeout: 100 });
    assert.equal(actual, expected);
  });
}

test("Form answer proof propagates a failing test command through both logged pipelines", () => {
  const proof = readFileSync(join(dir, "form-answer-proof.yml"), "utf8");
  const browser = proof.match(/- name: Shipped Form, constructor and Link regressions with focused coverage\n\s+run: \|\n([\s\S]+?)\n\s+- if: always\(\)/)?.[1];
  const node = proof.match(/run: (pnpm exec vitest run --config test\/form-answer\.config\.ts[^\n]*)/)?.[1];
  assert.ok(browser && node, "The proof must execute both regression commands.");
  // GitHub's implicit shell is bash -e; explicit shell: bash additionally sets pipefail.
  const strict = /^defaults:\n {2}run:\n {4}shell: bash$/m.test(proof);
  for (const script of [node, browser]) {
    const controlled = `pnpm() { return 17; }\n${script.replace(/tee \.tmp\/adopt-a-form-value\/[\w-]+\.log/g, "tee /dev/null")}`;
    const control = spawnSync("bash", ["-e", "-c", controlled], { encoding: "utf8" });
    assert.equal(control.status, 0, "The former implicit-shell pipeline conceals the test failure.");
    const args = strict ? ["--noprofile", "--norc", "-e", "-o", "pipefail"] : ["-e"];
    const actual = spawnSync("bash", [...args, "-c", controlled], { encoding: "utf8" });
    assert.equal(actual.status, 17, "A failed regression/coverage command must fail the proof job, not only tee.");
  }
});

test("Form answer fixture uses the public npm registry, not a machine-specific mirror", () => {
  const fixture = join(root, "test/form-answer-fixture");
  const manifest = JSON.parse(readFileSync(join(fixture, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(fixture, "package-lock.json"), "utf8"));
  assert.deepEqual(lock.packages[""].dependencies, manifest.dependencies);
  const packages = Object.entries(lock.packages).filter(([, entry]) => entry.resolved);
  assert.ok(packages.length > 0);
  for (const [name, entry] of packages) {
    const url = new URL(entry.resolved);
    assert.equal(url.origin, "https://registry.npmjs.org", name);
    assert.equal(url.username + url.password + url.search + url.hash, "", name);
    assert.ok(entry.integrity, `${name} must retain its locked checksum`);
  }
  const proof = readFileSync(join(dir, "form-answer-proof.yml"), "utf8");
  assert.match(proof, /npm ci --prefix \.tmp\/adopt-a-form-value[^\n]*--registry=https:\/\/registry\.npmjs\.org(?:\s|$)/);
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
  const bin = scratchDir("ouro-gh-");
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
  assert.match(release, /gh run watch "\$run" --exit-status --interval 30 && gh pr merge "\$NEXT_BRANCH" --squash \|\| true/);
  // gh's exit code also fails on local branch cleanup, so the pull request's state decides, and
  // the branch is deleted through the API afterwards.
  assert.doesNotMatch(release, /gh pr merge[^\n]*--delete-branch/);
  assert.match(release, /gh pr view "\$NEXT_BRANCH" --json state --jq \.state\)" = MERGED/);
  assert.match(release, /gh workflow run ci\.yml --ref main/);
  // Pages deploys main's new tip only after CI on it has run.
  assert.ok(release.indexOf('gh run watch "$ci"') > release.indexOf("gh workflow run ci.yml --ref main"));
  assert.ok(release.indexOf("gh workflow run pages.yml --ref main") > release.indexOf('gh run watch "$ci"'));
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

const releaseStep = (name) => {
  const release = workflow("release.yml");
  const start = release.indexOf(`        name: ${name}\n`);
  assert.notEqual(start, -1);
  const body = release.slice(start).split("        run: |\n")[1].split(/\n {6}- /)[0];
  return body.split("\n").map((line) => line.slice(10)).join("\n");
};

for (const scenario of ["success", "ci-failed", "ci-missing", "dispatch-failed", "not-merged", "approval-failed", "tip-advanced"]) {
  test(`Release's main CI gate ${scenario === "success" ? "permits" : "blocks"} Pages (${scenario})`, () => {
    // Execute the workflow's actual shell, substituting only GitHub/network operations.
    // gh merge exits non-zero even when state says MERGED, exercising independent readback.
    const prepare = releaseStep("Prepare main for the next release");
    const gate = prepare.slice(prepare.indexOf('if [ -n "$run" ] && gh api'));
    const deploy = releaseStep("Deploy Pages and check what is published");
    const scratch = join(root, ".tmp");
    mkdirSync(scratch, { recursive: true });
    const fixture = mkdtempSync(join(scratch, "release-main-gate-"));
    const output = join(fixture, "output.txt");
    const summary = join(fixture, "summary.md");
    writeFileSync(output, "");
    writeFileSync(summary, "");
    console.info(`Release gate fixture: ${fixture}`);
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `
      gh() {
        printf 'CALL %s\\n' "$*" >&2
        case "$*" in
          "api -X POST "*"/approve") [ "$SCENARIO" != approval-failed ] ;;
          "run watch 1 "*) return 0 ;;
          "pr merge "*) return 1 ;;
          "pr view "*"--json state"*) if [ "$SCENARIO" = not-merged ]; then echo OPEN; else echo MERGED; fi ;;
          "pr view "*"--json body"*) echo body ;;
          "pr edit "*|"api -X DELETE "*) return 0 ;;
          "api "*"commits/main"*) echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
          "workflow run ci.yml --ref main") [ "$SCENARIO" != dispatch-failed ] ;;
          "workflow run ci.yml --ref prepare/"*) return 0 ;;
          "run list --workflow ci.yml "*) if [ "$SCENARIO" != ci-missing ]; then echo 2; fi ;;
          "run watch 2 "*) [ "$SCENARIO" != ci-failed ] ;;
          "run list --workflow pages.yml "*) if [ "$pages" = 1 ]; then echo 4; else echo 3; fi ;;
          "workflow run pages.yml --ref main") pages=1 ;;
          "run watch 4 "*) return 0 ;;
          *) echo "Unexpected gh call: $*" >&2; return 99 ;;
        esac
      }
      seq() { echo 1; }
      sleep() { :; }
      node() { printf 'PUBLISHED %s\\n' "$*"; }
      run=1
      pages=0
      ${gate}
      VERIFIED_MAIN_SHA="$tip"
      if [ "$SCENARIO" = tip-advanced ]; then VERIFIED_MAIN_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; fi
      ${deploy}
    `], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, SCENARIO: scenario, NEXT_BRANCH: "prepare/after-v9.9.9", TAG: "v9.9.9", GITHUB_REPOSITORY: "ourostack/ouro-ui", GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output },
    });
    assert.doesNotMatch(result.stderr, /Unexpected gh call:/);
    if (scenario === "success") {
      assert.equal(result.status, 0, result.stderr);
      assert.match(readFileSync(output, "utf8"), /main_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
      assert.match(result.stderr, /CALL workflow run pages.yml --ref main/);
      assert.match(result.stdout, /PUBLISHED scripts\/published-release.mjs v9.9.9 --wait 900\nPUBLISHED scripts\/public-registry.mjs verify-live v9.9.9 --wait 900\n/);
      assert.match(result.stderr, /CALL api -X DELETE repos\/ourostack\/ouro-ui\/git\/refs\/heads\/prepare\/after-v9.9.9/);
    } else {
      assert.notEqual(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stderr, /CALL workflow run pages.yml/);
      assert.match(result.stdout, /::error::/, result.stderr);
    }
  });
}

test("a release builds the @ouro namespace from its commit and checks it byte for byte before CI, the screen-reader lane and the tag", () => {
  const release = workflow("release.yml");
  const push = release.indexOf("name: Push the release branch");
  const build = release.indexOf("name: Build and check the @ouro namespace for the release commit");
  const ci = release.indexOf("name: Run CI on the release commit");
  const lane = release.indexOf("name: Pass the screen-reader lane on the release commit");
  const tag = release.indexOf('git tag "$TAG"');
  assert.ok(push > 0 && build > push && ci > build && lane > ci && tag > lane, "push, the namespace check, CI, the screen-reader lane, then the tag");
  const step = releaseStep("Build and check the @ouro namespace for the release commit");
  const lines = step.split("\n").filter((line) => line && !line.startsWith("#"));
  assert.deepEqual(lines, ['scripts/namespace.sh "$RUNNER_TEMP/ns" "$TAG"', 'node scripts/public-registry.mjs verify-build "$RUNNER_TEMP/ns" HEAD']);
});

test("a release checks last that Pages serves the tag's @ouro namespace byte for byte, after the published pages", () => {
  const deploy = releaseStep("Deploy Pages and check what is published");
  const lines = deploy.trimEnd().split("\n");
  assert.deepEqual(lines.filter((line) => line.startsWith("node ")), ['node scripts/published-release.mjs "$TAG" --wait 900', 'node scripts/public-registry.mjs verify-live "$TAG" --wait 900']);
  assert.equal(lines.at(-1), 'node scripts/public-registry.mjs verify-live "$TAG" --wait 900');
  assert.ok(deploy.indexOf("verify-live") > deploy.indexOf('gh run watch "$run"'), "after the Pages deploy finishes");
});

test("the release runs the public-registry tests with the script tests", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["test:scripts"];
  assert.match(scripts, / scripts\/public-registry\.test\.mjs /);
});

test("Release passes the verified main SHA to Pages and does not bypass the ruleset", () => {
  const release = workflow("release.yml");
  assert.match(release, /id: prepare/);
  assert.match(release, /VERIFIED_MAIN_SHA: \$\{\{ steps\.prepare\.outputs\.main_sha \}\}/);
  assert.doesNotMatch(release, /gh pr merge[^\n]*--admin/);
});

test("Scheduled install checks that the published llms.txt and README name the newest release", () => {
  assert.match(job("latest"), /node scripts\/published-release\.mjs "\$newest"/);
});

/** ci.yml's jobs, by name, each the text of its block. */
const ciJobs = () =>
  Object.fromEntries(
    workflow("ci.yml")
      .split("\njobs:\n")[1]
      .split(/\n(?= {2}[\w-]+:\n)/)
      .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
  );

/** The `run: |` script of the step with this name in a job's block, de-indented. */
const stepScript = (block, name) => {
  const start = block.search(new RegExp(`^ {6}(- | {2})name: ${name.replace(/[?]/g, "\\$&")}\n`, "m"));
  assert.notEqual(start, -1, `no step named ${name}`);
  const lines = block.slice(start).split("        run: |\n")[1].split("\n");
  const end = lines.findIndex((line) => line !== "" && !line.startsWith(" ".repeat(10)));
  return lines.slice(0, end === -1 ? undefined : end).map((line) => line.slice(10)).join("\n");
};

/** Runs a step's script under bash -e with stand-ins for pnpm and node, returning what it called and wrote. */
function runStep(script, env, { nodeStatus = 0 } = {}) {
  const scratch = join(root, ".tmp");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "ci-step-"));
  const output = join(dir, "output.txt");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `
    pnpm() { printf 'CALL pnpm %s\\n' "$*" >&2; printf 'OURO_STORIES=%s\\n' "\${OURO_STORIES-unset}" >&2; }
    node() {
      printf 'CALL node %s\\n' "$*" >&2
      case "$2" in
        stories) echo checkbox ;;
        e2e) echo "registry/ouro/e2e/ouro/checkbox.spec.ts site/e2e/" ;;
        plan) printf 'full=false\\ncomponents=checkbox\\n' >> "$GITHUB_OUTPUT" ;;
      esac
      return "$NODE_STATUS"
    }
    ${script}
  `], { cwd: root, encoding: "utf8", env: { ...process.env, ...env, GITHUB_OUTPUT: output, NODE_STATUS: String(nodeStatus) } });
  return { status: result.status, stdout: result.stdout, calls: result.stderr, output: Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").filter(Boolean).map((line) => line.split(/=(.*)/).slice(0, 2))) };
}

// A pull request runs the tests its change can affect (scripts/test-impact.mjs); everything else
// runs every test, and every required check reports either way.
for (const [event, ref, baseRef, headRef, expected] of [
  ["pull_request", "refs/pull/9/merge", "main", "feature", "planned"],
  ["pull_request", "refs/pull/9/merge", "main", "release/v1.1.0", "full"],
  ["pull_request", "refs/pull/9/merge", "release/v1.1.0", "fix", "full"],
  ["push", "refs/heads/main", "", "", "full"],
  ["merge_group", "refs/heads/gh-readonly-queue/main/pr-9-abc", "", "", "full"],
  ["workflow_dispatch", "refs/heads/main", "", "", "full"],
  ["workflow_dispatch", "refs/heads/release/v1.1.0", "", "", "full"],
]) {
  test(`CI's plan: ${event} ${headRef || ref}${baseRef ? ` into ${baseRef}` : ""} runs ${expected === "full" ? "everything" : "what the change can affect"}`, () => {
    const { status, calls, output } = runStep(stepScript(ciJobs().plan, "Plan the tests"), { EVENT: event, REF: ref, BASE_REF: baseRef, HEAD_REF: headRef });
    assert.equal(status, 0, calls);
    if (expected === "full") {
      assert.deepEqual(output, { full: "true" });
      assert.doesNotMatch(calls, /CALL node/);
    } else {
      assert.match(calls, /^CALL node scripts\/test-impact\.mjs plan HEAD\^1 HEAD$/m);
      assert.deepEqual(output, { full: "false", components: "checkbox" });
    }
  });
}

test("CI's plan runs everything when planning fails", () => {
  const { status, stdout, output } = runStep(stepScript(ciJobs().plan, "Plan the tests"), { EVENT: "pull_request", REF: "refs/pull/9/merge", BASE_REF: "main", HEAD_REF: "feature" }, { nodeStatus: 1 });
  assert.equal(status, 0);
  assert.equal(output.full, "true");
  assert.match(stdout, /::warning::Could not plan the tests, so everything runs/);
});

test("the plan's merge commit has its base: the checkout fetches the merge commit's parents", () => {
  assert.match(ciJobs().plan, /- uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}persist-credentials: false\n(?: {10}#.*\n)* {10}fetch-depth: 2\n/);
});

test("every job that reads the plan runs whatever happened to it, and runs everything unless it says full=false", () => {
  const jobs = ciJobs();
  const readers = Object.keys(jobs).filter((name) => /needs\.plan\.outputs/.test(jobs[name]));
  assert.deepEqual(readers.sort(), ["ci", "e2e", "themes"]);
  for (const name of readers) {
    assert.match(jobs[name], /^ {4}needs: \[plan\]\n {4}if: \$\{\{ !cancelled\(\) \}\}$/m, name);
    const full = jobs[name].match(/^ {6}FULL: \$\{\{ (.+) \}\}$/m)?.[1];
    assert.equal(full, "needs.plan.outputs.full != 'false'", name);
    // A plan that failed or never ran leaves the output empty: everything runs.
    for (const [value, expected] of [["", true], ["true", true], ["false", false]]) {
      assert.equal(runInNewContext(full.replace("needs.plan.outputs.full", "value"), { value }), expected, `${name} with full=${JSON.stringify(value)}`);
    }
  }
});

test("every required check is still a job that reports, under the name the ruleset requires", () => {
  const jobs = ciJobs();
  const names = [];
  for (const [id, block] of Object.entries(jobs)) {
    const name = block.match(/^ {4}name: (.+)$/m)?.[1] ?? id;
    const matrix = (key) => block.match(new RegExp(`^ {8}${key}: \\[([^\\]]*)\\]$`, "m"))?.[1].split(",").map((value) => value.trim());
    if (/matrix\.shard/.test(name)) for (const shard of matrix("shard")) names.push(name.replace("${{ matrix.shard }}", shard));
    else if (/matrix\.variant/.test(name)) {
      for (const variant of matrix("variant")) for (const preset of matrix("preset")) names.push(name.replace("${{ matrix.variant }}", variant).replace("${{ matrix.preset }}", preset));
      for (const [, variant, preset] of block.matchAll(/^ {10}- variant: (\w+)\n {12}preset: (\w+)$/gm)) names.push(name.replace("${{ matrix.variant }}", variant).replace("${{ matrix.preset }}", preset));
    } else names.push(name);
    // A job a required check names never skips itself: at most it runs whatever its needs did.
    const condition = block.match(/^ {4}if: (.+)$/m)?.[1];
    if (!["install-github", "install-latest", "plan"].includes(id)) assert.ok(!condition || condition === "${{ !cancelled() }}", `${id} has if: ${condition}`);
  }
  // The ruleset's required checks, which the claims check also reads (verify:ciJob accepts only these).
  const required = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));
  for (const check of required) assert.ok(names.includes(check), `${check} is not among ${names.join(", ")}`);
});

test("the required ci job runs the claims ratchet on a pull request, against its base, with its description", () => {
  const block = ciJobs().ci;
  const step = block.slice(block.search(/^ {6}- name: Claims\n/m)).split(/\n {6}- /)[0];
  assert.match(step, /^ {10}PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}$/m);
  const script = `git() { printf 'CALL git %s\\n' "$*" >&2; }\n${stepScript(block, "Claims")}`;
  const pull = runStep(script, { BASE_REF: "main" });
  assert.equal(pull.status, 0);
  assert.match(pull.calls, /^CALL git fetch --no-tags --depth=1 origin main\nCALL node scripts\/claims\.mjs ratchet\nCALL pnpm claims:check --network=changed$/m);
  // A failing ratchet fails the job.
  assert.notEqual(runStep(script, { BASE_REF: "main" }, { nodeStatus: 1 }).status, 0);
  assert.doesNotMatch(runStep(script, { BASE_REF: "" }).calls, /ratchet/);
  assert.ok(JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8")).includes("ci"));
});

test("the ci job runs every browser test, or the reduced run, and says which for motion coverage", () => {
  const script = stepScript(ciJobs().ci, "Browser tests");
  const full = runStep(script, { FULL: "true", COMPONENTS: "" });
  assert.equal(full.status, 0);
  assert.match(full.calls, /^CALL pnpm test$/m);
  assert.deepEqual(full.output, { reduced: "false", stems: "" });
  const reduced = runStep(script, { FULL: "false", COMPONENTS: "checkbox,checkbox-group" });
  assert.match(reduced.calls, /^CALL node scripts\/test-impact\.mjs vitest checkbox,checkbox-group$/m);
  assert.doesNotMatch(reduced.calls, /CALL pnpm/);
  const subsets = stepScript(ciJobs().ci, "Coverage of installed subsets");
  assert.match(runStep(subsets, { FULL: "true" }).calls, /^CALL node scripts\/subset-coverage\.mjs$/m);
  assert.match(runStep(subsets, { FULL: "false", COMPONENTS: "checkbox" }).calls, /^CALL node scripts\/subset-coverage\.mjs --touching checkbox$/m);
});

test("the themes shards pass as not affected when a pull request changes no component, and scan only the selected stories otherwise", () => {
  const block = ciJobs().themes;
  const affected = stepScript(block, "Is any story affected?");
  const none = runStep(affected, { FULL: "false", COMPONENTS: "" });
  assert.equal(none.status, 0);
  assert.equal(none.output.run, "false");
  assert.match(none.stdout, /^Not affected: /m);
  assert.equal(runStep(affected, { FULL: "false", COMPONENTS: "dialog" }).output.run, "true");
  assert.equal(runStep(affected, { FULL: "true", COMPONENTS: "" }).output.run, "true");
  // Every later step waits on that answer; the job itself always runs and reports.
  const later = block.slice(block.indexOf("name: Is any story affected?")).split(/\n {6}- /).slice(1);
  for (const step of later) assert.match(step, /^if: steps\.affected\.outputs\.run == 'true'$/m, step);
  const scan = stepScript(block, "Theme scans");
  assert.match(runStep(scan, { FULL: "true", SHARD: "2" }).calls, /CALL pnpm test:themes --shard=2\/3\nOURO_STORIES=unset/);
  assert.match(runStep(scan, { FULL: "false", COMPONENTS: "checkbox-group", SHARD: "2" }).calls, /CALL pnpm test:themes --shard=2\/3\nOURO_STORIES=checkbox$/m);
});

test("the e2e job runs every spec, or the selected components' and the site's", () => {
  const script = stepScript(ciJobs().e2e, "End-to-end specs");
  assert.match(runStep(script, { FULL: "true" }).calls, /^CALL pnpm test:e2e$/m);
  assert.match(runStep(script, { FULL: "false", COMPONENTS: "checkbox" }).calls, /^CALL pnpm test:e2e registry\/ouro\/e2e\/ouro\/checkbox\.spec\.ts site\/e2e\/$/m);
});

test("motion coverage runs after the browser test jobs, over the partitions they upload, expecting every project they run", async () => {
  const jobs = ciJobs();
  // A browser test job runs Vitest and uploads the partitions it wrote as its next step, before
  // any other Vitest run in the job can rewrite them.
  const browserJobs = Object.keys(jobs).filter((name) => /^ {6}- id: tests\n {8}name: Browser tests\n/m.test(jobs[name]));
  assert.deepEqual(browserJobs, ["ci"]);
  for (const name of browserJobs) {
    assert.match(
      jobs[name],
      /^ {8}name: Browser tests\n {8}run: \|\n(?: {10}.*\n)+(?: {6}#.*\n)*^ {6}- uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}name: motion-[\w-]+\n {10}path: \.tmp\/motion\/\n {10}include-hidden-files: true\n {10}if-no-files-found: error\n/m,
      `${name} uploads .tmp/motion/ as a motion-* artifact right after its browser tests`,
    );
  }
  const coverage = jobs["motion-coverage"];
  assert.ok(coverage, "ci.yml has a motion-coverage job");
  const needs = coverage.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((name) => name.trim());
  assert.deepEqual(needs, browserJobs, "motion-coverage runs after every browser test job");
  assert.match(coverage, /- uses: actions\/download-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}pattern: motion-\*\n {10}path: \$\{\{ runner\.temp \}\}\/motion\n/);
  const check = stepScript(coverage, "Motion coverage");
  // Full: every map complete. Reduced: every project still ran, and only the ci job's stems' maps must be complete.
  assert.match(runStep(check, { REDUCED: "false", MOTION_PARTITIONS: "p:1", RUNNER_TEMP: "/r" }).calls, /^CALL pnpm motion:coverage --dir \/r\/motion --expect p:1$/m);
  assert.match(runStep(check, { REDUCED: "true", STEMS: "checkbox,checkbox-group", MOTION_PARTITIONS: "p:1", RUNNER_TEMP: "/r" }).calls, /^CALL pnpm motion:coverage --dir \/r\/motion --expect p:1 --stems checkbox,checkbox-group$/m);
  assert.match(runStep(check, { REDUCED: "", MOTION_PARTITIONS: "p:1", RUNNER_TEMP: "/r" }).calls, /^CALL pnpm motion:coverage --dir \/r\/motion --expect p:1$/m);
  assert.match(coverage, /^ {6}REDUCED: \$\{\{ needs\.ci\.outputs\.reduced \}\}\n {6}STEMS: \$\{\{ needs\.ci\.outputs\.stems \}\}$/m);
  assert.match(jobs.ci, /^ {6}reduced: \$\{\{ steps\.tests\.outputs\.reduced \}\}\n {6}stems: \$\{\{ steps\.tests\.outputs\.stems \}\}$/m);
  // The expected partitions: each project vitest.config.ts runs (CI_VISUAL unset, as in the ci
  // job), once per shard. The browser tests run unsharded, so each project has one, and the
  // reduced run names every one of them too (scripts/test-impact.mjs).
  assert.doesNotMatch(jobs.ci, /--shard|strategy:/);
  const config = (await import("../vitest.config.ts")).default;
  const projects = config.test.projects.map((project) => project.test.name);
  assert.deepEqual(projects, ["ouro-chromium", "ouro-webkit", "ouro-touch", "site"]);
  const partitions = coverage.match(/^ {6}MOTION_PARTITIONS: (.+)$/m)?.[1];
  assert.equal(partitions, projects.map((name) => `${name}:1`).join(","));
  const { vitestArgs } = await import("./test-impact.mjs");
  for (const components of [[], ["checkbox"]]) {
    assert.deepEqual(vitestArgs(components).filter((arg) => arg.startsWith("--project=")).map((arg) => arg.slice(10)), projects);
  }
});

// The screen-reader lane (screen-reader.yml): real VoiceOver and NVDA through Guidepup, nightly and
// before every release. Guidepup's setup rewrites VoiceOver and TCC settings, so the lane runs only
// what it is asked to, on throwaway hosted runners, with nothing to leak.

const screenReader = () => workflow("screen-reader.yml");
const srJobs = () =>
  Object.fromEntries(
    screenReader()
      .split("\njobs:\n")[1]
      .split(/\n(?= {2}[\w-]+:\n)/)
      .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
  );

test("the screen-reader lane runs nightly and on dispatch with a required source_sha, never for a pull request", () => {
  const text = screenReader();
  const on = text.split("\non:\n")[1].split(/\n(?=\S)/)[0];
  assert.deepEqual([...on.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]), ["schedule", "workflow_dispatch"]);
  assert.match(on, /^ {4}- cron: "[^"]+"$/m);
  assert.match(on, /^ {6}source_sha:\n {8}description: .+\n {8}required: true$/m);
  assert.doesNotMatch(text, /pull_request/);
});

test("the screen-reader lane reads the repository and nothing more, and holds no secret", () => {
  const text = screenReader();
  assert.match(text, /^permissions:\n {2}contents: read\nconcurrency:/m);
  assert.doesNotMatch(text, /secrets\./);
  const jobs = srJobs();
  assert.doesNotMatch(jobs.lane, /permissions:/);
  // Only the job that files the nightly infrastructure issue may write issues, and it runs no Guidepup.
  assert.match(jobs.report, /^ {4}permissions:\n {6}contents: read\n {6}issues: write$/m);
  assert.match(jobs.report, /^ {4}if: failure\(\) && github\.event_name == 'schedule'$/m);
  assert.doesNotMatch(jobs.report, /guidepup|test:sr/i);
  assert.match(jobs.report, /scripts\/sr-infra-issue\.sh "\$RUN_URL" "nightly"/);
});

test("the screen-reader lane runs VoiceOver on macos-15 and NVDA on windows-2025, at the commit it was given", () => {
  const lane = srJobs().lane;
  assert.match(lane, /- os: macos-15\n {12}project: voiceover\n {10}- os: windows-2025\n {12}project: nvda\n/);
  assert.match(lane, /^ {4}runs-on: \$\{\{ matrix\.os \}\}$/m);
  assert.match(lane, /- uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}ref: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}\n {10}persist-credentials: false\n/);
  assert.match(lane, /^ {6}SOURCE_SHA: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}$/m);
});

const sha = "a".repeat(40);
for (const [name, env, ok] of [
  ["a dispatched branch tip on a hosted runner", { SOURCE_SHA: sha, EVENT: "workflow_dispatch", DISPATCHED_SHA: sha, RUNNER_KIND: "github-hosted", HEAD: sha }, true],
  ["the nightly run of main", { SOURCE_SHA: sha, EVENT: "schedule", DISPATCHED_SHA: sha, RUNNER_KIND: "github-hosted", HEAD: sha }, true],
  ["a short SHA", { SOURCE_SHA: "abc1234", EVENT: "workflow_dispatch", DISPATCHED_SHA: "abc1234", RUNNER_KIND: "github-hosted", HEAD: "abc1234" }, false],
  ["an upper-case SHA", { SOURCE_SHA: "A".repeat(40), EVENT: "workflow_dispatch", DISPATCHED_SHA: "A".repeat(40), RUNNER_KIND: "github-hosted", HEAD: "A".repeat(40) }, false],
  ["a SHA that is not the dispatched branch's tip", { SOURCE_SHA: sha, EVENT: "workflow_dispatch", DISPATCHED_SHA: "b".repeat(40), RUNNER_KIND: "github-hosted", HEAD: sha }, false],
  ["a checkout of another commit", { SOURCE_SHA: sha, EVENT: "workflow_dispatch", DISPATCHED_SHA: sha, RUNNER_KIND: "github-hosted", HEAD: "c".repeat(40) }, false],
  ["a self-hosted runner", { SOURCE_SHA: sha, EVENT: "workflow_dispatch", DISPATCHED_SHA: sha, RUNNER_KIND: "self-hosted", HEAD: sha }, false],
]) {
  test(`the screen-reader lane's guard ${ok ? "lets through" : "stops"} ${name}`, () => {
    const guard = stepScript(srJobs().lane, "Check the commit and the runner");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `git() { echo "$HEAD"; }\n${guard}`], { encoding: "utf8", env: { ...process.env, ...env, PROJECT: "voiceover" } });
    assert.equal(result.status === 0, ok, result.stdout + result.stderr);
    if (!ok) assert.match(result.stdout, /::error::/);
  });
}

test("the screen-reader lane sets up Guidepup in two phases, setup --ci then install, through the bin its package declares", () => {
  const lane = srJobs().lane;
  const order = ["- run: pnpm i --frozen-lockfile", "- run: pnpm exec playwright install --with-deps webkit chromium", "name: Find Guidepup's setup command", 'run: pnpm exec "$GUIDEPUP" setup --ci', 'run: pnpm exec "$GUIDEPUP" install', 'pnpm test:sr --project "$PROJECT"', "node scripts/sr-classify.mjs"];
  const at = order.map((line) => lane.indexOf(line));
  assert.ok(at.every((index) => index > 0), order.filter((_, index) => at[index] <= 0).join(", "));
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in this order");
  assert.match(lane, /readFileSync\("node_modules\/@guidepup\/setup\/package\.json", "utf8"\)\)\.bin\)\[0\]/);
  const setup = JSON.parse(readFileSync(join(root, "node_modules/@guidepup/setup/package.json"), "utf8"));
  assert.deepEqual(Object.keys(setup.bin), ["guidepup"]);
  // The classification runs whatever failed before it, except the guard, and fails the job unless the lane passed.
  assert.match(lane, /^ {8}if: always\(\) && steps\.guard\.outcome == 'success'$/m);
});

test("the screen-reader packages are pinned exactly, and test:sr runs its own config", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const name of ["@guidepup/guidepup", "@guidepup/playwright", "@guidepup/setup"]) assert.match(pkg.devDependencies[name] ?? "", /^\d+\.\d+\.\d+$/, name);
  assert.equal(pkg.scripts["test:sr"], "playwright test --config playwright.screen-reader.config.ts");
  assert.match(pkg.scripts["test:scripts"], /scripts\/sr-classify\.test\.mjs/);
});

test("the main Playwright config never runs a screen-reader spec, and the screen-reader config runs only those, one at a time", async () => {
  const main = (await import("../playwright.config.ts")).default;
  assert.ok(main.testIgnore instanceof RegExp && main.testIgnore.test("registry/ouro/e2e/screen-reader/checkbox.sr.spec.ts"));
  // Importing Guidepup throws where no screen reader is supported, as on the Linux runner that runs these tests.
  assert.doesNotMatch(readFileSync(join(root, "playwright.screen-reader.config.ts"), "utf8"), /from "@guidepup\//);
  const sr = (await import("../playwright.screen-reader.config.ts")).default;
  assert.equal(sr.testDir, "registry/ouro/e2e/screen-reader");
  assert.ok(sr.testMatch.test("dialog.sr.spec.ts") && !sr.testMatch.test("dialog.spec.ts"));
  assert.equal(sr.workers, 1);
  assert.equal(sr.retries, 0);
  assert.equal(sr.use.baseURL, "http://localhost:6006/");
  assert.deepEqual(
    { reuseExistingServer: sr.webServer.reuseExistingServer, url: sr.webServer.url, timeout: sr.webServer.timeout },
    { reuseExistingServer: false, url: "http://localhost:6006/iframe.html", timeout: 300_000 },
  );
  assert.match(sr.webServer.command, /^pnpm build-storybook .* && pnpm exec vite preview .*--port 6006/);
  const projects = Object.fromEntries(sr.projects.map((project) => [project.name, project]));
  assert.equal(projects.voiceover.use.defaultBrowserType, "webkit");
  assert.equal(projects.nvda.use.defaultBrowserType, "chromium");
  for (const name of ["voiceover", "nvda"]) {
    assert.equal(projects[name].use.headless, false, name);
    assert.deepEqual(projects[name].dependencies, ["stories"], name);
  }
});

test("a release installs with shadcn@latest in CI on its release commit, and only there", () => {
  const latest = ciJobs()["install-latest"];
  assert.ok(latest, "ci.yml has an install-latest job");
  assert.match(latest, /^ {4}if: startsWith\(github\.ref, 'refs\/heads\/release\/'\)$/m);
  assert.match(latest, /^ {6}- run: SHADCN_VERSION=latest scripts\/install-test\.sh shadcn "\$RUNNER_TEMP\/latest" \$\{\{ github\.sha \}\}$/m);
  assert.doesNotMatch(latest, /permissions:/);
  const install = readFileSync(join(root, "scripts/install-test.sh"), "utf8");
  assert.match(install, /^shadcn=\(npx --yes shadcn@4\.21\.1\)\n\[ -z "\$\{SHADCN_VERSION:-\}" \] \|\| shadcn=\(npx --yes "shadcn@\$SHADCN_VERSION"\)$/m);
  // The pinned CLI unless SHADCN_VERSION names another.
  const line = install.split("\n").findIndex((text) => text.startsWith("shadcn=("));
  for (const [version, expected] of [["", "shadcn@4.21.1"], ["latest", "shadcn@latest"]]) {
    const result = spawnSync("bash", ["-c", `${install.split("\n").slice(line, line + 2).join("\n")}\necho "\${shadcn[2]}"`], { encoding: "utf8", env: { ...process.env, SHADCN_VERSION: version } });
    assert.equal(result.stdout.trim(), expected);
  }
  for (const event of ["pull_request", "push", "workflow_dispatch"]) {
    for (const [ref, expected] of [["refs/heads/main", false], ["refs/pull/9/merge", false], ["refs/heads/release/v1.1.0", true]]) {
      const condition = latest.match(/^ {4}if: (.+)$/m)[1].replace(/startsWith\(github\.ref, '([^']+)'\)/, (_, prefix) => JSON.stringify(ref.startsWith(prefix)));
      assert.equal(runInNewContext(condition, {}), expected, `${event} ${ref}`);
    }
  }
});

test("a release passes CI (with shadcn@latest), then the screen-reader lane on its own commit, before it tags", () => {
  const release = workflow("release.yml");
  const ci = release.indexOf("name: Run CI on the release commit");
  const lane = release.indexOf("name: Pass the screen-reader lane on the release commit");
  const tag = release.indexOf('git tag "$TAG"');
  assert.ok(ci > release.indexOf("name: Push the release branch") && lane > ci && tag > lane, "push, CI, the screen-reader lane, then the tag");
  const gate = releaseStep("Pass the screen-reader lane on the release commit");
  assert.match(gate, /gh workflow run screen-reader\.yml --ref "\$BRANCH" -f source_sha="\$sha"/);
  assert.match(gate, /gh run list --workflow screen-reader\.yml --branch "\$BRANCH" --json databaseId,headSha,event,createdAt/);
  assert.match(gate, /gh run watch "\$run" --exit-status/);
  assert.match(release, /^ {2}issues: write # /m);
});

/** Runs the release's screen-reader gate with a stand-in gh that plays the lane's runs in order. */
function runReleaseGate(outcomes, { startsWith = true, headSha } = {}) {
  const scratch = join(root, ".tmp");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "release-sr-gate-"));
  const summary = join(dir, "summary.md");
  writeFileSync(summary, "");
  writeFileSync(join(dir, "outcomes"), outcomes.join("\n") + "\n");
  const gate = releaseStep("Pass the screen-reader lane on the release commit");
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `
    git() { echo ${sha}; }
    seq() { echo 1; }
    sleep() { :; }
    issue_script() { printf 'ISSUE %s\\n' "$*" >&2; echo https://github.com/ourostack/ouro-ui/issues/7; }
    dispatched=0
    outcome() { sed -n "\${dispatched}p" "$DIR/outcomes"; }
    gh() {
      printf 'CALL %s\\n' "$*" >&2
      case "$*" in
        "run list --workflow screen-reader.yml --branch release/v9.9.9 --event workflow_dispatch --json databaseId --jq "*) echo $((dispatched * 10)) ;;
        "workflow run screen-reader.yml --ref release/v9.9.9 -f source_sha=${sha}") dispatched=$((dispatched + 1)) ;;
        "run list --workflow screen-reader.yml --branch release/v9.9.9 --json databaseId,headSha,event,createdAt --jq "*)
          if [ "$STARTS" = true ]; then echo $((dispatched * 10 + 1)); fi ;;
        "run watch "*) [ "$(outcome)" = pass ] ;;
        "run view "*"--json conclusion,headSha"*) echo "success \${HEAD_SHA:-${sha}}" ;;
        "run view "*"--log-failed") case "$(outcome)" in infrastructure) printf 'voiceover\\tClassify\\tSR_CLASS=infrastructure\\nnvda\\tClassify\\tSR_CLASS=infrastructure\\n' ;; accessibility) printf 'nvda\\tClassify\\tSR_CLASS=accessibility\\nvoiceover\\tClassify\\tSR_CLASS=infrastructure\\n' ;; esac ;;
        *) echo "Unexpected gh call: $*" >&2; return 99 ;;
      esac
    }
    ${gate.replace("scripts/sr-infra-issue.sh", "issue_script")}
  `], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, DIR: dir, STARTS: String(startsWith), HEAD_SHA: headSha ?? "", BRANCH: "release/v9.9.9", TAG: "v9.9.9", GITHUB_STEP_SUMMARY: summary, GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "ourostack/ouro-ui" },
  });
  assert.doesNotMatch(result.stderr, /Unexpected gh call/);
  return { ...result, dispatches: (result.stderr.match(/CALL workflow run screen-reader\.yml/g) ?? []).length, summary: readFileSync(summary, "utf8") };
}

test("the release's screen-reader gate passes when the lane passes for the release commit", () => {
  const result = runReleaseGate(["pass"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.dispatches, 1);
  assert.match(result.stdout, /VoiceOver and NVDA passed on a{40}/);
  assert.match(result.summary, /attempt 1: https:\/\/github\.com\/ourostack\/ouro-ui\/actions\/runs\/11/);
});

test("the release's screen-reader gate retries one infrastructure failure", () => {
  const result = runReleaseGate(["infrastructure", "pass"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.dispatches, 2);
  assert.match(result.stdout, /::warning::The screen-reader lane could not drive its screen reader \(attempt 1\)/);
});

test("the release's screen-reader gate stops after a second infrastructure failure, with the issue", () => {
  const result = runReleaseGate(["infrastructure", "infrastructure"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.dispatches, 2);
  assert.match(result.stderr, /ISSUE https:\/\/github\.com\/ourostack\/ouro-ui\/actions\/runs\/21 release v9\.9\.9/);
  assert.match(result.stdout, /::error::The screen-reader lane failed twice on infrastructure, so v9\.9\.9 is not tagged: https:\/\/github\.com\/ourostack\/ouro-ui\/issues\/7/);
});

test("the release's screen-reader gate stops at an accessibility failure without retrying", () => {
  const result = runReleaseGate(["accessibility"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.dispatches, 1);
  assert.match(result.stdout, /::error::The screen-reader lane failed on a{40} \(SR_CLASS=accessibility SR_CLASS=infrastructure\)/);
});

test("the release's screen-reader gate refuses a run for another commit, and a lane that never starts", () => {
  const other = runReleaseGate(["pass"], { headSha: "b".repeat(40) });
  assert.notEqual(other.status, 0);
  assert.match(other.stdout, /concluded 'success b{40}', not success for a{40}/);
  const never = runReleaseGate(["pass"], { startsWith: false });
  assert.notEqual(never.status, 0);
  assert.match(never.stdout, /::error::The screen-reader lane did not start/);
});

test("the release's time limit is at least 1.5 times its p95 with the screen-reader lane", () => {
  // Measured: the last 30 releases' p95 before the lane (ci-timings.json, Task 4), and the lane's
  // longest run from dispatch to result on this branch (7 minutes over 5 runs, both OSes),
  // rounded up and taken twice for one infrastructure retry; the shadcn@latest install runs
  // beside CI's other jobs on the release commit and adds no time. The namespace checks
  // (scripts/public-registry.mjs) build the namespace twice, once from the release commit and
  // once from the tag, and fetch every item once a deploy is live: under a minute each locally
  // (11 s per build, 9 s for verify-live against v1.0.2), so 2 minutes with a cold npx cache.
  const releaseP95 = 89;
  const laneP95 = 8;
  const namespaceChecks = 2;
  const limit = Number(workflow("release.yml").match(/^ {4}timeout-minutes: (\d+)$/m)?.[1]);
  assert.ok(limit >= Math.ceil(1.5 * (releaseP95 + 2 * laneP95 + namespaceChecks)), `timeout-minutes ${limit}`);
  assert.ok(limit <= 360, "GitHub's limit for a job");
});

test("sr-infra-issue.sh opens the screen-reader-infra issue once, then comments on it, and prints it", () => {
  const scratch = join(root, ".tmp");
  mkdirSync(scratch, { recursive: true });
  const bin = mkdtempSync(join(scratch, "sr-issue-"));
  const log = join(bin, "calls.log");
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\nall="$*"\nprintf '%s\\n' "\${all//$'\\n'/ }" >> "${log}"\nif [ "$1 $2" = "issue list" ]; then printf '%s' "$OPEN"; fi\nif [ "$1 $2" = "issue create" ]; then echo https://github.com/o/r/issues/12; fi\n`);
  chmodSync(join(bin, "gh"), 0o755);
  const run = (open) =>
    spawnSync("bash", [join(root, "scripts/sr-infra-issue.sh"), "https://github.com/o/r/actions/runs/1", "nightly"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPEN: open, GH_REPO: "o/r" },
    });
  const first = run("");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.trim(), "https://github.com/o/r/issues/12");
  const again = run("12");
  assert.equal(again.stdout.trim(), "https://github.com/o/r/issues/12");
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.match(calls[0], /^label create screen-reader-infra /);
  assert.match(calls[1], /^issue list --state open --label screen-reader-infra /);
  assert.match(calls[2], /^issue create --title Screen-reader lane: infrastructure failure --label screen-reader-infra --body The screen-reader lane could not drive VoiceOver or NVDA \(nightly\): https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  assert.equal(calls[5], "issue comment 12 --body Failed again (nightly): https://github.com/o/r/actions/runs/1");
});
