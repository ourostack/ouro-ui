import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
// The repository's own composite actions, which the workflows use from their checkout.
const actionsDir = join(root, ".github/actions");
const actions = readdirSync(actionsDir).map((name) => ({ file: `actions/${name}/action.yml`, text: readFileSync(join(actionsDir, name, "action.yml"), "utf8") }));

test("every action is pinned to a full commit SHA, with its version in a comment", () => {
  assert.ok(workflows.length >= 4);
  const ownActions = new Set(actions.map(({ file }) => `./.github/${file.replace(/\/action\.yml$/, "")}`));
  const unpinned = [...workflows, ...actions].flatMap(({ file, text }) =>
    text
      .split("\n")
      .filter((line) => /^\s*(- )?uses: /.test(line))
      .filter((line) => !/uses: [\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line) && !ownActions.has(line.replace(/^\s*(- )?uses: /, "").trim()))
      .map((line) => `${file}: ${line.trim()}`),
  );
  assert.deepEqual(unpinned, [], "Pin with owner/repo@<40-character SHA> # vX.Y.Z, or use one of .github/actions.");
});

const browserAction = readFileSync(join(actionsDir, "playwright-browsers/action.yml"), "utf8");

test("CI downloads Playwright's browsers only through the cached action", () => {
  for (const file of ["ci.yml", "agent-usability.yml", "visual-baselines.yml", "form-answer-proof.yml", "benchmark-v08-score.yml"]) {
    const text = workflows.find((workflow) => workflow.file === file).text;
    assert.doesNotMatch(text, /(pnpm exec|npx) playwright install(?!-deps)/, `${file} downloads browsers itself`);
    assert.match(text, /uses: \.\/\.github\/actions\/playwright-browsers\n\s+with:\n\s+browsers: [a-z ]+\n/);
  }
  // The install shards and install-latest restore them before install-test.sh, whose own
  // `playwright install`, at the same pinned version, then downloads nothing.
  const ci = workflows.find((workflow) => workflow.file === "ci.yml").text;
  assert.equal(ci.match(/browsers: chromium webkit\n\s+system-packages: "false"\n(?:\s+#.*\n)*\s+- (id: debs|run: SHADCN_VERSION=latest scripts\/install-test\.sh)/g)?.length, 2);
  // Main's cache, which every other run can restore, holds each set the workflows install, on
  // each runner image they run on.
  const warm = workflows.find((workflow) => workflow.file === "browser-cache.yml").text;
  assert.match(warm, /browsers: \[chromium, chromium webkit\]/);
  // It keeps the system packages' .deb files too (the action's default), daily, since they are kept per runner image version.
  assert.doesNotMatch(warm, /system-packages/);
  assert.match(warm, /schedule:\n\s+- cron: "\d+ \d+ \* \* \*"/);
  assert.match(warm, /- scripts\/browser-deps\.sh/);
  assert.match(warm, /push:\n\s+branches: \[main\]/);
  const images = new Set(
    workflows
      .filter(({ text }) => text.includes("uses: ./.github/actions/playwright-browsers"))
      .flatMap(({ text }) => [...text.matchAll(/runs-on: ([\w.-]+)$/gm)].map((match) => match[1])),
  );
  const warmed = /runner: \[([^\]]+)\]/.exec(warm)?.[1].split(/,\s*/);
  assert.deepEqual([...images].sort(), [...(warmed ?? [])].sort());
  assert.match(warm, /runs-on: \$\{\{ matrix\.runner \}\}/);
});

test("the browser action restores, downloads only what is missing with retries, saves on a miss, then installs system packages from their own cache", () => {
  const steps = ["actions/cache/restore@", "scripts/retry.sh pnpm exec playwright install $BROWSERS", "actions/cache/save@", "id: debs\n", 'scripts/browser-deps.sh "$OURO_BROWSER_DEBS" $BROWSERS', "steps.debs.outputs.cache-hit != 'true'"];
  const at = steps.map((step) => browserAction.indexOf(step));
  assert.ok(at.every((index) => index > 0), `missing: ${steps.filter((_, index) => at[index] < 0).join(", ")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in this order");
  // The key: the runner's OS, its image (WebKit's build differs per Ubuntu release, under one folder
  // name), its architecture, Playwright's version and the browsers, sorted.
  assert.match(browserAction, /key=playwright-\$\{RUNNER_OS\}-\$\{image\}-\$\{RUNNER_ARCH\}-\$\{version\}-\$\{set\}/);
  assert.match(browserAction, /image=\$\{ImageOS:-\}/);
  assert.match(browserAction, /image=\$\(\. \/etc\/os-release && echo "\$\{ID\}\$\{VERSION_ID\}"\)/);
  assert.match(browserAction, /version=\$\(node -p 'require\("playwright\/package\.json"\)\.version'\)/);
  assert.match(browserAction, /- if: steps\.restore\.outputs\.cache-hit != 'true'\n\s+uses: actions\/cache\/save@/);
  // The system packages' .deb files, kept per runner image version (whose installed packages they
  // complete), architecture, Playwright version and browsers.
  assert.match(browserAction, /debs-key=browser-debs-\$\{RUNNER_OS\}-\$\{image\}-\$\{ImageVersion:-unknown\}-\$\{RUNNER_ARCH\}-\$\{version\}-\$\{set\}/);
  assert.match(browserAction, /- if: inputs\.system-packages == 'true'\n\s+id: debs\n\s+uses: actions\/cache\/restore@/);
  assert.match(browserAction, /- if: inputs\.system-packages == 'true' && steps\.debs\.outputs\.cache-hit != 'true'\n\s+uses: actions\/cache\/save@[0-9a-f]{40} # v[\d.]+\n\s+# Another job may have saved the same key first\.\n\s+continue-on-error: true/);
  assert.match(browserAction, /^ {2}debs-key:\n {4}description: .+\n {4}value: \$\{\{ steps\.key\.outputs\.debs-key \}\}$/m);
  assert.doesNotMatch(browserAction, /exec playwright install-deps/);
});

test("browser-deps.sh installs the cached system packages with dpkg, and otherwise installs them with Playwright, keeping the .deb files for the cache", () => {
  const scratch = scratchDir("ouro-browser-deps-");
  const bin = join(scratch, "bin");
  mkdirSync(bin);
  const log = join(scratch, "calls.log");
  // Stand-ins: a Linux uname, sudo runs its command, tee writes to the log, dpkg exits $DPKG, pnpm logs.
  writeFileSync(join(bin, "uname"), `#!/usr/bin/env bash\necho Linux\n`);
  writeFileSync(join(bin, "sudo"), `#!/usr/bin/env bash\n"$@"\n`);
  writeFileSync(join(bin, "tee"), `#!/usr/bin/env bash\nprintf 'tee %s\\n' "$*" >> "${log}"\ncat >> "${log}"\n`);
  writeFileSync(join(bin, "dpkg"), `#!/usr/bin/env bash\nprintf 'dpkg %s\\n' "$*" >> "${log}"\nexit "\${DPKG:-0}"\n`);
  writeFileSync(join(bin, "pnpm"), `#!/usr/bin/env bash\nprintf 'pnpm %s\\n' "$*" >> "${log}"\n`);
  writeFileSync(join(bin, "apt-get"), `#!/usr/bin/env bash\nprintf 'apt-get %s\\n' "$*" >> "${log}"\n`);
  for (const name of ["uname", "sudo", "tee", "dpkg", "pnpm", "apt-get"]) chmodSync(join(bin, name), 0o755);
  const run = (dir, env = {}) => {
    writeFileSync(log, "");
    const result = spawnSync("bash", [join(root, "scripts/browser-deps.sh"), dir, "chromium", "webkit"], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env } });
    return { ...result, calls: readFileSync(log, "utf8") };
  };
  const cached = join(scratch, "cached");
  mkdirSync(cached);
  writeFileSync(join(cached, "libwoff1_1.0.2_amd64.deb"), "");
  writeFileSync(join(cached, "libavif16_1.0.4_amd64.deb"), "");
  const hit = run(cached);
  assert.equal(hit.status, 0, hit.stderr);
  assert.match(hit.calls, /^dpkg -i .*libavif16_1\.0\.4_amd64\.deb .*libwoff1_1\.0\.2_amd64\.deb$/m);
  assert.doesNotMatch(hit.calls, /pnpm/);
  // dpkg fails: what it left half done is mended, the cached files go, and Playwright installs them from the network.
  const broken = run(cached, { DPKG: "1" });
  assert.equal(broken.status, 0, broken.stderr);
  assert.match(broken.stdout, /did not install/);
  assert.match(broken.calls, /^dpkg -i .*\ndpkg --configure -a\napt-get -f install -y\n(?:.*\n)*pnpm exec playwright install-deps chromium webkit$/m);
  assert.deepEqual(readdirSync(cached).filter((name) => name.endsWith(".deb")), []);
  // A miss: apt keeps the .deb files it downloads in the folder, for the cache to save.
  const empty = join(scratch, "empty");
  const miss = run(empty);
  assert.equal(miss.status, 0, miss.stderr);
  assert.match(miss.calls, new RegExp(`^tee /etc/apt/apt\\.conf\\.d/90ouro-browser-debs\\nDir::Cache::Archives "${empty.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/";\\nAPT::Keep-Downloaded-Packages "true";\\nBinary::apt::APT::Keep-Downloaded-Packages "true";$`, "m"));
  assert.match(miss.calls, /^pnpm exec playwright install-deps chromium webkit$/m);
  assert.doesNotMatch(miss.calls, /^dpkg /m);
  // A second apt waits for dpkg's lock rather than failing at once, on a hit and on a miss.
  for (const result of [hit, miss]) assert.match(result.calls, /^tee \/etc\/apt\/apt\.conf\.d\/90ouro-dpkg-lock\nDPkg::Lock::Timeout "600";$/m);
  assert.ok(existsSync(join(empty, "partial")));
});

// The repository's scripts, which CI also runs: the .mjs files under scripts/ and site/scripts/, but their tests.
const scriptSources = ["scripts", "site/scripts"].flatMap((folder) =>
  readdirSync(join(root, folder), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs") && !file.includes("node_modules"))
    .map((file) => ({ file: `${folder}/${file}`, text: readFileSync(join(root, folder, file), "utf8") })),
);

test("only network fetches are retried: scripts/retry.sh wraps Playwright's downloads and the registry's validation as GitHub serves it, and nothing else", () => {
  const uses = [...workflows, ...actions].flatMap(({ file, text }) => [...text.matchAll(/scripts\/retry\.sh (.*)/g)].map((match) => `${file}: ${match[1]}`));
  assert.ok(uses.length > 0);
  // The registry's remote validation fetches each of its files from GitHub at this commit; a file
  // that is missing or invalid there fails every try.
  assert.deepEqual(
    uses.filter((use) => !/: pnpm exec playwright install(-deps)? \$BROWSERS$/.test(use) && use !== 'ci.yml: npx --yes $SHADCN registry validate "ourostack/ouro-ui#$REF"'),
    [],
  );
  // A script that downloads the browsers (an array of arguments, as spawn takes) does it through
  // scripts/retry.sh, and passes it nothing else.
  const spawned = scriptSources.flatMap(({ file, text }) => [...text.matchAll(/^.*"scripts\/retry\.sh".*$|^.*"playwright", "install".*$/gm)].map((match) => `${file}: ${match[0].trim()}`));
  assert.ok(spawned.length > 0);
  assert.deepEqual(
    spawned.filter((line) => !/"scripts\/retry\.sh", \["pnpm", "exec", "playwright", "install"(, "--with-deps")?(, "(chromium|webkit)")+\]/.test(line)),
    [],
  );
});

test("scripts/retry.sh runs a failed fetch again after each wait, and fails with its status once the waits run out", () => {
  const work = scratchDir("ouro-retry-");
  const count = join(work, "count");
  // Fails until it has run $PASS_ON times, with status 7.
  const fetch = join(work, "fetch");
  writeFileSync(fetch, `#!/usr/bin/env bash\nn=$(( $(cat "${count}" 2>/dev/null || echo 0) + 1 ))\necho "$n" > "${count}"\n[ "$n" -ge "$PASS_ON" ] || exit 7\n`);
  chmodSync(fetch, 0o755);
  const run = (passOn) => {
    writeFileSync(count, "0");
    const result = spawnSync("bash", [join(root, "scripts/retry.sh"), fetch], { encoding: "utf8", env: { ...process.env, RETRY_DELAYS: "0 0", PASS_ON: String(passOn) } });
    return { ...result, runs: Number(readFileSync(count, "utf8")) };
  };
  const third = run(3);
  assert.equal(third.status, 0);
  assert.equal(third.runs, 3);
  assert.equal(third.stdout.match(/^::warning::.* failed \(try \d of 3\); trying again in 0s\.$/gm)?.length, 2);
  const never = run(4);
  assert.equal(never.status, 7);
  assert.equal(never.runs, 3);
  assert.match(never.stdout, /^::error::.* failed 3 times\.$/m);
  const first = run(1);
  assert.equal(first.status, 0);
  assert.equal(first.runs, 1);
  assert.equal(first.stdout, "");
});

test("only the jobs that push, release.yml's release job and release-rehearsal.yml's rehearse job, keep the checkout's credentials", () => {
  const problems = [];
  for (const { file, text } of workflows) {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!/uses: actions\/checkout@/.test(line)) return;
      const step = lines.slice(index + 1, index + 4).join("\n");
      const persists = !/^\s+persist-credentials: false$/m.test(step);
      const job = lines.slice(0, index).findLast((above) => /^ {2}[\w-]+:$/.test(above))?.trim().slice(0, -1);
      if (persists !== ((file === "release.yml" && job === "release") || (file === "release-rehearsal.yml" && job === "rehearse"))) problems.push(`${file}:${index + 1}`);
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
  assert.match(release, /gh run watch "\$run" --exit-status --interval 30 \|\| \{[^\n]+exit 1; \}\n +gh pr merge "\$NEXT_BRANCH" --squash \|\| true\n/);
  // gh's exit code also fails on local branch cleanup, so the pull request's state decides, and
  // the branch is deleted through the API afterwards.
  assert.doesNotMatch(release, /gh pr merge[^\n]*--delete-branch/);
  assert.match(release, /gh pr view "\$NUMBER" --json state --jq \.state\)" = MERGED/);
  assert.match(release, /gh workflow run ci\.yml --ref main/);
  // Pages deploys main's new tip only after CI on it has run.
  assert.ok(release.indexOf('gh run watch "$ci"') > release.indexOf("gh workflow run ci.yml --ref main"));
  assert.ok(release.indexOf("gh workflow run pages.yml --ref main") > release.indexOf('gh run watch "$ci"'));
});

test("Release takes main's CI from the latest run on its commit: a push, a dispatch on main, or the merge queue's run", () => {
  const release = workflow("release.yml");
  const filter = release.match(/conclusion=\$\(gh run list --workflow ci\.yml --commit "\$sha" --json conclusion,event,headBranch --jq '([^']+)'\)/)?.[1];
  assert.ok(filter, "release.yml reads the runs on main's commit, on any branch");
  // gh run list lists the newest run first.
  const conclusion = (runs) => {
    const result = spawnSync("jq", ["-r", filter], { input: JSON.stringify(runs), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const run = (event, headBranch, conclusion) => ({ event, headBranch, conclusion });
  const queue = "gh-readonly-queue/main/pr-9-abc";
  assert.equal(conclusion([run("push", "main", "success")]), "success");
  // The push run after the queue ran only install-github; it decides, being the latest.
  assert.equal(conclusion([run("push", "main", "success"), run("merge_group", queue, "success")]), "success");
  assert.equal(conclusion([run("push", "main", "failure"), run("merge_group", queue, "success")]), "failure");
  // A queue merge made with the workflow's token starts no push run: the queue's run decides.
  assert.equal(conclusion([run("merge_group", queue, "success")]), "success");
  assert.equal(conclusion([run("workflow_dispatch", queue, "success"), run("pull_request", "fix", "success")]), "success");
  // The run release.yml dispatches on main after merging "Prepare main" (no push run either).
  assert.equal(conclusion([run("workflow_dispatch", "main", "success")]), "success");
  // A pull request's run, or a dispatch on another branch, is not main's CI.
  assert.equal(conclusion([run("pull_request", "fix", "success"), run("workflow_dispatch", "release/v1.0.0", "success")]), "null");
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
  const start = release.search(new RegExp(`^ {6}(- | {2})name: ${name.replace(/[?()]/g, "\\$&")}\n`, "m"));
  assert.notEqual(start, -1, `no step named ${name}`);
  const lines = release.slice(start).split("        run: |\n")[1].split("\n");
  const end = lines.findIndex((line) => line !== "" && !line.startsWith(" ".repeat(10)));
  return lines.slice(0, end === -1 ? undefined : end).map((line) => line.slice(10)).join("\n");
};

const scenarios = ["success", "queued", "queue-rebuilt", "queue-tip", "pr-ci-failed", "ci-failed", "ci-missing", "dispatch-failed", "not-merged", "queue-dropped", "approval-failed", "tip-advanced"];
for (const scenario of scenarios) {
  const passes = ["success", "queued", "queue-rebuilt", "queue-tip"].includes(scenario);
  test(`Release's main CI gate ${passes ? "permits" : "blocks"} Pages (${scenario})`, () => {
    // Execute the workflow's actual shell, substituting only GitHub/network operations: the release
    // job's end of "Prepare main", then the queue job, then the publish job, each job's outputs
    // passed on as GitHub does. gh merge exits non-zero even when state says MERGED, exercising
    // independent readback.
    const prepare = releaseStep("Prepare main for the next release");
    const gate = prepare.slice(prepare.indexOf('if [ -n "$run" ] && gh api'));
    const queue = releaseStep("Pass the merge queue and CI on main");
    const remove = releaseStep("Delete the branch that prepared main");
    const deploy = releaseStep("Deploy Pages and check what is published");
    const fixture = scratchDir("ouro-release-main-gate-");
    const output = join(fixture, "output.txt");
    const summary = join(fixture, "summary.md");
    const looks = join(fixture, "queue-looks.txt");
    writeFileSync(output, "");
    writeFileSync(summary, "");
    writeFileSync(looks, "0");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `
      gh() {
        printf 'CALL %s\\n' "$*" >&2
        case "$*" in
          "api -X POST "*"/approve") [ "$SCENARIO" != approval-failed ] ;;
          "run watch 1 "*) [ "$SCENARIO" != pr-ci-failed ] ;;
          "pr merge "*) return 1 ;;
          "pr view "*"--json number"*) echo 9 ;;
          # gh merge could not queue it (no auto-merge): queued by the API instead, at CI's commit.
          "api graphql -f query=mutation { enqueuePullRequest(input: {pullRequestId: \\"PR_9\\", expectedHeadOid: \\"headsha\\"}) { clientMutationId } }") return 0 ;;
          "pr view "*"--json id"*) echo PR_9 ;;
          # The merge queue, look by look: the release job looks twice, the queue job once before its
          # loop and once a round. Queued, then merged (or dropped) on the queue job's first round;
          # rebuilt: still queued after two rounds, a second build's branch from the second on.
          "api graphql "*)
            looks=$(( $(cat "$QUEUE_LOOKS") + 1 )); echo "$looks" > "$QUEUE_LOOKS"
            case "$SCENARIO:$looks" in
              queued:[1-3]|queue-tip:[1-3]|queue-dropped:[1-3]|queue-rebuilt:[1-5]) echo "OPEN true" ;;
              not-merged:*|queue-dropped:*) echo "OPEN false" ;;
              *) echo "MERGED false" ;;
            esac ;;
          "api repos/ourostack/ouro-ui/rules/branches/main "*) printf '%s\\n' ci "install (shadcn, nova)" install-github lighthouse ;;
          "api repos/ourostack/ouro-ui/git/matching-refs/heads/gh-readonly-queue/main/pr-9-"*)
            refs=$(( $(cat "$QUEUE_LOOKS.refs" 2>/dev/null || echo 0) + 1 )); echo "$refs" > "$QUEUE_LOOKS.refs"
            echo refs/heads/gh-readonly-queue/main/pr-9-abc
            if [ "$SCENARIO" = queue-rebuilt ] && [ "$refs" -ge 2 ]; then echo refs/heads/gh-readonly-queue/main/pr-9-def; fi ;;
          "workflow run ci.yml --ref gh-readonly-queue/main/pr-9-"*) return 0 ;;
          # The dispatched runs on the queue's branches, finished, and their jobs.
          "run list --workflow ci.yml --branch gh-readonly-queue/main/pr-9-abc "*) echo "7 completed 1111111111111111111111111111111111111111" ;;
          "run list --workflow ci.yml --branch gh-readonly-queue/main/pr-9-def "*) echo "8 completed 2222222222222222222222222222222222222222" ;;
          "api repos/ourostack/ouro-ui/actions/runs/7/jobs"*) printf 'ci\\tsuccess\\ninstall (shadcn, nova)\\tsuccess\\ninstall-github\\tskipped\\nlighthouse\\tsuccess\\nplan\\tsuccess\\n' ;;
          "api repos/ourostack/ouro-ui/actions/runs/8/jobs"*) printf 'ci\\tfailure\\nlighthouse\\tskipped\\n' ;;
          "api -X POST repos/ourostack/ouro-ui/statuses/"*) return 0 ;;
          "pr view "*"--json state"*) if [ "$SCENARIO" = not-merged ] || [ "$SCENARIO" = queue-dropped ]; then echo OPEN; else echo MERGED; fi ;;
          "pr view "*"--json body"*) echo body ;;
          "pr edit "*|"api -X DELETE "*) return 0 ;;
          # Main fast-forwarded to the queue's commit, or moved past it.
          "api "*"commits/main"*) if [ "$SCENARIO" = queue-tip ]; then echo 1111111111111111111111111111111111111111; else echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; fi ;;
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
      seq() { printf '%s\\n' 1 2 3 4 5; }
      sleep() { :; }
      node() { printf 'PUBLISHED %s\\n' "$*"; }
      run=1
      sha=headsha
      pages=0
      ${gate}
      NUMBER=$(sed -n 's/^number=//p' "$GITHUB_OUTPUT")
      ${queue}
      VERIFIED_MAIN_SHA=$(sed -n 's/^main_sha=//p' "$GITHUB_OUTPUT")
      if [ "$SCENARIO" = tip-advanced ]; then VERIFIED_MAIN_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; fi
      ${remove}
      ${deploy}
    `], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, SCENARIO: scenario, NEXT_BRANCH: "prepare/after-v9.9.9", TAG: "v9.9.9", GITHUB_REPOSITORY: "ourostack/ouro-ui", GITHUB_SERVER_URL: "https://github.com", GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output, QUEUE_LOOKS: looks },
    });
    assert.doesNotMatch(result.stderr, /Unexpected gh call:/);
    // Queued by the API only while gh left the pull request open and out of the queue, a few times.
    const enqueued = result.stderr.match(/^CALL api graphql -f query=mutation \{ enqueuePullRequest.*$/gm) ?? [];
    assert.equal(enqueued.length, scenario === "not-merged" ? 5 : 0, "enqueuePullRequest");
    if (scenario.startsWith("queue")) {
      // Queued by the workflow's token: CI runs on the queue's branch by dispatch, once on each
      // build's branch, however often the branches are looked at.
      const dispatched = result.stderr.match(/^CALL workflow run ci\.yml --ref gh-readonly-queue\/.+$/gm);
      assert.deepEqual(dispatched, ["CALL workflow run ci.yml --ref gh-readonly-queue/main/pr-9-abc", ...(scenario === "queue-rebuilt" ? ["CALL workflow run ci.yml --ref gh-readonly-queue/main/pr-9-def"] : [])]);
      // The queue counts no check of a dispatched run (probe #142), so each finished run's required
      // checks, and only those, are reported once as commit statuses on the commit the queue builds:
      // a job of that name that passed, or one of the jobs that skip there by design; anything else,
      // a missing job included, fails.
      const statuses = result.stderr.match(/^CALL api -X POST repos\/ourostack\/ouro-ui\/statuses\/.+$/gm).map((line) => line.replace(/ -f target_url=\S+ -f description=.*$/, ""));
      const posted = (sha, entries) => entries.map(([state, context]) => `CALL api -X POST repos/ourostack/ouro-ui/statuses/${sha} -f state=${state} -f context=${context}`);
      assert.deepEqual(statuses, [
        ...posted("1111111111111111111111111111111111111111", [["success", "ci"], ["success", "install (shadcn, nova)"], ["success", "install-github"], ["success", "lighthouse"]]),
        ...(scenario === "queue-rebuilt" ? posted("2222222222222222222222222222222222222222", [["failure", "ci"], ["failure", "install (shadcn, nova)"], ["failure", "install-github"], ["failure", "lighthouse"]]) : []),
      ]);
      assert.match(result.stderr, /-f target_url=https:\/\/github\.com\/ourostack\/ouro-ui\/actions\/runs\/7 -f description=CI run 7 on the merge queue's branch: success$/m);
      if (scenario === "queue-rebuilt") assert.match(result.stderr, /-f context=install \(shadcn, nova\) -f target_url=\S+ -f description=CI run 8 on the merge queue's branch: no such job$/m);
      assert.match(result.stderr, /CALL api graphql -f query=query \{ repository\(owner: "ourostack", name: "ouro-ui"\) \{ pullRequest\(number: 9\) \{ state isInMergeQueue \} \} \}/);
    } else {
      assert.doesNotMatch(result.stderr, /gh-readonly-queue/);
    }
    // Main whose tip is the queue's passing commit needs no CI run of its own.
    assert.equal(/CALL workflow run ci\.yml --ref main/.test(result.stderr), passes && scenario !== "queue-tip" || ["ci-failed", "ci-missing", "dispatch-failed", "tip-advanced"].includes(scenario));
    if (passes) {
      assert.equal(result.status, 0, result.stderr);
      assert.match(readFileSync(output, "utf8"), new RegExp(`^main_sha=${scenario === "queue-tip" ? "1{40}" : "a{40}"}$`, "m"));
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
  assert.match(release, /VERIFIED_MAIN_SHA: \$\{\{ needs\.queue\.outputs\.main_sha \}\}/);
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

test("a push to main whose commit the merge queue already tested runs only install-github", () => {
  const jobs = ciJobs();
  assert.match(jobs.plan, /^ {6}- id: tested\n {8}name: Did the merge queue test this commit\?\n {8}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\n/m);
  assert.match(jobs.plan, /^ {6}tested: \$\{\{ steps\.tested\.outputs\.tested \}\}$/m);
  assert.match(jobs.plan, /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n/m);
  // The step's own script and jq filter, over the runs the API lists on the commit.
  const script = stepScript(jobs.plan, "Did the merge queue test this commit?");
  const dir = scratchDir("ouro-queue-tested-");
  const check = (runs, ghStatus = 0) => {
    const output = join(dir, `output-${Math.random()}.txt`);
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `gh() { [ "$GH_STATUS" = 0 ] || return "$GH_STATUS"; printf '%s' "$RUNS" | jq "\${@: -1}"; }\n${script}`], {
      encoding: "utf8",
      env: { ...process.env, RUNS: JSON.stringify({ workflow_runs: runs }), GH_STATUS: String(ghStatus), GITHUB_OUTPUT: output, REPO: "o/r", SHA: "abc" },
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(output, "utf8").trim();
  };
  const run = (event, head_branch) => ({ event, head_branch, head_sha: "abc", conclusion: "success" });
  assert.equal(check([run("merge_group", "gh-readonly-queue/main/pr-9-abc")]), "tested=true");
  assert.equal(check([run("workflow_dispatch", "gh-readonly-queue/main/pr-9-abc")]), "tested=true");
  // Only the merge queue's runs count: a pull request's run tested its merge with an older main.
  assert.equal(check([run("pull_request", "fix"), run("workflow_dispatch", "release/v1.0.0")]), "");
  assert.equal(check([]), "");
  // When the API cannot answer, everything runs.
  assert.equal(check([run("merge_group", "gh-readonly-queue/main/pr-9-abc")], 1), "");
  // Every job but the plan, the GitHub install and the release-only install skips on it, gates
  // included; motion-coverage waits on ci. Nothing else reads it.
  const condition = (block) => block.match(/^ {4}if: (.+)$/m)?.[1];
  const skipping = Object.keys(jobs).filter((id) => condition(jobs[id]) === untested);
  assert.deepEqual(skipping.sort(), Object.keys(jobs).filter((id) => !["plan", "install-github", "install-latest", "motion-coverage"].includes(id)).sort());
  assert.match(jobs["motion-coverage"], /^ {4}needs: \[ci\]$/m);
  assert.doesNotMatch(jobs["install-github"], /tested/);
  for (const id of skipping) assert.match(jobs[id], /^ {4}needs: \[plan[\],]/m, `${id} needs the plan`);
  const runs = (tested) => runInNewContext(untested.slice(4, -3).replace("!cancelled()", "true").replace("needs.plan.outputs.tested", "value"), { value: tested });
  // A plan that failed or never ran leaves the output empty: everything runs.
  assert.deepEqual(["", "true"].map(runs), [true, false]);
});

test("every job that reads the plan runs whatever happened to it, and runs everything unless it says full=false", () => {
  const jobs = ciJobs();
  // ci-budget reads it too, in its step's env (the budget job's own test).
  const readers = Object.keys(jobs).filter((name) => /^ {6}FULL: \$\{\{ needs\.plan\.outputs\.full/m.test(jobs[name]));
  assert.deepEqual(readers.sort(), ["browser", "ci", "conformance-shard", "e2e-shard", "install-shard", "themes"]);
  for (const name of readers) {
    const needs = jobs[name].match(/^ {4}needs: \[([^\]]*)\]\n {4}if: \$\{\{ !cancelled\(\) && needs\.plan\.outputs\.tested != 'true' \}\}$/m)?.[1].split(",").map((need) => need.trim());
    assert.ok(needs?.includes("plan"), `${name} needs plan and runs unless the run was cancelled`);
    const full = jobs[name].match(/^ {6}FULL: \$\{\{ (.+) \}\}$/m)?.[1];
    assert.equal(full, "needs.plan.outputs.full != 'false'", name);
    // A plan that failed or never ran leaves the output empty: everything runs.
    for (const [value, expected] of [["", true], ["true", true], ["false", false]]) {
      assert.equal(runInNewContext(full.replace("needs.plan.outputs.full", "value"), { value }), expected, `${name} with full=${JSON.stringify(value)}`);
    }
  }
});

/** The values of a matrix key in a job's block, or undefined. */
const matrixValues = (block, key) => block.match(new RegExp(`^ {8}${key}: \\[([^\\]]*)\\]$`, "m"))?.[1].split(",").map((value) => value.trim());

/** Every name a job's checks report: its name with each combination of its matrix, less the excluded ones. */
function checkNames(block, id) {
  const name = block.match(/^ {4}name: (.+)$/m)?.[1] ?? id;
  const keys = [...name.matchAll(/\$\{\{ matrix\.(\w+) \}\}/g)].map((match) => match[1]);
  let combinations = [{}];
  for (const key of keys) combinations = combinations.flatMap((combination) => (matrixValues(block, key) ?? []).map((value) => ({ ...combination, [key]: value })));
  const excluded = [...(block.split(/^ {8}exclude:\n/m)[1] ?? "").matchAll(/^ {10}- (\w+): (\S+)\n {12}(\w+): (\S+)$/gm)].map(([, k1, v1, k2, v2]) => ({ [k1]: v1, [k2]: v2 }));
  combinations = combinations.filter((combination) => !excluded.some((exclusion) => Object.entries(exclusion).every(([key, value]) => combination[key] === value)));
  return combinations.map((combination) => keys.reduce((text, key) => text.replace(`\${{ matrix.${key} }}`, combination[key]), name));
}

/** The condition of every job a push the merge queue already tested skips (the plan's `tested`). */
const untested = "${{ !cancelled() && needs.plan.outputs.tested != 'true' }}";

/** The checks the main ruleset requires (ruleset 24881709, .github/required-checks.json). */
const requiredChecks = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));

test("every required check is still a job that reports, under the name the ruleset requires", () => {
  const jobs = ciJobs();
  const names = new Map();
  for (const [id, block] of Object.entries(jobs)) {
    for (const name of checkNames(block, id)) {
      assert.ok(!names.has(name), `${name} is reported by both ${names.get(name)} and ${id}`);
      names.set(name, id);
    }
    // A job a required check names never skips itself on a pull request or in the merge queue: at
    // most it runs whatever its needs did, and skips only on a push the merge queue already tested.
    const condition = block.match(/^ {4}if: (.+)$/m)?.[1];
    if (!["install-github", "install-latest", "plan"].includes(id)) assert.ok(!condition || condition === untested, `${id} has if: ${condition}`);
  }
  // The ruleset's required checks, which the claims check also reads (verify:ciJob accepts only these).
  for (const check of requiredChecks) assert.ok(names.has(check), `${check} is not among ${[...names.keys()].join(", ")}`);
  assert.deepEqual(checkNames(jobs["install-shard"], "install-shard"), ["install (shadcn, nova, 1/2)", "install (shadcn, nova, 2/2)", "install (shadcn, vega, 1/2)", "install (shadcn, vega, 2/2)", "install (ouro, nova, 1/2)", "install (ouro, nova, 2/2)"]);
  // conformance and mutation report under the names the ruleset will require once this workflow is on main.
  for (const check of ["conformance", "mutation"]) assert.ok(names.has(check), `${check} is not among ${[...names.keys()].join(", ")}`);
});

test("the required ci job runs the claims ratchet on a pull request, against its base, with its description", () => {
  const block = ciJobs().checks;
  const step = block.slice(block.search(/^ {6}- name: Claims\n/m)).split(/\n {6}- /)[0];
  assert.match(step, /^ {10}PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}$/m);
  const script = `git() { printf 'CALL git %s\\n' "$*" >&2; }\n${stepScript(block, "Claims")}`;
  const pull = runStep(script, { BASE_REF: "main" });
  assert.equal(pull.status, 0);
  assert.match(pull.calls, /^CALL git fetch --no-tags --depth=1 origin main\nCALL node scripts\/claims\.mjs ratchet\nCALL node scripts\/real-clock-ratchet\.mjs\nCALL pnpm claims:check --network=changed$/m);
  // A failing ratchet fails the job.
  assert.notEqual(runStep(script, { BASE_REF: "main" }, { nodeStatus: 1 }).status, 0);
  assert.doesNotMatch(runStep(script, { BASE_REF: "" }).calls, /ratchet/);
  assert.ok(JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8")).includes("ci"));
});

/** A matrix job's shard count, from its `shard` list, which must count 1 to n. */
function shardCount(block) {
  const shards = matrixValues(block, "shard").map(Number);
  assert.deepEqual(shards, shards.map((_, index) => index + 1));
  return shards.length;
}

test("each browser shard runs its share of every browser test, or of the reduced run, then its share of the installed subsets", () => {
  const block = ciJobs().browser;
  const count = shardCount(block);
  assert.match(block, new RegExp(`^ {4}name: browser \\(\\$\\{\\{ matrix\\.shard \\}\\}/${count}\\)$`, "m"));
  assert.match(block, new RegExp(`^ {6}SHARD: \\$\\{\\{ matrix\\.shard \\}\\}/${count}$`, "m"));
  const script = stepScript(block, "Browser tests");
  const full = runStep(script, { FULL: "true", COMPONENTS: "", SHARD: "2/6" });
  assert.equal(full.status, 0);
  assert.match(full.calls, /^CALL pnpm exec vitest run --coverage --shard=2\/6$/m);
  const reduced = runStep(script, { FULL: "false", COMPONENTS: "checkbox,checkbox-group", SHARD: "2/6" });
  assert.match(reduced.calls, /^CALL node scripts\/test-impact\.mjs vitest checkbox,checkbox-group --shard 2\/6$/m);
  assert.doesNotMatch(reduced.calls, /CALL pnpm/);
  const subsets = stepScript(block, "Coverage of installed subsets");
  assert.match(runStep(subsets, { FULL: "true", SHARD: "2/6" }).calls, /^CALL node scripts\/subset-coverage\.mjs --shard 2\/6$/m);
  assert.match(runStep(subsets, { FULL: "false", COMPONENTS: "checkbox", SHARD: "2/6" }).calls, /^CALL node scripts\/subset-coverage\.mjs --touching checkbox --shard 2\/6$/m);
  // Its coverage and timings go up for the ci job and the next split.
  assert.match(block, /^ {10}name: coverage-browser-\$\{\{ matrix\.shard \}\}\n {10}path: coverage\/coverage-final\.json\n/m);
  assert.match(block, /^ {10}name: timings-browser-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/timings\/\n/m);
});

test("the script test shards run every file of pnpm test:scripts between them", async () => {
  const block = ciJobs().scripts;
  const count = shardCount(block);
  assert.match(block, new RegExp(`^ {6}SHARD: \\$\\{\\{ matrix\\.shard \\}\\}/${count}$`, "m"));
  assert.match(block, new RegExp(`^ {6}TIMINGS: \\.tmp/timings/scripts-\\$\\{\\{ matrix\\.shard \\}\\}of${count}\\.json$`, "m"));
  assert.match(stepScript(block, "Script tests"), /^node scripts\/run-script-tests\.mjs --test-reporter=spec --test-reporter-destination=stdout --test-reporter=\.\/scripts\/timings-node-reporter\.mjs --test-reporter-destination="\$TIMINGS" \$\(node scripts\/shard\.mjs scripts "\$SHARD"\)$/m);
  const { readTimings, scriptTestFiles, shardKeys } = await import("./shard.mjs");
  const all = Array.from({ length: count }, (_, index) => shardKeys(scriptTestFiles(), { index: index + 1, count }, readTimings("scripts"))).flat();
  assert.deepEqual(all.sort(), scriptTestFiles().sort());
});

test("the ci check passes only when its parts passed and the browser shards' merged coverage reaches 100%, or the full suite decides", () => {
  const jobs = ciJobs();
  const block = jobs.ci;
  assert.match(block, /^ {4}needs: \[plan, checks, browser, scripts\]$/m);
  const parts = stepScript(block, "Every part passed");
  assert.equal(runStep(parts, { CHECKS: "success", BROWSER: "success", SCRIPTS: "success" }).status, 0);
  for (const failed of [{ BROWSER: "failure" }, { CHECKS: "cancelled" }, { SCRIPTS: "skipped" }]) {
    const result = runStep(parts, { CHECKS: "success", BROWSER: "success", SCRIPTS: "success", ...failed });
    assert.equal(result.status, 1, JSON.stringify(failed));
    assert.match(result.stdout, /^::error::The \w+ jobs did not pass/m);
  }
  assert.equal(block.match(/^ {6}BROWSER_SHARDS: (\d+)$/m)?.[1], String(shardCount(jobs.browser)));
  const coverage = stepScript(block, "Browser test coverage");
  const full = runStep(coverage, { FULL: "true", RUNNER_TEMP: "/r", BROWSER_SHARDS: "6" });
  assert.match(full.calls, /^CALL node scripts\/coverage-merge\.mjs \/r\/coverage --shards 6$/m);
  assert.deepEqual(full.output, { reduced: "false", stems: "", fallback: "false" });
  const reduced = runStep(coverage, { FULL: "false", COMPONENTS: "checkbox", RUNNER_TEMP: "/r", BROWSER_SHARDS: "6" });
  assert.match(reduced.calls, /^CALL node scripts\/test-impact\.mjs coverage \/r\/coverage checkbox --shards 6$/m);
  assert.match(block, /^ {6}reduced: \$\{\{ steps\.tests\.outputs\.reduced \}\}\n {6}stems: \$\{\{ steps\.tests\.outputs\.stems \}\}\n {6}fallback: \$\{\{ steps\.tests\.outputs\.fallback \}\}$/m);
  assert.match(block, /^ {10}pattern: coverage-browser-\*\n {10}path: \$\{\{ runner\.temp \}\}\/coverage\n/m);
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

test("the conformance shards run only the checks' proofs on the first shard when a pull request changes no component, and check only the selected stories, every nth per shard", () => {
  const block = ciJobs()["conformance-shard"];
  const affected = stepScript(block, "Is any story affected?");
  const none = runStep(affected, { FULL: "false", COMPONENTS: "", SHARD: "2" });
  assert.equal(none.status, 0);
  assert.equal(none.output.run, "false");
  assert.match(none.stdout, /^Not affected: /m);
  assert.equal(runStep(affected, { FULL: "false", COMPONENTS: "", SHARD: "1" }).output.run, "proofs");
  assert.equal(runStep(affected, { FULL: "false", COMPONENTS: "dialog", SHARD: "2" }).output.run, "true");
  assert.equal(runStep(affected, { FULL: "true", COMPONENTS: "", SHARD: "3" }).output.run, "true");
  const later = block.slice(block.indexOf("name: Is any story affected?")).split(/\n {6}- /).slice(1);
  for (const step of later) assert.match(step, /^if: (steps\.affected\.outputs\.run (==|!=) '(true|false|proofs)'|failure\(\))$/m, step);
  const run = stepScript(block, "Conformance");
  assert.match(runStep(run, { FULL: "true" }).calls, /CALL pnpm conformance\nOURO_STORIES=unset/);
  assert.match(runStep(run, { FULL: "false", COMPONENTS: "checkbox-group" }).calls, /CALL pnpm conformance\nOURO_STORIES=checkbox$/m);
  assert.match(block, /^ {8}name: The checks prove they can fail\n {8}run: pnpm conformance -t "can fail"$/m);
  // The shard is the matrix entry over the matrix's size, and the job's name says the same count.
  assert.match(block, /^ {10}OURO_CONFORMANCE_SHARD: \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/m);
  const shards = block.match(/^ {8}shard: \[([^\]]*)\]$/m)[1].split(",").map((value) => Number(value.trim()));
  assert.deepEqual(shards, shards.map((_, index) => index + 1));
  assert.match(block, new RegExp(`^ {4}name: conformance \\(\\$\\{\\{ matrix\\.shard \\}\\}/${shards.length}\\)$`, "m"));
});

test("conformance and mutation are each one check over their shards, which passes only when every shard passed", () => {
  const jobs = ciJobs();
  for (const [check, needs] of [["conformance", "plan, conformance-shard"], ["mutation", "plan, mutation-plan, mutation-shard"]]) {
    assert.match(jobs[check], new RegExp(`^ {4}needs: \\[${needs}\\]\n {4}if: ${untested.replace(/[$(){}!.]/g, "\\$&")}$`, "m"), check);
    const script = stepScript(jobs[check], "Every shard passed");
    assert.equal(runStep(script, { RESULT: "success" }).status, 0, check);
    for (const result of ["failure", "cancelled", "skipped"]) assert.notEqual(runStep(script, { RESULT: result }).status, 0, `${check} with ${result}`);
  }
});

test("the mutation plan keys the kept results by pull request and dependency hash, and runs five shards without them, three with", () => {
  const block = ciJobs()["mutation-plan"];
  const key = stepScript(block, "The cache key's prefix");
  const pull = runStep(key, { EVENT: "pull_request", PR: "139" });
  assert.match(pull.calls, /^CALL node scripts\/mutation\/cache\.mjs key HEAD\^1$/m);
  assert.equal(pull.output.key, "stryker-139--");
  assert.equal(runStep(key, { EVENT: "merge_group", PR: "" }).output.key, "");
  assert.match(block, /^ {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}path: \.tmp\/stryker-incremental\.json\n {10}key: \$\{\{ steps\.key\.outputs\.key \}\}\$\{\{ github\.sha \}\}\n {10}restore-keys: \$\{\{ steps\.key\.outputs\.key \}\}\n {10}lookup-only: true$/m);
  const count = stepScript(block, "How many shards");
  assert.deepEqual(runStep(count, { KEY: "stryker-139-abc-", MATCHED: "" }).output, { count: "5", shards: "[1,2,3,4,5]" });
  assert.deepEqual(runStep(count, { KEY: "stryker-139-abc-", MATCHED: "stryker-139-abc-f00" }).output, { count: "3", shards: "[1,2,3]" });
  assert.deepEqual(runStep(count, { KEY: "", MATCHED: "" }).output, { count: "3", shards: "[1,2,3]" });
});

test("the mutation shards mutate a pull request's changed runtime lines, split by file, start from the kept results, and report nothing to mutate otherwise", () => {
  const block = ciJobs()["mutation-shard"];
  const changed = stepScript(block, "Is any runtime source changed?");
  assert.equal(runStep(changed, { EVENT: "push" }).output.run, "false");
  assert.equal(runStep(changed, { EVENT: "merge_group" }).output.run, "false");
  const later = block.slice(block.indexOf("name: Is any runtime source changed?")).split(/\n {6}- /).slice(1);
  for (const step of later) assert.match(step, /^(?:if: steps\.changed\.outputs\.run == 'true'|if: \$\{\{ !cancelled\(\) && steps\.changed\.outputs\.run == 'true' \}\})$/m, step);
  assert.match(block, /^ {8}name: Mutation testing\n {8}run: pnpm mutation HEAD\^1 --shard "\$SHARD\/\$COUNT"$/m);
  assert.match(block, /^ {4}needs: \[plan, mutation-plan\]$/m);
  assert.match(block, /^ {8}shard: \$\{\{ fromJSON\(needs\.mutation-plan\.outputs\.shards\) \}\}$/m);
  assert.match(block, /^ {6}COUNT: \$\{\{ needs\.mutation-plan\.outputs\.count \}\}$/m);
  assert.match(block, /^ {4}name: mutation \(\$\{\{ matrix\.shard \}\}\/\$\{\{ needs\.mutation-plan\.outputs\.count \}\}\)$/m);
  assert.match(block, /uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}path: \.tmp\/stryker-incremental\.json\n {10}key: \$\{\{ needs\.mutation-plan\.outputs\.key \}\}\$\{\{ github\.sha \}\}\n/);
  // A shard never saves on its own: the mutation job keeps the merged file.
  assert.doesNotMatch(block, /actions\/cache(?:\/save)?@/);
  assert.match(block, /uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}name: stryker-incremental-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/stryker-incremental\.json\n/);
  assert.match(block, /- uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}persist-credentials: false\n(?: {10}#.*\n)* {10}fetch-depth: 2\n/);
});

test("the mutation job merges the shards' results and keeps them under the plan's key on a pull request, and never fails for the cache", () => {
  const block = ciJobs().mutation;
  const steps = block.slice(block.indexOf("    steps:")).split(/\n {6}- /).slice(1);
  const last = steps.at(-1);
  assert.match(last, /^name: Every shard passed$/m);
  for (const step of steps.slice(0, -1)) {
    assert.match(step, /^if: (?:env\.KEY != ''|\$\{\{ env\.KEY != '' && hashFiles\('\.tmp\/stryker-incremental\.json'\) != '' \}\})$/m, step);
    assert.match(step, /^ {8}continue-on-error: true$/m, step);
  }
  assert.match(block, /run: node scripts\/mutation\/cache\.mjs merge \.tmp\/stryker-incremental\.json \.tmp\/shards\/\*\/stryker-incremental\.json/);
  assert.match(block, /uses: actions\/cache\/save@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}path: \.tmp\/stryker-incremental\.json\n {10}key: \$\{\{ env\.KEY \}\}\$\{\{ github\.sha \}\}$/m);
});

test("the e2e shards run every spec, or the selected components' and the site's, and the e2e check passes when they all did", async () => {
  const jobs = ciJobs();
  const block = jobs["e2e-shard"];
  const count = shardCount(block);
  assert.match(block, new RegExp(`^ {6}SHARD: \\$\\{\\{ matrix\\.shard \\}\\}/${count}$`, "m"));
  const script = stepScript(block, "End-to-end specs");
  // A full run: the spec files the shard's measured share holds (the stand-in for node prints two).
  const full = runStep(script, { FULL: "true", SHARD: "1/3" });
  assert.match(full.calls, /^CALL node scripts\/shard\.mjs e2e 1\/3\nCALL pnpm test:e2e registry\/ouro\/e2e\/ouro\/checkbox\.spec\.ts site\/e2e\/$/m);
  assert.match(block, new RegExp(`^ {6}OURO_E2E_TIMINGS: \\.tmp/timings/e2e-\\$\\{\\{ matrix\\.shard \\}\\}of${count}\\.json$`, "m"));
  assert.match(block, /^ {10}name: timings-e2e-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/timings\/\n/m);
  // Between them, the shards run every spec file once.
  const { e2eFiles, readTimings, shardKeys } = await import("./shard.mjs");
  const shares = Array.from({ length: count }, (_, index) => shardKeys(e2eFiles(), { index: index + 1, count }, readTimings("e2e")));
  assert.deepEqual(shares.flat().sort(), e2eFiles());
  assert.ok(shares.every((share) => share.length > 0));
  assert.match(runStep(script, { FULL: "false", COMPONENTS: "checkbox", SHARD: "1/4" }).calls, /^CALL pnpm test:e2e --pass-with-no-tests --shard=1\/4 registry\/ouro\/e2e\/ouro\/checkbox\.spec\.ts site\/e2e\/$/m);
  assert.match(jobs.e2e, /^ {4}needs: \[plan, e2e-shard\]$/m);
  const gate = stepScript(jobs.e2e, "Every shard passed");
  assert.equal(runStep(gate, { SHARDS: "success" }).status, 0);
  assert.equal(runStep(gate, { SHARDS: "failure" }).status, 1);
});

test("an install shard runs its share of the shipped tests by measured time, or a reduced run's, and its variant's check counts every shard's marker", () => {
  const jobs = ciJobs();
  const block = jobs["install-shard"];
  const count = shardCount(block);
  assert.match(block, new RegExp(`^ {6}OURO_SHARD: \\$\\{\\{ matrix\\.shard \\}\\}/${count}$`, "m"));
  const script = stepScript(block, "Install test");
  // `show` stands for install-test.sh: it prints whether OURO_COMPONENTS is set, and to what.
  const scriptWithShow = (env) => {
    const scratch = scratchDir("ouro-install-step-");
    const show = 'show() { if [ -n "${OURO_COMPONENTS+set}" ]; then echo "components=[$OURO_COMPONENTS] $*"; else echo "components=unset $*"; fi; }';
    const result = spawnSync("bash", ["-e", "-c", `${show}\n${script.replace("scripts/install-test.sh", "show")}`], { cwd: root, encoding: "utf8", env: { ...process.env, ...env, RUNNER_TEMP: scratch, PASSED: "install-passed-shadcn-nova-2" } });
    return { ...result, scratch };
  };
  const full = scriptWithShow({ FULL: "true", COMPONENTS: "", VARIANT: "shadcn", REF: "abc" });
  assert.equal(full.status, 0, full.stderr);
  assert.match(full.stdout, /^components=unset shadcn .+\/app abc$/m);
  assert.equal(readFileSync(join(full.scratch, "passed/install-passed-shadcn-nova-2"), "utf8").trim(), "install-passed-shadcn-nova-2");
  assert.match(scriptWithShow({ FULL: "false", COMPONENTS: "", VARIANT: "ouro", REF: "abc" }).stdout, /^components=\[\] ouro /m);
  assert.match(scriptWithShow({ FULL: "false", COMPONENTS: "dialog,sheet", VARIANT: "ouro", REF: "abc" }).stdout, /^components=\[dialog,sheet\] ouro /m);
  // The variant's check: its marker for every shard.
  const gate = jobs["install-gate"];
  assert.match(gate, /^ {4}needs: \[plan, install-shard\]$/m);
  assert.deepEqual(checkNames(gate, "install-gate"), ["install (shadcn, nova)", "install (shadcn, vega)", "install (ouro, nova)"]);
  assert.match(gate, /^ {10}pattern: install-passed-\$\{\{ matrix\.variant \}\}-\$\{\{ matrix\.preset \}\}-\*\n/m);
  const counting = stepScript(gate, "Every shard passed");
  assert.match(counting, new RegExp(`^for shard in ${Array.from({ length: count }, (_, index) => index + 1).join(" ")}; do$`, "m"));
  const markers = scratchDir("ouro-install-gate-");
  mkdirSync(join(markers, "passed"));
  writeFileSync(join(markers, "passed/install-passed-shadcn-vega-1"), "");
  const passed = { RUNNER_TEMP: markers, VARIANT: "shadcn", PRESET: "vega", SHARDS: "success" };
  assert.match(gate, /^ {10}SHARDS: \$\{\{ needs\.install-shard\.result \}\}$/m);
  const missing = runStep(counting, passed);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^::error::install \(shadcn, vega, 2\/2\) did not pass/m);
  writeFileSync(join(markers, "passed/install-passed-shadcn-vega-2"), "");
  assert.equal(runStep(counting, passed).status, 0);
  // Every marker, but from an earlier attempt: this attempt's failed shard still fails the check.
  const rerun = runStep(counting, { ...passed, SHARDS: "failure" });
  assert.equal(rerun.status, 1);
  assert.match(rerun.stdout, /^::error::an install shard of this attempt did not pass \(failure\)/m);
});

test("install-test.sh splits and narrows only the shipped tests, from OURO_SHARD and OURO_COMPONENTS", async () => {
  const install = readFileSync(join(root, "scripts/install-test.sh"), "utf8");
  const tail = install.slice(install.indexOf("# The shipped tests to run:"));
  // The install, type check and build come before, whatever the settings.
  assert.ok(install.indexOf('node "$root/scripts/install-check.mjs" "$app" "$variant" tests') < install.indexOf("# The shipped tests to run:"));
  const run = (env, files = [], more = "") => {
    const scratch = scratchDir("ouro-install-tail-");
    for (const file of files) {
      mkdirSync(join(scratch, dirname(file)), { recursive: true });
      writeFileSync(join(scratch, file), "");
    }
    const stubs = `npx() { echo "npx $*"; }\n${more}`;
    return spawnSync("bash", ["-e", "-u", "-o", "pipefail", "-c", `${stubs}\nroot=${JSON.stringify(root)}\n${tail}`], { cwd: scratch, encoding: "utf8", env: { ...process.env, CI: "", ...env } });
  };
  const all = run({});
  assert.equal(all.status, 0, all.stderr);
  // A full run, sharded or not, fails when it finds no test.
  assert.match(all.stdout, /^npx vitest run$/m);
  assert.match(all.stdout, /^npx playwright test --fully-parallel e2e\/ouro$/m);
  // A full run's shard: the app's shipped Vitest files its measured times give it, not Vitest's split.
  const shipped = ["src/components/ouro/button/button.test.tsx", "src/components/ouro/button/button.touch.test.tsx", "src/components/ouro/dialog/dialog.test.tsx", "src/lib/ouro/cn.test.ts", "src/components/ouro/button/button.visual.test.tsx", "src/app.test.tsx"];
  const specs = ["e2e/ouro/dialog.spec.ts", "e2e/ouro/menu.spec.ts", "e2e/ouro/timer.spec.ts", "e2e/ouro-fixtures.ts"];
  const shard = run({ OURO_SHARD: "2/2" }, [...shipped, ...specs]);
  assert.equal(shard.status, 0, shard.stderr);
  const { installShard, installSpecShard } = await import("./shard.mjs");
  const mine = installShard(shipped.slice(0, 4), { index: 2, count: 2 });
  const mySpecs = installSpecShard(specs.slice(0, 3), { index: 2, count: 2 });
  assert.ok(mine.length > 0 && mySpecs.length > 0);
  const escaped = (paths) => paths.join(" ").replace(/[.]/g, "\\.");
  assert.match(shard.stdout, new RegExp(`^npx vitest run ${escaped(mine)}$`, "m"));
  assert.match(shard.stdout, new RegExp(`^npx playwright test --fully-parallel ${escaped(mySpecs)}$`, "m"));
  const empty = run({ OURO_SHARD: "2/2" });
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /Shard 2\/2 has no shipped test file to run/);
  const noSpecs = run({ OURO_SHARD: "2/2" }, shipped);
  assert.equal(noSpecs.status, 1);
  assert.match(noSpecs.stdout, /Shard 2\/2 has no shipped spec to run/);
  assert.doesNotMatch(all.stdout + shard.stdout, /pass-?with-?no-?tests/i);
  const none = run({ OURO_COMPONENTS: "" });
  assert.equal(none.status, 0);
  assert.doesNotMatch(none.stdout, /npx vitest/);
  assert.match(none.stdout, /no component selected/);
  // The browsers' system packages from the background install: waited for, however long it takes,
  // then not installed again. An app's install --with-deps runs apt beside it: on #169's run
  // 39759795561 the background apt outlasted a 15-minute wait and the two raced for dpkg's lock.
  const scratch = scratchDir("ouro-install-deps-");
  const status = join(scratch, "deps.status");
  writeFileSync(status, "0\n");
  assert.match(run({ CI: "1", OURO_BROWSER_DEPS: status }).stdout, /^npx playwright install chromium webkit$/m);
  // Still running: the status lands only after many more polls than any fixed bound.
  const late = join(scratch, "late.status");
  // 500 polls of 2 seconds: past the 15 minutes the old wait gave up at.
  const slow = run({ CI: "1", OURO_BROWSER_DEPS: late, LATE: late }, [], 'polls=0\nsleep() { polls=$((polls + 1)); [ "$polls" -lt 500 ] || { echo 0 > "$LATE"; echo "polled $polls times"; }; }');
  assert.equal(slow.status, 0, slow.stderr);
  assert.match(slow.stdout, /^polled 500 times$/m);
  assert.match(slow.stdout, /^npx playwright install chromium webkit$/m);
  // It failed: the system packages are installed here, once it has finished, and the browsers without them.
  writeFileSync(status, "100\n");
  const failed = run({ CI: "1", OURO_BROWSER_DEPS: status });
  assert.match(failed.stdout, /did not install them; installing them here/);
  assert.match(failed.stdout, /^npx playwright install-deps chromium webkit$[\s\S]*^npx playwright install chromium webkit$/m);
  for (const result of [slow, failed]) assert.doesNotMatch(result.stdout, /--with-deps/);
  assert.match(run({ CI: "1" }).stdout, /^npx playwright install --with-deps chromium webkit$/m);
  assert.match(ciJobs()["install-shard"], /^ {6}- name: Browser system packages, in the background\n {8}env:\n {10}OURO_BROWSER_DEPS: \$\{\{ runner\.temp \}\}\/browser-deps\.status\n/m);
  // From their cache: restored before the background install, which uses it, and saved after the test on a miss.
  const installJob = ciJobs()["install-shard"];
  const restoreAt = installJob.search(/^ {6}- id: debs\n {8}uses: actions\/cache\/restore@/m);
  const backgroundAt = installJob.indexOf('scripts/browser-deps.sh "$OURO_BROWSER_DEBS" chromium webkit');
  const testAt = installJob.indexOf("- name: Install test");
  // Saved only once the background install has passed: a half-filled folder would fail the next dpkg -i.
  const readyAt = installJob.search(/^ {6}- if: always\(\) && steps\.debs\.outputs\.cache-hit != 'true'\n {8}id: debs-ready\n/m);
  const saveAt = installJob.search(/^ {6}- if: always\(\) && steps\.debs-ready\.outputs\.ready == 'true'\n {8}uses: actions\/cache\/save@/m);
  assert.ok(readyAt > testAt && saveAt > readyAt, `${readyAt} ${saveAt}`);
  assert.match(installJob, /\[ "\$\(cat "\$OURO_BROWSER_DEPS" 2>\/dev\/null\)" = 0 \] && echo ready=true >> "\$GITHUB_OUTPUT" \|\| true/);
  assert.ok(restoreAt > 0 && backgroundAt > restoreAt && testAt > backgroundAt && saveAt > testAt, `${restoreAt} ${backgroundAt} ${testAt} ${saveAt}`);
  assert.match(installJob, /key: \$\{\{ steps\.browsers\.outputs\.debs-key \}\}/);
  assert.match(ciJobs()["install-shard"], /^ {10}OURO_BROWSER_DEPS: \$\{\{ runner\.temp \}\}\/browser-deps\.status$/gm);
  const some = run({ OURO_COMPONENTS: "checkbox,checkbox-group", OURO_SHARD: "1/3" });
  assert.equal(some.status, 0, some.stderr);
  assert.match(some.stdout, /^npx vitest run --passWithNoTests --shard=1\/3 components\/ouro\/checkbox\/$/m);
  assert.match(some.stdout, /^npx playwright test --fully-parallel --pass-with-no-tests --shard=1\/3 e2e\/ouro\/checkbox\.spec\.ts e2e\/ouro\/checkbox-group\.spec\.ts$/m);
});

test("motion coverage runs after the ci check, over the partitions the browser shards upload, expecting every project in every shard", async () => {
  const jobs = ciJobs();
  // A browser test job runs Vitest and uploads the partitions it wrote as its next step, before
  // any other Vitest run in the job can rewrite them.
  const browserJobs = Object.keys(jobs).filter((name) => /^ {6}- id: tests\n {8}name: Browser tests\n/m.test(jobs[name]));
  assert.deepEqual(browserJobs, ["browser"]);
  assert.match(
    jobs.browser,
    /^ {8}name: Browser tests\n {8}run: \|\n(?: {10}.*\n)+(?: {6}#.*\n)*^ {6}- uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}name: motion-browser-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/motion\/\n {10}include-hidden-files: true\n {10}if-no-files-found: error\n/m,
    "the browser shards upload .tmp/motion/ as a motion-browser-* artifact right after their browser tests",
  );
  const coverage = jobs["motion-coverage"];
  assert.ok(coverage, "ci.yml has a motion-coverage job");
  assert.match(coverage, /^ {4}needs: \[ci\]$/m, "motion-coverage runs after the ci check, which waits on every browser shard");
  assert.match(coverage, /- uses: actions\/download-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}pattern: \$\{\{ needs\.ci\.outputs\.fallback == 'true' && 'motion-full' \|\| 'motion-browser-\*' \}\}\n {10}path: \$\{\{ runner\.temp \}\}\/motion\n/);
  const check = stepScript(coverage, "Motion coverage");
  // Full: every map complete. Reduced: every project still ran, and only the ci job's stems' maps must be complete.
  const env = { MOTION_PARTITIONS: "p:6", FULL_SUITE_PARTITIONS: "p:1", RUNNER_TEMP: "/r" };
  assert.match(runStep(check, { ...env, REDUCED: "false", FALLBACK: "false" }).calls, /^CALL pnpm motion:coverage --dir \/r\/motion --expect p:6$/m);
  assert.match(runStep(check, { ...env, REDUCED: "true", STEMS: "checkbox,checkbox-group", FALLBACK: "false" }).calls, /^CALL pnpm motion:coverage --dir \/r\/motion --expect p:6 --stems checkbox,checkbox-group$/m);
  assert.match(runStep(check, { ...env, REDUCED: "", FALLBACK: "" }).calls, /^CALL pnpm motion:coverage --dir \/r\/motion --expect p:6$/m);
  // The full suite decided in the ci job: its unsharded partitions.
  assert.match(runStep(check, { ...env, REDUCED: "false", FALLBACK: "true" }).calls, /^CALL pnpm motion:coverage --dir \/r\/motion --expect p:1$/m);
  assert.match(coverage, /^ {6}REDUCED: \$\{\{ needs\.ci\.outputs\.reduced \}\}\n {6}STEMS: \$\{\{ needs\.ci\.outputs\.stems \}\}\n {6}FALLBACK: \$\{\{ needs\.ci\.outputs\.fallback \}\}$/m);
  assert.match(jobs.ci, /^ {6}- if: steps\.tests\.outputs\.fallback == 'true'\n {8}uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}name: motion-full\n {10}path: \.tmp\/motion\/\n/m);
  // The expected partitions: each project vitest.config.ts runs (CI_VISUAL unset, as in the
  // browser shards), once per shard, and once when the full suite ran unsharded. The reduced run
  // names every project too (scripts/test-impact.mjs).
  const config = (await import("../vitest.config.ts")).default;
  const projects = config.test.projects.map((project) => project.test.name);
  assert.deepEqual(projects, ["ouro-chromium", "ouro-webkit", "ouro-touch", "site"]);
  const shards = shardCount(jobs.browser);
  assert.equal(coverage.match(/^ {6}MOTION_PARTITIONS: (.+)$/m)?.[1], projects.map((name) => `${name}:${shards}`).join(","));
  assert.equal(coverage.match(/^ {6}FULL_SUITE_PARTITIONS: (.+)$/m)?.[1], projects.map((name) => `${name}:1`).join(","));
  const { vitestArgs } = await import("./test-impact.mjs");
  for (const components of [[], ["checkbox"]]) {
    assert.deepEqual(vitestArgs(components).filter((arg) => arg.startsWith("--project=")).map((arg) => arg.slice(10)), projects);
  }
  // Every shard writes a partition of every project: each project has a sliced suite, which every shard runs.
  const { slicedSuites } = await import("./shard.mjs");
  for (const [project, suite] of [["ouro-chromium", "test/stories.test.tsx"], ["ouro-webkit", "test/stories.test.tsx"], ["ouro-touch", "test/text-size.touch.test.tsx"], ["site", "site/src/site.test.tsx"]]) {
    assert.ok(slicedSuites.includes(suite), `${project} runs ${suite} in every shard`);
  }
});

test("the budget job waits on every other job, reads the run's jobs and nothing else, and its name patterns match every check", async () => {
  const jobs = ciJobs();
  const block = jobs["ci-budget"];
  // It runs whatever the other jobs did, but not on a cancelled run, which would hold a runner for
  // nothing, nor on a push the merge queue already tested, which runs nothing to measure.
  assert.equal(block.match(/^ {4}if: (.+)$/m)?.[1], untested);
  // Whether the run was full, which the median of full runs reads back from its ci-timings artifact.
  assert.match(block, /^ {10}FULL: \$\{\{ needs\.plan\.outputs\.full != 'false' \}\}$/m);
  assert.match(block, /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n/m);
  const needs = block.match(/^ {4}needs: \[([^\]]*)\]$/m)[1].split(",").map((need) => need.trim());
  // Every job no other job needs: the ends of the run's chains.
  const needed = new Set(Object.entries(jobs).filter(([id]) => id !== "ci-budget").flatMap(([, other]) => other.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()) ?? []));
  const ends = Object.keys(jobs).filter((id) => id !== "ci-budget" && !needed.has(id));
  assert.deepEqual([...needs].sort(), [...ends, "plan"].sort());
  const { jobGraph } = await import("./ci-budget.mjs");
  const graph = jobGraph(workflow("ci.yml"));
  for (const [id, block] of Object.entries(jobs)) {
    for (const name of checkNames(block, id)) assert.deepEqual(graph.filter((node) => node.pattern.test(name)).map((node) => node.id), [id], name);
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
  assert.match(releaseJobs().release, /^ {6}issues: write # /m);
});

/** release.yml's jobs, by name, each the text of its block. */
const releaseJobs = () =>
  Object.fromEntries(
    workflow("release.yml")
      .split("\njobs:\n")[1]
      .split(/\n(?= {2}[\w-]+:\n)/)
      .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
  );

test("a release gives each job its own permissions, and only the queue job, which runs no repository code, may write commit statuses", () => {
  const release = workflow("release.yml");
  assert.match(release, /^permissions: \{\}$/m);
  const jobs = releaseJobs();
  assert.deepEqual(Object.keys(jobs), ["release", "queue", "publish", "finish"]);
  const permissions = (block) => {
    const lines = (block.split(/^ {4}permissions:\n/m)[1] ?? "").split("\n");
    const own = lines.slice(0, lines.findIndex((line) => !/^ {6}[\w-]+: \w+/.test(line)));
    return Object.fromEntries(own.map((line) => line.trim().match(/^([\w-]+): (\w+)/).slice(1)));
  };
  assert.deepEqual(permissions(jobs.release), { contents: "write", actions: "write", "pull-requests": "write", issues: "write" });
  assert.deepEqual(permissions(jobs.queue), { actions: "write", statuses: "write", "pull-requests": "read", contents: "read" });
  assert.deepEqual(permissions(jobs.publish), { contents: "write", actions: "write" });
  assert.deepEqual(permissions(jobs.finish), { contents: "read", issues: "write" });
  // The queue job checks nothing out, installs nothing and runs no script of the repository.
  const code = jobs.queue.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  assert.doesNotMatch(code, /^\s*(- )?uses:|pnpm|npx|node |scripts\//m);
  // Only the required checks' names are reported, from the ruleset main has.
  assert.match(jobs.queue, /gh api "repos\/\$GITHUB_REPOSITORY\/rules\/branches\/main"/);
});

test("a release's tag never stays out without main and Pages following unnoticed, a timeout included", () => {
  const jobs = releaseJobs();
  // The release job cleans up after a failure or a cancel, a timeout's included.
  assert.match(jobs.release, /^ {6}- if: \(failure\(\) \|\| cancelled\(\)\) && steps\.check\.outputs\.new == 'true'\n {8}name: Clean up after a failure$/m);
  // The finish job runs whatever happened before it, and reports a pushed tag main and Pages did not follow.
  assert.match(jobs.finish, /^ {4}needs: \[release, queue, publish\]$/m);
  const condition = jobs.finish.match(/^ {4}if: \$\{\{ (.+) \}\}$/m)?.[1];
  const runs = (release, queue, publish, fresh = "true") =>
    runInNewContext(condition.replace("always()", "true"), { needs: { release: { result: release, outputs: { new: fresh } }, queue: { result: queue }, publish: { result: publish } } });
  assert.equal(runs("success", "success", "success"), false);
  assert.equal(runs("success", "cancelled", "skipped"), true);
  assert.equal(runs("success", "success", "failure"), true);
  assert.equal(runs("cancelled", "skipped", "skipped", undefined), true);
  // The check step's own output, from its script against a stand-in git and gh: a rerun for a
  // version that is already released did nothing, so finish stays out of it and the run is green;
  // a new release's tag that main and Pages did not follow still brings finish in.
  const checked = (released) => {
    const dir = scratchDir("ouro-release-check-");
    const output = join(dir, "output.txt");
    writeFileSync(output, "");
    const stubs = `git() { case "$1" in ls-remote) [ "$RELEASED" = true ] ;; rev-parse) echo abc123 ;; esac; }\ngh() { case "$1 $2" in "release view") [ "$RELEASED" = true ] ;; "run list") echo success ;; esac; }\n`;
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", stubs + releaseStep("Check the version, the tag and main's CI")], {
      encoding: "utf8",
      env: { ...process.env, RELEASED: String(released), VERSION: "9.9.9", TAG: "v9.9.9", GITHUB_OUTPUT: output, GITHUB_ENV: join(dir, "env.txt") },
    });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("=")));
  };
  const rerun = checked(true);
  assert.deepEqual(rerun, { new: "false" });
  assert.equal(runs("success", "skipped", "skipped", rerun.new), false);
  const fresh = checked(false);
  assert.deepEqual(fresh, { new: "true" });
  assert.equal(runs("success", "skipped", "skipped", fresh.new), true);
  const script = releaseStep("Report a release main and Pages did not follow");
  const report = (tagged) =>
    spawnSync("bash", ["-e", "-c", `gh() { printf 'CALL %s\\n' "$*" >&2; case "$1 $2" in "api repos/o/r/git/ref/tags/v9.9.9") [ "$TAGGED" = true ] ;; "issue create") return 0 ;; esac; }\n${script}`], {
      encoding: "utf8",
      env: { ...process.env, TAGGED: String(tagged), GITHUB_REPOSITORY: "o/r", GITHUB_SERVER_URL: "https://github.com", GITHUB_RUN_ID: "5", TAG: "v9.9.9", RESULTS: "release: success, queue: cancelled, publish: skipped" },
    });
  const tagged = report(true);
  assert.equal(tagged.status, 1);
  assert.match(tagged.stderr, /CALL issue create --title Release v9\.9\.9: main or Pages did not follow --body v9\.9\.9 is tagged, but main or Pages did not follow \(release: success, queue: cancelled, publish: skipped\): https:\/\/github\.com\/o\/r\/actions\/runs\/5\./);
  assert.match(tagged.stdout, /^::error::v9\.9\.9 is tagged/m);
  const untagged = report(false);
  assert.equal(untagged.status, 0);
  assert.doesNotMatch(untagged.stderr, /issue create/);
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

test("each release job's time limit is at least 1.5 times what it waits for, the screen-reader lane included", () => {
  // Measured: a full CI run's wall time from dispatch to result, queues on the shared runner pool
  // included (CI runs on release branches, main, merge groups and this repository's pull requests,
  // 2026-10-20/21: 28 to 42 minutes), rounded up to 45. The screen-reader lane's longest run from
  // dispatch to result on this branch (7 minutes over 5 runs, both OSes), rounded up and taken
  // twice for one infrastructure retry; the shadcn@latest install runs beside CI's other jobs on
  // the release commit and adds no time. The namespace checks (scripts/public-registry.mjs) build
  // the namespace from the release commit and fetch every item once a deploy is live: under a
  // minute each locally (11 s per build, 9 s for verify-live against v1.0.2), so 2 minutes with a
  // cold npx cache. The published pages are each waited for up to 15 minutes.
  const ci = 45;
  const lane = 8;
  const namespaceChecks = 2;
  const pagesDeploy = 5;
  const publishedWait = 15;
  const jobs = releaseJobs();
  const limit = (job) => Number(jobs[job].match(/^ {4}timeout-minutes: (\d+)$/m)?.[1]);
  // The release job: CI on the release commit, the lane, CI on the pull request that prepares main.
  assert.ok(limit("release") >= Math.ceil(1.5 * (2 * ci + 2 * lane + namespaceChecks)), `release: timeout-minutes ${limit("release")}`);
  // The queue job: CI on the queue's commit, once more after a rebuild, and on main when main moved
  // past the queue's commit.
  assert.ok(limit("queue") >= 3 * ci, `queue: timeout-minutes ${limit("queue")}`);
  // The publish job: the Pages deploy and the two checks of what it serves.
  assert.ok(limit("publish") >= Math.ceil(1.5 * (pagesDeploy + 2 * publishedWait)), `publish: timeout-minutes ${limit("publish")}`);
  for (const job of Object.keys(jobs)) assert.ok(limit(job) > 0 && limit(job) <= 360, `${job}: GitHub's limit for a job`);
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

test("the conformance exemptions check runs on each pull request and its description's edits, and passes in the merge queue without checking", () => {
  const { text } = workflows.find(({ file }) => file === "conformance-exemptions.yml");
  assert.match(text, /^on:\n {2}pull_request:\n {4}types: \[opened, edited, synchronize, reopened\]\n {2}merge_group:\n/m);
  assert.match(text, /^ {4}name: conformance exemptions$/m);
  // One run per pull request, and one per merge-queue entry: never one entry's run cancelling another's.
  assert.match(text, /^ {2}group: conformance-exemptions-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}$/m);
  const steps = text.slice(text.indexOf("    steps:")).split(/\n {6}- /).slice(1);
  const queue = steps.filter((step) => /^if: github\.event_name == 'merge_group'$/m.test(step));
  assert.equal(queue.length, 1);
  assert.doesNotMatch(queue[0], /uses:|node |pnpm /);
  for (const step of steps.filter((step) => !queue.includes(step))) assert.match(step, /^if: github\.event_name == 'pull_request'$/m, step);
  assert.match(text, /BASE_REF="origin\/\$BASE_REF" node scripts\/conformance-exemptions\.mjs/);
});

test("CI rehearses the release commit on every run: release.yml's own edits, for a version with no tag yet, then the checks and the site build that read them", () => {
  // release.yml writes the release commit with the same script the rehearsal runs.
  const release = workflow("release.yml");
  const push = release.slice(release.indexOf("name: Push the release branch"));
  const pushStep = push.split(/\n {6}- /)[0];
  assert.match(pushStep, /^ {10}scripts\/release-commit\.sh "\$VERSION"$/m);
  assert.doesNotMatch(pushStep, /^ +node scripts\/(registry\.mts --release|latest-release\.mjs set)/m);
  const script = readFileSync(join(root, "scripts/release-commit.sh"), "utf8");
  for (const line of ['node scripts/latest-release.mjs set "v$version"', "pnpm run docs", 'node scripts/registry.mts --release "$version"', "node scripts/changes.mjs assemble changes > CHANGES.md"]) assert.ok(script.includes(`\n${line}\n`), line);
  // The rehearsal, in the checks job (part of the required ci check), after everything else there.
  const block = ciJobs().checks;
  const step = stepScript(block, "Release rehearsal");
  assert.ok(block.indexOf("name: Release rehearsal") > block.indexOf("pnpm build-storybook"));
  const run = (tagExists) => {
    const stubs = `pnpm() { printf 'CALL pnpm %s (%s, base %s)\\n' "$*" "$GITHUB_REF" "$GITHUB_BASE_REF"; }\nscripts/release-commit.sh() { printf 'CALL release-commit %s\\n' "$*"; }\ngit() { return ${tagExists ? 0 : 1}; }`;
    // As on a pull request into main, where registry --check fails a pinned registry.json.
    return spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${stubs}\n${step}`], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_REF: "refs/pull/9/merge", GITHUB_BASE_REF: "main" } });
  };
  const [major, minor, patch] = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).ouro.latestRelease.slice(1).split(".").map(Number);
  const next = `${major}.${minor}.${patch + 1}`;
  const rehearsed = run(false);
  assert.equal(rehearsed.status, 0, rehearsed.stderr);
  const branch = `(refs/heads/release/v${next}, base )`;
  assert.equal(rehearsed.stdout, [`CALL release-commit ${next}`, ...["registry --check", "run docs --check", "claims:check", "site:build"].map((command) => `CALL pnpm ${command} ${branch}`), ""].join("\n"));
  // A version whose tag exists would not rehearse a release that has none.
  const tagged = run(true);
  assert.equal(tagged.status, 1);
  assert.match(tagged.stdout, new RegExp(`^::error::v${next.replace(/\./g, "\\.")} already exists here`, "m"));
});

test("a release rehearsal writes the release commit as Release does, on a branch of its own, runs CI and the screen-reader lane there, tags nothing and deletes the branch", () => {
  const rehearsal = workflow("release-rehearsal.yml");
  assert.match(rehearsal, /^run-name: Release rehearsal v\$\{\{ inputs\.version \}\}$/m);
  assert.match(rehearsal, /^ {6}BRANCH: release\/v\$\{\{ inputs\.version \}\}-rehearsal$/m);
  assert.match(rehearsal, /^ {10}ref: main$/m);
  // The same script as release.yml's release commit, then its namespace checks.
  const push = stepScript(rehearsal, "Push the rehearsal branch");
  assert.match(push, /^git switch -c "\$BRANCH"\n(?:#.*\n)?scripts\/release-commit\.sh "\$VERSION"\ngit add CHANGES\.md\ngit commit -am "Release \$TAG \(rehearsal\)"\ngit push --force origin "\$BRANCH"$/m);
  assert.match(stepScript(rehearsal, "Build and check the @ouro namespace for the rehearsal commit"), /^scripts\/namespace\.sh "\$RUNNER_TEMP\/ns" "\$TAG"\nnode scripts\/public-registry\.mjs verify-build "\$RUNNER_TEMP\/ns" HEAD$/m);
  const run = stepScript(rehearsal, "Run CI and the screen-reader lane on the rehearsal commit");
  assert.match(run, /^gh workflow run ci\.yml --ref "\$BRANCH"$/m);
  assert.match(run, /^gh workflow run screen-reader\.yml --ref "\$BRANCH" -f source_sha="\$sha"$/m);
  assert.match(run, /gh run watch "\$ci" --exit-status/);
  assert.match(run, /gh run watch "\$sr" --exit-status/);
  // It never tags, releases, merges or writes statuses, and it always deletes its branch.
  assert.doesNotMatch(rehearsal, /git tag|gh release|gh pr|statuses|pull-requests: write/);
  assert.match(rehearsal, /^ {6}- if: always\(\)\n {8}name: Delete the rehearsal branch\n {8}run: git push origin --delete "\$BRANCH"/m);
  assert.match(rehearsal, /^ {4}permissions:\n {6}contents: write # [^\n]+\n {6}actions: write # [^\n]+\n {4}#/m);
  // Release refuses to cut a version without a passing rehearsal of it on main's commit.
  const check = stepScript(workflow("release.yml"), "Check the version, the tag and main's CI");
  assert.match(check, /gh run list --workflow release-rehearsal\.yml --commit "\$sha" --json conclusion,displayTitle/);
  const filter = /--jq "([^"\\]*(?:\\.[^"\\]*)*)"\)/.exec(check.slice(check.indexOf("release-rehearsal.yml")))?.[1].replace(/\\"/g, '"').replace("$TAG", "v1.2.0");
  const conclusion = (runs) => spawnSync("jq", ["-r", filter], { input: JSON.stringify(runs), encoding: "utf8" }).stdout.trim();
  assert.equal(conclusion([{ conclusion: "success", displayTitle: "Release rehearsal v1.2.0" }]), "success");
  assert.equal(conclusion([{ conclusion: "failure", displayTitle: "Release rehearsal v1.2.0" }, { conclusion: "success", displayTitle: "Release rehearsal v1.2.0" }]), "failure");
  assert.equal(conclusion([{ conclusion: "success", displayTitle: "Release rehearsal v1.1.1" }]), "null");
  assert.match(check, /\[ "\$rehearsal" = success \] \|\| \{ echo "::error::The release rehearsal of \$TAG on main \(\$sha\) is '\$\{rehearsal:-not run\}', not success\. Run it first: gh workflow run release-rehearsal\.yml -f version=\$VERSION"; exit 1; \}/);
  assert.ok(check.indexOf("release-rehearsal.yml") > check.indexOf('[ "$conclusion" = success ]'));
});
