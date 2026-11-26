import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createServer } from "node:net";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { runInNewContext } from "node:vm";
import { assemble, releasedAt } from "./changes.mjs";
import { relevance } from "./ci-relevance.mjs";
import { KITS } from "./kit-pin.mjs";
import { entryProblems, failedTests, names, quarantineFile, record, retryPlan, staleWarning } from "./quarantine.mjs";
import { scratchDir } from "./scratch.mjs";
import { GH_REFUSED, sandboxEnv } from "./sandbox.mjs";
import { scriptTestFiles } from "./script-tests.mjs";
import { treeFiles } from "./tree.mjs";

// The workflows publish the registry and push to the repository, so what they run must not
// change under them: every action is pinned to a commit, and only the release job keeps the
// checkout's token.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".github/workflows");
/**
 * ci.yml's checkouts as each would read without its stall guard (#1765): a first try with a one-minute limit and a
 * packet trace, the step that clears a stalled one, a second try, the step that clears that one, and a last try. They
 * fold back into the one step they guard, so the tests of each job read its checkout as written. The guard itself is
 * tested on the raw text.
 */
const checkoutGuard = new RegExp(
  [
    String.raw`^ {6}- id: checkout\n((?: {8}if: .*\n)?) {8}uses: (\S+ # v[\d.]+)\n {8}timeout-minutes: 1\n {8}continue-on-error: true\n {8}env:\n {10}GIT_TRACE_CURL: \S+\n {10}GIT_TRACE_CURL_NO_DATA: "1"\n {10}GIT_TRACE_PACKET: \S+\n((?: {8}with:\n(?: {10}.*\n)+)?)`,
    String.raw` {6}- (?:\*checkout-stalled\n|&checkout-stalled\n(?: {8}.*\n| *\n)+?)`,
    String.raw` {6}- id: checkout-again\n {8}if: steps\.checkout\.outcome == 'failure'\n {8}uses: \2\n {8}timeout-minutes: 1\n {8}continue-on-error: true\n {8}env:\n {10}GIT_TRACE_CURL: \S+\n {10}GIT_TRACE_CURL_NO_DATA: "1"\n {10}GIT_TRACE_PACKET: \S+\n\3`,
    String.raw` {6}- (?:\*checkout-stalled-again\n|&checkout-stalled-again\n(?: {8}.*\n| *\n)+?)`,
    String.raw` {6}- (?:id: checkout-last\n {8})?if: steps\.checkout-again\.outcome == 'failure'\n((?: {8}continue-on-error: true\n)?) {8}uses: \2\n {8}timeout-minutes: 1\n {8}env:\n {10}GIT_TRACE_CURL: \S+\n {10}GIT_TRACE_CURL_NO_DATA: "1"\n {10}GIT_TRACE_PACKET: \S+\n\3`,
  ].join(""),
  "gm",
);
/**
 * A pnpm setup's first try, its warning and its one retry, as GitHub reads them (anchors expanded), with the
 * comment lines between them left as written. The helpers are above `unguarded`, which folds them back (#1911).
 */
const pnpmRetryFiles = ["ci.yml", "claims.yml", "conformance-exemptions.yml", "docs-pin.yml", "pages.yml", "release.yml", "screen-reader-lane.yml"];
const pnpmSetup = /uses: pnpm\/action-setup@[0-9a-f]{40} # v[\d.]+/;
const expandPnpmAliases = (text) => {
  const anchors = new Map([...text.matchAll(/^ {6}- &(pnpm-[\w-]+)\n((?: {8}.*\n)+)/gm)].map((match) => [match[1], match[2]]));
  return text
    .replace(/^ {6}- \*(pnpm-[\w-]+)\n/gm, (_, name) => {
      assert.ok(anchors.has(name), `*${name} has no anchor`);
      return `      - ${anchors.get(name).slice(8)}`;
    })
    .replace(/^( {6}- )&pnpm-[\w-]+\n {8}/gm, "$1");
};
const pnpmInstall = /run: pnpm i --frozen-lockfile$/m;
const pnpmFold = new RegExp(
  String.raw`^ {6}- (?:(if: .*)\n {8})?id: pnpm\n {8}uses: (\S+ # v[\d.]+)\n {8}continue-on-error: true\n(?: {6}#.*\n)* {6}- name: pnpm setup failed; trying it once more \(#1911\)\n {8}if: steps\.pnpm\.outcome == 'failure'\n {8}run: .*\n(?: {6}#.*\n)* {6}- if: steps\.pnpm\.outcome == 'failure'\n {8}uses: \S+ # v[\d.]+\n`,
  "gm",
);
const installFold = new RegExp(
  String.raw`^ {6}- (?:(if: .*)\n {8})?id: install\n {8}run: pnpm i --frozen-lockfile\n {8}continue-on-error: true\n(?: {6}#.*\n)* {6}- name: pnpm install failed; trying it once more \(#1914\)\n {8}if: steps\.install\.outcome == 'failure'\n {8}run: .*\n(?: {6}#.*\n)* {6}- if: steps\.install\.outcome == 'failure'\n {8}run: pnpm i --frozen-lockfile\n`,
  "gm",
);
// A setup-node that restores the pnpm cache: its first try, warning and retry (#2194), folded back into the one step.
const nodeFold = new RegExp(
  String.raw`^ {6}- (?:(if: .*)\n {8})?id: node\n {8}uses: (\S+ # v[\d.]+)\n {8}timeout-minutes: 3\n {8}continue-on-error: true\n((?: {8}with:\n(?: {10}.*\n)+)?) {6}- name: setup-node stalled; setting it up once more without the cache \(#2194\)\n {8}if: steps\.node\.outcome == 'failure'\n {8}run: .*\n {6}- if: steps\.node\.outcome == 'failure'\n {8}uses: \S+ # v[\d.]+\n(?: {8}with:\n(?: {10}.*\n)+)`,
  "gm",
);
const foldNode = (text) => text.replace(nodeFold, (_, condition, uses, withBlock) => `${condition ? `      - ${condition}\n        uses: ${uses}\n` : `      - uses: ${uses}\n`}${withBlock}`);
const foldPnpm = (text) =>
  expandPnpmAliases(text)
    .replace(pnpmFold, (_, condition, uses) => (condition ? `      - ${condition}\n        uses: ${uses}\n` : `      - uses: ${uses}\n`))
    .replace(installFold, (_, condition) => (condition ? `      - ${condition}\n        run: pnpm i --frozen-lockfile\n` : `      - run: pnpm i --frozen-lockfile\n`));
// ci.yml's setup-node anchors (#2194), expanded as GitHub reads them, as expandPnpmAliases does for pnpm's.
const expandNodeAliases = (text) => {
  const anchors = new Map([...text.matchAll(/^ {6}- &(node-[\w-]+)\n((?: {8}.*\n)+)/gm)].map((match) => [match[1], match[2]]));
  return text
    .replace(/^ {6}- \*(node-[\w-]+)\n/gm, (_, name) => {
      assert.ok(anchors.has(name), `*${name} has no anchor`);
      return `      - ${anchors.get(name).slice(8)}`;
    })
    .replace(/^( {6}- )&node-[\w-]+\n {8}/gm, "$1");
};
// The tarball last resort (#1765) folds away with its alias, so the other tests read each checkout as it did before it.
const foldTarball = (text) => text.replace(/^ {6}- &checkout-tarball\n[\s\S]*?(?=^ {6}\S)|^ {6}- \*checkout-tarball\n/gm, "");
const unguarded = (text) => foldPnpm(foldNode(expandNodeAliases(foldTarball(text)))).replace(checkoutGuard, (_, condition, uses, withBlock, continues) => `      - ${`${condition}${continues}        uses: ${uses}\n`.slice(8)}${withBlock}`);
const rawWorkflows = readdirSync(dir)
  .filter((file) => file.endsWith(".yml"))
  .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));
const workflows = rawWorkflows.map(({ file, text }) => ({ file, text: unguarded(text) }));
// The repository's own composite actions, which the workflows use from their checkout.
const actionsDir = join(root, ".github/actions");
const actions = readdirSync(actionsDir).map((name) => ({ file: `actions/${name}/action.yml`, text: readFileSync(join(actionsDir, name, "action.yml"), "utf8") }));

test("a CI git transfer over HTTP/1.1 that stalls ends after a minute below 1 KB/s, so actions/checkout fetches again (#1765)", () => {
  const ci = workflow("ci.yml");
  assert.match(ci, /^env:\n {2}GIT_HTTP_LOW_SPEED_LIMIT: 1000\n {2}GIT_HTTP_LOW_SPEED_TIME: 60\n {2}GIT_CONFIG_COUNT: "1"\n {2}GIT_CONFIG_KEY_0: http\.version\n {2}GIT_CONFIG_VALUE_0: HTTP\/1\.1\n/m);
  // No step overrides them, so every checkout and its retry fetch over HTTP/1.1 (#1765).
  assert.doesNotMatch(ci, /^ {3,}GIT_CONFIG_/m);
  // git reads the workflow's HTTP/1.1 setting from its environment.
  const workflowEnv = Object.fromEntries([...ci.match(/^env:\n((?: {2}\S.*\n)+)/m)[1].matchAll(/^ {2}(\w+): "?([^"\n]*)"?$/gm)].map(([, key, value]) => [key, value]));
  const httpVersion = spawnSync("git", ["config", "--get", "http.version"], { cwd: root, encoding: "utf8", env: { ...process.env, ...workflowEnv } });
  assert.equal(httpVersion.stdout.trim(), "HTTP/1.1", httpVersion.stderr);
  // git reads them: a fetch from a server that never answers ends at the limit.
  const scratch = scratchDir("ouro-git-stall-");
  const server = createServer(() => {});
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      spawnSync("git", ["init", "-q"], { cwd: scratch });
      const started = Date.now();
      const result = spawnSync("git", ["fetch", "-q", `http://127.0.0.1:${port}/repo`, "main"], { cwd: scratch, encoding: "utf8", env: { ...process.env, GIT_HTTP_LOW_SPEED_LIMIT: "1000", GIT_HTTP_LOW_SPEED_TIME: "2" }, timeout: 30_000 });
      server.close();
      server.closeAllConnections?.();
      try {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /too slow/i);
        assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started} ms`);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
});

test("a checkout that stalls or fails is cleared and tried again, twice, each try a minute long, with a trace of its HTTP requests and packets (#1765)", () => {
  const ci = rawWorkflows.find(({ file }) => file === "ci.yml").text;
  // Every guard folds back into the step it guards, and the fold leaves none behind (the other tests read the fold).
  assert.doesNotMatch(unguarded(ci), /checkout-stalled|checkout-again|checkout-last|checkout-tarball|steps\.checkout\.outcome|ouro-checkout-(trace|packets)/);
  // Each step, by its "- " at the steps' indent, with its lines.
  const steps = ci.split(/\n(?= {6}- )/).map((step) => step.split(/\n(?! {8}| {6}- |\s*$)/)[0]);
  const checkouts = steps.flatMap((step, index) => (/uses: actions\/checkout@/.test(step) ? [index] : []));
  const withBlock = (step) => step.slice(step.indexOf("\n        with:") + 1 || step.length);
  const attempts = checkouts.filter((index) => /^ {6}- id: checkout$/m.test(steps[index]));
  assert.ok(attempts.length >= 30, `${attempts.length} checkouts with a time limit`);
  assert.equal(checkouts.length, attempts.length * 3, "every checkout is a first try, a second try and a last try");
  for (const index of attempts) {
    const [attempt, stalled, retry, stalledAgain, lastTry] = steps.slice(index, index + 5);
    assert.match(attempt, /\n {8}timeout-minutes: 1\n {8}continue-on-error: true\n {8}env:\n {10}GIT_TRACE_CURL: \/tmp\/ouro-checkout-trace\.log\n {10}GIT_TRACE_CURL_NO_DATA: "1"\n {10}GIT_TRACE_PACKET: \/tmp\/ouro-checkout-packets\.log\n/);
    assert.match(stalled, /^ {6}- (\*checkout-stalled$|&checkout-stalled\n)/);
    assert.match(retry, /^ {6}- id: checkout-again\n {8}if: steps\.checkout\.outcome == 'failure'\n {8}uses: actions\/checkout@\S+ # v[\d.]+\n {8}timeout-minutes: 1\n {8}continue-on-error: true\n {8}env:\n {10}GIT_TRACE_CURL: \/tmp\/ouro-checkout-trace\.log\n {10}GIT_TRACE_CURL_NO_DATA: "1"\n {10}GIT_TRACE_PACKET: \/tmp\/ouro-checkout-packets\.log\n/);
    assert.match(stalledAgain, /^ {6}- (\*checkout-stalled-again$|&checkout-stalled-again\n)/);
    assert.match(lastTry, /^ {6}- (?:id: checkout-last\n {8})?if: steps\.checkout-again\.outcome == 'failure'\n(?: {8}continue-on-error: true\n)? {8}uses: actions\/checkout@\S+ # v[\d.]+\n {8}timeout-minutes: 1\n {8}env:\n {10}GIT_TRACE_CURL: \/tmp\/ouro-checkout-trace\.log\n {10}GIT_TRACE_CURL_NO_DATA: "1"\n {10}GIT_TRACE_PACKET: \/tmp\/ouro-checkout-packets\.log\n/);
    assert.equal(withBlock(retry), withBlock(attempt), `the retry fetches what the first try did:\n${attempt}`);
    assert.equal(withBlock(lastTry), withBlock(attempt), `the last try fetches what the first try did:\n${attempt}`);
  }
  const stalled = steps.find((step) => /&checkout-stalled\n/.test(step));
  assert.match(stalled, /name: actions\/checkout stalled; clear it for one more try/);
  assert.match(stalled, /::warning title=actions\/checkout stalled::.*ourostack\/ouro-ui#1765/);
  assert.match(stalled, /tail -n 60 \/tmp\/ouro-checkout-trace\.log/);
  assert.match(stalled, /tail -n 60 \/tmp\/ouro-checkout-packets\.log/);
  assert.match(stalled, /rm -rf "\$GITHUB_WORKSPACE\/\.git"/);
  const stalledAgain = steps.find((step) => /&checkout-stalled-again\n/.test(step));
  assert.match(stalledAgain, /name: actions\/checkout stalled again; clear it for a last try/);
  assert.match(stalledAgain, /::warning title=actions\/checkout stalled again::.*ourostack\/ouro-ui#1765/);
  assert.match(stalledAgain, /tail -n 60 \/tmp\/ouro-checkout-packets\.log/);
  assert.match(stalledAgain, /rm -rf "\$GITHUB_WORKSPACE\/\.git"/);
});

/**
 * ci.yml's last try, when it stalls too, is followed by the commit's tarball (#1765), in every job whose steps need no
 * history: a tarball has none. Each other job keeps its checkout as it was, with its last try left to fail and a comment
 * saying why (the list below is the sweep of those jobs' steps and the scripts they run).
 */
test("a checkout that stalls three times is followed by the commit's tarball, in every job that needs no history (#1765)", () => {
  const ci = rawWorkflows.find(({ file }) => file === "ci.yml").text;
  const withoutTarball = [
    "attribution",
    "checks",
    "design",
    "e2e-shard",
    "fresh-main",
    "install",
    "install-checks",
    "install-current",
    "install-github",
    "install-prep",
    "install-shard",
    "latency-shard",
    "lighthouse",
    "mutation-plan",
    "mutation-shard",
    "plan",
    "scripts",
    "sweep-shard",
    "theme-install",
  ];
  const blocks = Object.fromEntries(ci.split("\njobs:\n")[1].split(/\n(?= {2}[\w-]+:\n)/).map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]));
  const checkoutJobs = Object.keys(blocks).filter((job) => /uses: actions\/checkout@/.test(blocks[job]));
  assert.equal(ci.match(/^ {6}- &checkout-tarball$/gm)?.length, 1, "one anchor for the tarball step");
  for (const job of withoutTarball) {
    assert.ok(checkoutJobs.includes(job), `${job} checks out`);
    assert.doesNotMatch(blocks[job], /checkout-last|checkout-tarball/, `${job} keeps its last try as it was`);
    const steps = blocks[job].split(/\n(?= {6}- )/);
    const last = steps.find((step) => /^ {6}- if: steps\.checkout-again\.outcome == 'failure'\n/.test(step) && /uses: actions\/checkout@/.test(step));
    assert.ok(last, `${job} has its last try as before`);
    assert.doesNotMatch(last, /continue-on-error/, `${job} leaves its last try to fail, as before`);
    assert.match(blocks[job], /^ {6}# .*\(#1765\)\.$/m, `${job} says why it has no last resort`);
  }
  for (const job of checkoutJobs.filter((job) => !withoutTarball.includes(job))) {
    const steps = blocks[job].split(/\n(?= {6}- )/);
    const index = steps.findIndex((step) => /^ {6}- id: checkout-last\n/.test(step));
    assert.notEqual(index, -1, `${job} has a last try with an id`);
    assert.match(steps[index], /^ {6}- id: checkout-last\n {8}if: steps\.checkout-again\.outcome == 'failure'\n {8}continue-on-error: true\n {8}uses: actions\/checkout@\S+ # v[\d.]+\n {8}timeout-minutes: 1\n/, job);
    assert.match(steps[index + 1] ?? "", /^ {6}- (?:&checkout-tarball|\*checkout-tarball)$/m, `${job}: the tarball follows its last try`);
  }
  assert.equal(ci.match(/^ {6}- (?:&checkout-tarball|\*checkout-tarball)$/gm).length, checkoutJobs.length - withoutTarball.length);
});

/**
 * The tarball step's script, run with stubs for curl and gh (the network), and the real tar and git: it downloads the
 * commit's tarball with the job's token, unpacks it into the workspace, commits it locally with the tree of the commit (so
 * `HEAD^{tree}` reads what the checkout would), and fails when the tree differs (#1765).
 */
test("the tarball step downloads the commit's tarball with the job's token, unpacks it, and fails when its tree is not the commit's (#1765)", () => {
  const ci = rawWorkflows.find(({ file }) => file === "ci.yml").text;
  const step = ci.match(/^ {6}- &checkout-tarball\n[\s\S]*?(?=^ {6}\S)/m)[0];
  assert.match(step, /^ {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {10}REPO: \$\{\{ github\.repository \}\}\n {10}SHA: \$\{\{ github\.sha \}\}\n/m);
  const script = step.split("        run: |\n")[1].split("\n").map((line) => line.slice(10)).join("\n");
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const top = "ourostack-ouro-ui-0123456";
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const work = mkdtempSync(join(root, ".tmp", "ci-tarball-"));
  try {
    // A source tree as GitHub's tarball holds it: a folder named for the repository and the commit, without .git. The
    // ignored file is in the commit, so the unpacked tree must include it too.
    const source = join(work, "source", top);
    mkdirSync(join(source, "scripts"), { recursive: true });
    writeFileSync(join(source, "package.json"), "{}\n");
    writeFileSync(join(source, "scripts/run.sh"), "echo ok\n", { mode: 0o755 });
    writeFileSync(join(source, ".gitignore"), "generated.json\n");
    writeFileSync(join(source, "generated.json"), "{}\n");
    execFileSync("git", ["init", "-q"], { cwd: source });
    execFileSync("git", ["add", "--force", "--all"], { cwd: source });
    const tree = execFileSync("git", ["write-tree"], { cwd: source, encoding: "utf8" }).trim();
    rmSync(join(source, ".git"), { recursive: true, force: true });
    const tarball = join(work, "src.tar.gz");
    execFileSync("tar", ["-czf", tarball, "-C", join(work, "source"), top]);
    const workspace = join(work, "workspace");
    const runnerTemp = join(work, "runner-temp");
    mkdirSync(workspace);
    mkdirSync(runnerTemp);
    // What the stalled checkout left behind must go.
    writeFileSync(join(workspace, "stale.txt"), "left by the stalled checkout\n");
    const stubs = `export GH_TOKEN=token-for-test
curl() { printf 'CALL curl %s\\n' "$*" >&2; while [ $# -gt 0 ]; do if [ "$1" = -o ]; then cp "$TARBALL" "$2"; fi; shift; done; }
gh() { printf 'CALL gh %s\\n' "$*" >&2; echo "$TREE"; }
`;
    // The ceiling keeps a repository the step did not make out of reach: its git then fails, rather than committing into this checkout.
    const run = (env) => runStep(`${stubs}${script}`, { REPO: "ourostack/ouro-ui", SHA: sha, GITHUB_WORKSPACE: workspace, RUNNER_TEMP: runnerTemp, TARBALL: tarball, TREE: tree, GIT_CEILING_DIRECTORIES: work, ...env });

    const unpacked = run({});
    assert.equal(unpacked.status, 0, `${unpacked.stdout}${unpacked.calls}`);
    assert.match(unpacked.calls, new RegExp(`^CALL curl .*Authorization: Bearer token-for-test .*https://api\\.github\\.com/repos/ourostack/ouro-ui/tarball/${sha}$`, "m"));
    assert.match(unpacked.calls, new RegExp(`^CALL gh api repos/ourostack/ouro-ui/git/commits/${sha} --jq \\.tree\\.sha$`, "m"));
    assert.match(unpacked.stdout, /::warning title=actions\/checkout stalled three times::/);
    assert.equal(existsSync(join(workspace, "stale.txt")), false);
    assert.equal(readFileSync(join(workspace, "scripts/run.sh"), "utf8"), "echo ok\n");
    assert.equal(readFileSync(join(workspace, "generated.json"), "utf8"), "{}\n");
    assert.equal(execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: workspace, encoding: "utf8" }).trim(), tree);
    assert.equal(execFileSync("git", ["log", "-1", "--format=%s"], { cwd: workspace, encoding: "utf8" }).trim(), `tarball of ${sha}`);

    const other = run({ TREE: "0".repeat(40) });
    assert.notEqual(other.status, 0);
    assert.match(other.stdout, /::error title=Tarball tree differs::/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

/**
 * The workflows that report a required check or cut a release try a pnpm setup, and a dependency install,
 * again if the first try fails (#1911, #1914), as ci.yml retries a checkout (#1765): each first try, its
 * warning and its one retry.
 */
test("every pnpm setup and dependency install in a workflow that reports a required check or cuts a release is tried once more on failure (#1911, #1914)", () => {
  for (const file of pnpmRetryFiles) {
    const text = expandPnpmAliases(rawWorkflows.find((entry) => entry.file === file).text);
    let setupJobs = 0;
    let installJobs = 0;
    for (const job of text.split(/\n(?= {2}[\w-]+:\n)/)) {
      const steps = job.split(/\n(?= {6}- )/);
      const setups = steps.filter((step) => pnpmSetup.test(step)).length;
      if (setups > 0) {
        setupJobs += 1;
        const index = steps.findIndex((step) => /^ {6}- (?:if: .*\n {8})?id: pnpm\n/.test(step));
        assert.notEqual(index, -1, `${file}: a pnpm setup is not tried first, with id: pnpm:\n${job}`);
        assert.equal(setups, 2, `${file}: a job sets pnpm up once and tries it once more:\n${job}`);
        const [attempt, warning, retry] = steps.slice(index, index + 3);
        assert.match(attempt, /\n {8}continue-on-error: true$/m, `${file}: the first try must not fail the job:\n${attempt}`);
        assert.match(warning, /^ {6}- name: pnpm setup failed; trying it once more \(#1911\)\n {8}if: steps\.pnpm\.outcome == 'failure'\n {8}run: echo "::warning title=pnpm setup failed::/, `${file}: the warning before the retry:\n${warning}`);
        assert.match(retry, /^ {6}- if: steps\.pnpm\.outcome == 'failure'\n {8}uses: pnpm\/action-setup@/, `${file}: the retry runs only after a failed first try:\n${retry}`);
        assert.equal(retry.match(pnpmSetup)[0], attempt.match(pnpmSetup)[0], `${file}: the retry sets up the same pnpm as the first try`);
      }
      const installs = steps.filter((step) => pnpmInstall.test(step)).length;
      if (installs > 0) {
        installJobs += 1;
        const index = steps.findIndex((step) => /^ {6}- (?:if: .*\n {8})?id: install\n/.test(step));
        assert.notEqual(index, -1, `${file}: a pnpm i is not tried first, with id: install:\n${job}`);
        assert.equal(installs, 2, `${file}: a job runs pnpm i once and once more on failure:\n${job}`);
        const [install, installWarning, installRetry] = steps.slice(index, index + 3);
        assert.match(install, /\n {8}continue-on-error: true$/m, `${file}: the first install must not fail the job:\n${install}`);
        assert.match(installWarning, /^ {6}- name: pnpm install failed; trying it once more \(#1914\)\n {8}if: steps\.install\.outcome == 'failure'\n {8}run: echo "::warning title=pnpm install failed::/, `${file}: the warning before the install retry:\n${installWarning}`);
        assert.match(installRetry, /^ {6}- if: steps\.install\.outcome == 'failure'\n {8}run: pnpm i --frozen-lockfile$/m, `${file}: the install retry runs only after a failed first install:\n${installRetry}`);
      }
    }
    assert.ok(setupJobs > 0, `${file} sets pnpm up`);
    assert.equal((text.match(/uses: pnpm\/action-setup@/g) ?? []).length, 2 * setupJobs, `${file}: every pnpm setup is a first try or its one retry`);
    assert.equal((text.match(/run: pnpm i --frozen-lockfile$/gm) ?? []).length, 2 * installJobs, `${file}: every pnpm i is a first try or its one retry`);
  }
});

/**
 * A setup-node step that restores the pnpm cache can stall once the account is over its egress limit (#2194). Each job
 * that restores it tries it with a three-minute limit, warns, and sets node up once more without the cache.
 */
test("every setup-node that restores the pnpm cache in ci.yml has a time limit and is tried once more without the cache (#2194)", () => {
  const text = expandNodeAliases(rawWorkflows.find((entry) => entry.file === "ci.yml").text);
  const setupNode = /uses: actions\/setup-node@[0-9a-f]{40} # v[\d.]+/;
  const restores = (step) => setupNode.test(step) && /^ {10}cache: pnpm$/m.test(step);
  let restoreJobs = 0;
  for (const job of text.split(/\n(?= {2}[\w-]+:\n)/)) {
    const steps = job.split(/\n(?= {6}- )/);
    const count = steps.filter(restores).length;
    if (count === 0) continue;
    restoreJobs += 1;
    assert.equal(count, 1, `a job restores the pnpm cache once:\n${job}`);
    const index = steps.findIndex(restores);
    const [attempt, warning, retry] = steps.slice(index, index + 3);
    assert.match(attempt, /^ {6}- (?:if: .*\n {8})?id: node\n/, `the first try has id: node:\n${attempt}`);
    assert.match(attempt, /^ {8}timeout-minutes: 3$/m, `the first try has a three-minute limit:\n${attempt}`);
    assert.match(attempt, /^ {8}continue-on-error: true$/m, `the first try must not fail the job:\n${attempt}`);
    assert.match(warning, /^ {6}- name: setup-node stalled; setting it up once more without the cache \(#2194\)\n {8}if: steps\.node\.outcome == 'failure'\n {8}run: echo "::warning title=setup-node stalled::/, `the warning before the retry:\n${warning}`);
    assert.match(retry, /^ {6}- if: steps\.node\.outcome == 'failure'\n {8}uses: actions\/setup-node@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}node-version: 24\n {10}cache: ""$/m, `the retry runs only after a failed first try, without the cache:\n${retry}`);
    assert.equal(retry.match(setupNode)[0], attempt.match(setupNode)[0], `the retry sets up the same node as the first try:\n${job}`);
  }
  assert.ok(restoreJobs > 0, "ci.yml restores the pnpm cache in some job");
});

/**
 * A job whose steps read no package from node_modules installs none: no pnpm, no pnpm store cache and no pnpm i, so it
 * restores nothing from the cache (#2194). The motion check reads only Node's own modules and this repository's files
 * (scripts/motion-coverage.mts). The ci job's full-suite merge loads @vitest/coverage-istanbul's istanbul library
 * (scripts/coverage-merge.mjs), so the ci job installs the packages before it (#2259).
 */
test("the jobs whose steps read no package install none and run no pnpm (#2194), and the ci job installs before its coverage merge (#2259)", () => {
  const jobs = ciJobs();
  assert.ok(jobs["motion-coverage"], "ci.yml has a motion-coverage job");
  assert.doesNotMatch(jobs["motion-coverage"], /\bpnpm\b/, "motion-coverage runs no pnpm, so it installs no package");
  assert.doesNotMatch(jobs["motion-coverage"], /cache: pnpm/, "motion-coverage restores no pnpm store");
  assert.match(jobs["motion-coverage"], /uses: actions\/setup-node@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}node-version: 24\n {10}cache: ""\n/, "motion-coverage sets node up without a cache, for motion-coverage.mts");
  assert.match(readFileSync(join(root, "scripts/coverage-merge.mjs"), "utf8"), /resolve\("@vitest\/coverage-istanbul"\)/, "coverage-merge.mjs loads @vitest/coverage-istanbul");
  const install = jobs.ci.indexOf("run: pnpm i --frozen-lockfile");
  assert.ok(install > 0, "the ci job installs the packages");
  assert.ok(install < jobs.ci.indexOf("node scripts/coverage-merge.mjs"), "the ci job installs the packages before its coverage merge reads them");
});

test("every action is pinned to a full commit SHA, with its version in a comment", () => {
  assert.ok(workflows.length >= 4);
  const ownActions = new Set(actions.map(({ file }) => `./.github/${file.replace(/\/action\.yml$/, "")}`));
  // A reusable workflow of this repository is called by its path: it is this commit's own file, not another repository's.
  const ownWorkflows = new Set(workflows.map(({ file }) => `./.github/workflows/${file}`));
  const unpinned = [...workflows, ...actions].flatMap(({ file, text }) =>
    text
      .split("\n")
      .filter((line) => /^\s*(- )?uses: /.test(line))
      .filter((line) => !/uses: [\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line) && !ownActions.has(line.replace(/^\s*(- )?uses: /, "").trim()) && !ownWorkflows.has(line.replace(/^\s*(- )?uses: /, "").trim()))
      .map((line) => `${file}: ${line.trim()}`),
  );
  assert.deepEqual(unpinned, [], "Pin with owner/repo@<40-character SHA> # vX.Y.Z, or use one of .github/actions.");
  // A job's container image too: by digest, with its tag in a comment.
  const images = workflows.flatMap(({ file, text }) => [...text.matchAll(/^ {4}container:\n {6}image: (.+)$/gm)].map((match) => `${file}: ${match[1]}`));
  assert.ok(images.length > 0);
  assert.deepEqual(images.filter((line) => !/: [\w.-]+(\/[\w.-]+)+@sha256:[0-9a-f]{64} # v[\w.-]+$/.test(line)), [], "Pin with registry/image@sha256:<64 hex> # <tag>.");
});

const browserAction = readFileSync(join(actionsDir, "playwright-browsers/action.yml"), "utf8");

test("CI downloads Playwright's browsers only through the cached action", () => {
  for (const file of ["ci.yml", "agent-usability.yml", "visual-baselines.yml", "form-answer-proof.yml", "benchmark-v08-score.yml"]) {
    const text = workflows.find((workflow) => workflow.file === file).text;
    assert.doesNotMatch(text, /(pnpm exec|npx) playwright install(?!-deps)/, `${file} downloads browsers itself`);
    assert.match(text, /uses: \.\/\.github\/actions\/playwright-browsers\n\s+with:\n\s+browsers: [a-z ]+\n/);
  }
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

test("only main saves a cache: every cache save in a workflow or action is guarded to main and to no pull request, except the mutation job's one (#2194)", () => {
  // An actions/cache step saves at the end of its job, where no condition of its own can reach it, so none may remain.
  const guard = ["github.ref == 'refs/heads/main'", "github.event_name != 'pull_request'"];
  const saves = [];
  for (const { file, text } of [...workflows, ...actions]) {
    assert.doesNotMatch(text, /uses: actions\/cache@/, `${file} saves its cache at the end of its job`);
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!/uses: actions\/cache\/save@/.test(line)) return;
      // The step's dash sits two columns before its `uses:`, whether `uses:` opens the step or follows its `if:` or `id:`.
      const dash = line.indexOf("uses:") - 2;
      let start = index;
      while (!new RegExp(`^ {${dash}}- `).test(lines[start])) start -= 1;
      let end = index + 1;
      while (end < lines.length && !new RegExp(`^ {0,${dash}}\\S`).test(lines[end])) end += 1;
      saves.push({ file, step: lines.slice(start, end).join("\n") });
    });
  }
  assert.ok(saves.length >= 6, `found ${saves.length} saves`);
  const exempt = saves.filter(({ step }) => step.includes("path: .tmp/stryker-incremental.json"));
  assert.deepEqual(exempt.map(({ file }) => file), ["ci.yml"], "the one save a pull request makes is the mutation job's");
  for (const { file, step } of saves.filter((save) => !exempt.includes(save))) {
    const condition = step.match(/if: (.*)$/m)?.[1] ?? "";
    for (const part of guard) assert.ok(condition.includes(part), `${file} saves a cache without ${part}:\n${step}`);
  }
});

test("a test that reaches gh with no stub is refused with exit 97, with no token, and its step stops there", () => {
  const saved = process.env.GH_TOKEN;
  process.env.GH_TOKEN = "not-a-token";
  let env;
  try {
    env = sandboxEnv({ GITHUB_TOKEN: "not-a-token" });
  } finally {
    if (saved === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = saved;
  }
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.deepEqual(readdirSync(env.GH_CONFIG_DIR), [], "gh reads its login from an empty folder");
  const result = spawnSync("bash", ["-e", "-c", "gh workflow run pages.yml --ref main\nprintf AFTER\n"], { encoding: "utf8", env });
  assert.equal(result.status, GH_REFUSED, result.stdout + result.stderr);
  assert.equal(result.stderr.trim(), "a test reached the real gh: workflow run pages.yml --ref main");
  assert.doesNotMatch(result.stdout, /AFTER/, "nothing after the refused call ran");
});

test("no job in a container uses setup-node's own cache, whose saved path does not exist there", () => {
  // In the image the pnpm store is elsewhere, and a post step that saves a path that does not exist
  // fails its job: the mutation shards of #170's queue run 39814190074.
  const jobs = Object.entries(ciJobs()).filter(([, job]) => /^ {4}container:/m.test(job));
  assert.ok(jobs.length > 0);
  for (const [id, job] of jobs) {
    for (const step of job.split(/\n(?= {6}- )/).filter((text) => text.includes("uses: actions/setup-node@"))) assert.match(step, /^ {10}cache: ""$/m, id);
  }
});

test("CI's browser jobs run in Playwright's image at the version package.json pins, and only visual installs system packages on the runner", () => {
  const { devDependencies } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const tag = `v${devDependencies.playwright}-noble`;
  const jobs = ciJobs();
  const inImage = Object.entries(jobs).filter(([, job]) => /^ {4}container:/m.test(job)).map(([id]) => id);
  assert.deepEqual(inImage.sort(), ["browser", "browser-fallback", "check-node", "check-node-merge", "conformance-shard", "design", "e2e-shard", "install-checks", "install-latest", "install-prep", "install-shard", "latency-shard", "mutation-shard", "scripts-browser", "subsets", "sweep-shard", "theme-install", "themes-shard"]);
  for (const id of inImage) {
    // The browsers and their system packages are in the image: nothing is installed from Ubuntu's mirror.
    // Its digest's tag names the version package.json pins; the runner's zstd lets actions/cache there
    // compress as on the runner, so the caches the runner saves (Stryker's) are found.
    assert.match(jobs[id], new RegExp(`^ {4}container:\\n {6}image: mcr\\.microsoft\\.com/playwright@sha256:[0-9a-f]{64} # ${tag.replace(/[.]/g, "\\.")}\\n {6}options: --user 1001 -v /usr/bin/zstd:/usr/bin/zstd:ro\\n {6}env:\\n {8}OURO_SYSTEM_PACKAGES: image\\n`, "m"), id);
    // The pnpm store's path differs in the image, so the runner's cache of it never matches: it is off.
    assert.match(jobs[id], /uses: actions\/setup-node@[^\n]*\n {8}with:\n {10}node-version: 24\n {10}cache: ""\n/, id);
    // The runner's zstd needs the libraries of the image's Ubuntu (24.04, noble).
    assert.match(jobs[id], /^ {4}runs-on: ubuntu-24\.04$/m, id);
    assert.doesNotMatch(jobs[id], /playwright-browsers|browser-deps|sudo|apt-get/, id);
  }
  // visual's screenshots were taken with the runner's fonts, which the image lacks: it keeps the
  // runner, and the system packages from their cache (scripts/browser-deps.sh, through the action).
  assert.deepEqual(Object.entries(jobs).filter(([, job]) => job.includes("uses: ./.github/actions/playwright-browsers")).map(([id]) => id), ["visual"]);
  // The script tests that drive a browser run in the image; the others need none.
  assert.doesNotMatch(jobs.scripts, /container:|playwright-browsers/);
  assert.match(jobs["scripts-browser"], /\$\(node scripts\/shard\.mjs scripts-browser "\$SHARD"\)/);
  assert.match(jobs.ci, /needs: \[plan, checks, attribution, design, browser, subsets, scripts, scripts-browser, check-node, check-node-merge, coverage, browser-fallback, screen-reader\]/);
  assert.match(jobs.ci, /"design=\$DESIGN"/);
  assert.match(jobs.ci, /"scripts-browser=\$SCRIPTS_BROWSER"/);
  assert.match(jobs.ci, /"check-node=\$CHECK_NODE" "check-node-merge=\$CHECK_NODE_MERGE"/);
  assert.match(jobs["check-node"], /node scripts\/check-node-coverage\.mjs run "\$GROUP"/);
  assert.match(jobs["check-node-merge"], /node scripts\/check-node-coverage\.mjs merge \.tmp\/check-coverage/);
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
  assert.match(browserAction, /- if: steps\.restore\.outputs\.cache-hit != 'true' && github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'\n\s+uses: actions\/cache\/save@/);
  // The system packages' .deb files, kept per runner image version (whose installed packages they
  // complete), architecture, Playwright version and browsers.
  assert.match(browserAction, /debs-key=browser-debs-\$\{RUNNER_OS\}-\$\{image\}-\$\{ImageVersion:-unknown\}-\$\{RUNNER_ARCH\}-\$\{version\}-\$\{set\}/);
  assert.match(browserAction, /- if: inputs\.system-packages == 'true'\n\s+id: debs\n\s+uses: actions\/cache\/restore@/);
  assert.match(browserAction, /- if: inputs\.system-packages == 'true' && steps\.debs\.outputs\.cache-hit != 'true' && github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'\n\s+uses: actions\/cache\/save@[0-9a-f]{40} # v[\d.]+\n\s+# Another job may have saved the same key first\.\n\s+continue-on-error: true/);
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
  // pnpm fails its first $PNPM_FAILS calls, as an install stopped by timeout does.
  writeFileSync(join(bin, "pnpm"), `#!/usr/bin/env bash\nprintf 'pnpm %s\\n' "$*" >> "${log}"\nn=$(grep -c '^pnpm ' "${log}")\n[ "$n" -gt "\${PNPM_FAILS:-0}" ]\n`);
  writeFileSync(join(bin, "apt-get"), `#!/usr/bin/env bash\nprintf 'apt-get %s\\n' "$*" >> "${log}"\n`);
  writeFileSync(join(bin, "timeout"), `#!/usr/bin/env bash\nprintf 'timeout %s\\n' "$1" >> "${log}"\nshift\nexec "$@"\n`);
  writeFileSync(join(bin, "pkill"), `#!/usr/bin/env bash\nprintf 'pkill %s\\n' "$*" >> "${log}"\n`);
  writeFileSync(join(bin, "sleep"), `#!/usr/bin/env bash\n`);
  for (const name of ["uname", "sudo", "tee", "dpkg", "pnpm", "apt-get", "timeout", "pkill", "sleep"]) chmodSync(join(bin, name), 0o755);
  const run = (dir, env = {}) => {
    writeFileSync(log, "");
    const result = spawnSync("bash", [join(root, "scripts/browser-deps.sh"), dir, "chromium", "webkit"], { encoding: "utf8", env: sandboxEnv(env, [bin]) });
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
  assert.doesNotMatch(miss.calls, /^dpkg -i/m);
  // A mirror that stops answering: a stalled download fails and is tried again, and the install is stopped after 15 minutes and run again.
  for (const result of [broken, miss]) {
    assert.match(result.calls, /^tee \/etc\/apt\/apt\.conf\.d\/90ouro-acquire\nAcquire::http::Timeout "60";\nAcquire::https::Timeout "60";\nAcquire::Retries "3";\n(?:.*\n)*dpkg --configure -a\ntimeout 900\npnpm exec playwright install-deps chromium webkit$/m);
  }
  // Each try first mends what a stopped one left half unpacked.
  const retried = run(join(scratch, "retried"), { PNPM_FAILS: "1", RETRY_DELAYS: "0" });
  assert.equal(retried.status, 0, retried.stdout + retried.stderr);
  // A later try first stops the apt-get the last one left holding apt's list lock (main's run 44663533747); the first stops nothing.
  assert.match(retried.calls, /^dpkg --configure -a\ntimeout 900\npnpm exec playwright install-deps chromium webkit\npkill -x apt-get\npkill -KILL -x apt-get\ndpkg --configure -a\ntimeout 900\npnpm exec playwright install-deps chromium webkit$/m);
  for (const result of [broken, miss]) assert.doesNotMatch(result.calls, /^pkill/m);
  // A second apt waits for dpkg's lock rather than failing at once, on a hit and on a miss.
  for (const result of [hit, miss]) assert.match(result.calls, /^tee \/etc\/apt\/apt\.conf\.d\/90ouro-dpkg-lock\nDPkg::Lock::Timeout "600";$/m);
  assert.ok(existsSync(join(empty, "partial")));
});

// The repository's scripts, which CI also runs: the .mjs files under scripts/ and site/scripts/, but their tests.
const scriptSources = ["scripts", "site/scripts"].flatMap((folder) =>
  treeFiles(join(root, folder))
    .filter((file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs"))
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
  assert.deepEqual(
    spawned.filter((line) => !/"scripts\/retry\.sh", \["pnpm", "exec", "playwright", "install"(, "--with-deps"|, \.\.\.deps)?(, "(chromium|webkit)")+\]/.test(line)),
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
    const result = spawnSync("bash", [join(root, "scripts/retry.sh"), fetch], { encoding: "utf8", env: sandboxEnv({ RETRY_DELAYS: "0 0", PASS_ON: String(passOn) }) });
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

test("only the jobs that push, release.yml's release job, docs-pin.yml's pin job and sync-brand.yml's sync job, keep the checkout's credentials", () => {
  const problems = [];
  for (const { file, text } of workflows) {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!/uses: actions\/checkout@/.test(line)) return;
      const step = lines.slice(index + 1, index + 4).join("\n");
      const persists = !/^\s+persist-credentials: false$/m.test(step);
      const job = lines.slice(0, index).findLast((above) => /^ {2}[\w-]+:$/.test(above))?.trim().slice(0, -1);
      const pushes = (file === "release.yml" && job === "release") || ((file === "docs-pin.yml" || file === "core-pin.yml" || file === "kit-pin.yml") && job === "pin") || (file === "sync-brand.yml" && job === "sync");
      if (persists !== pushes) problems.push(`${file}:${index + 1}`);
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

test("install-upgrade's adds resolve GitHub refs through fetch, where the raw-fetch preload sees them: GH_TOKEN makes shadcn use its token path, not the gh CLI", () => {
  const ci = rawWorkflows.find(({ file }) => file === "ci.yml").text;
  assert.match(ci, /^ {6}- run: scripts\/install-test\.sh upgrade "\$RUNNER_TEMP\/app"\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/m);
});

test("install-github runs no install at the root: the harness installs the release tag's dependencies, and reads its registry.json (#2194)", () => {
  const job = ciJobs()["install-github"];
  assert.doesNotMatch(job, /^ {8}run: pnpm i\b/m);
  assert.match(job, /^ {6}- run: scripts\/install-test\.sh github /m);
  // The harness reads this commit's generated registry.json for every variant but github.
  assert.match(readFileSync(join(root, "scripts/install-test.sh"), "utf8"), /^if \[ "\$variant" != github \]; then\n(?: {2}#.*\n)* {2}items=\(/m);
});

const latestRelease = () => JSON.parse(readFileSync(join(root, "package.json"), "utf8")).ouro.latestRelease;

// The install-github harness: a stand-in release tree served by git's `archive`, and stand-ins for
// git, npm, pnpm, npx and sleep (a stand-in sleep logs its backoff and returns at once). `npxBody`
// is the stand-in npx's bash body; it runs with BIN, CALLS and the env given.
function runGithubInstall(npxBody, env = {}) {
  const tag = latestRelease();
  const tree = scratchDir("ouro-tag-");
  mkdirSync(join(tree, "scripts"), { recursive: true });
  mkdirSync(join(tree, "test/install-fixture"), { recursive: true });
  // The tag's install-test.sh: its pins and its runtime_only, which install-github runs as written.
  writeFileSync(
    join(tree, "scripts/install-test.sh"),
    [
      "shadcn=(npx --yes shadcn@9.8.7)",
      "vitest=(npx --yes vitest@9.8.6)",
      "runtime_only() {",
      '  node "$root/scripts/install-check.mjs" "$app" "$1" runtime',
      '  "${vitest[@]}" run --passWithNoTests',
      "}",
      "echo 'the rest of the tag's script never runs'; exit 9",
      "",
    ].join("\n"),
  );
  writeFileSync(join(tree, "scripts/install-check.mjs"), 'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.CALLS, `tag check ${process.argv.slice(2).join(" ")}\\n`);\n');
  writeFileSync(join(tree, "test/install-fixture/from-the-tag.txt"), "the tag's fixture\n");
  writeFileSync(join(tree, "registry.json"), JSON.stringify({ items: [{ name: "dialog", type: "registry:ui" }, { name: "dialog-tests", type: "registry:component" }] }));
  const bin = scratchDir("ouro-install-bin-");
  const calls = join(bin, "calls.log");
  const stub = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub("git", `case "$*" in *" archive "*) tar -C "${tree}" -cf - . ;; *"rev-parse HEAD"*) echo abc123 ;; *) exit 0 ;; esac`);
  stub("npm", `echo "npm $*" >> "${calls}"`);
  stub("pnpm", `echo "pnpm $* in $(basename "$PWD")" >> "${calls}"`);
  stub("npx", npxBody);
  stub("sleep", `echo "sleep $*" >> "${calls}"`);
  const app = join(scratchDir("ouro-install-app-"), "app");
  const result = spawnSync("bash", [join(root, "scripts/install-test.sh"), "github", app], { encoding: "utf8", env: sandboxEnv({ ...env, CALLS: calls, BIN: bin }, [bin]) });
  const log = existsSync(calls) ? readFileSync(calls, "utf8").split("\n").filter(Boolean) : [];
  return { tag, app, result, log };
}

// A stand-in npx whose `add` fails FAILS times with FAIL_TEXT, then succeeds; every call is logged.
const failingAddNpx = `case "$*" in
  *" add "*)
    n=$(( $(cat "$BIN/adds" 2>/dev/null || echo 0) + 1 ))
    echo "$n" > "$BIN/adds"
    echo "npx $*" >> "$CALLS"
    if [ "$n" -le "$FAILS" ]; then echo "$FAIL_TEXT" >&2; exit 1; fi ;;
  *) echo "npx $*" >> "$CALLS" ;;
esac`;

test("install-github checks the newest release with that release's own harness: its dependencies, fixture app, shadcn pin and runtime checks", () => {
  const { tag, app, result, log } = runGithubInstall(`echo "npx $*" >> "$CALLS"`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(existsSync(join(app, "from-the-tag.txt")), "the fixture app is the tag's");
  assert.ok(!existsSync(join(app, "package.json")), "main's fixture app was copied in");
  assert.deepEqual(log, [
    "pnpm install --frozen-lockfile --ignore-scripts in tag",
    "npm install --no-audit --no-fund",
    "npx --yes shadcn@9.8.7 init --base base --preset nova --yes --no-monorepo",
    `npx --yes shadcn@9.8.7 add --yes ourostack/ouro-ui/ouro-base#${tag} ourostack/ouro-ui/dialog#${tag}`,
    "npx tsc -b",
    "npx vite build",
    `tag check ${app} shadcn runtime`,
    "npx --yes vitest@9.8.6 run --passWithNoTests",
  ]);
});

test("install-github retries a dropped raw.githubusercontent.com fetch with a warning and a backoff, then passes", () => {
  const tag = latestRelease();
  const { result, log } = runGithubInstall(failingAddNpx, {
    FAILS: "2",
    FAIL_TEXT: `RegistrySourceFileError: Failed to read GitHub source file "registry/ouro/components/ouro/dialog/dialog-parts.tsx" from ourostack/ouro-ui#${tag}. GitHub ref resolution succeeded, but the CLI could not fetch from raw.githubusercontent.com.`,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const add = `npx --yes shadcn@9.8.7 add --yes ourostack/ouro-ui/ouro-base#${tag} ourostack/ouro-ui/dialog#${tag}`;
  assert.deepEqual(log.filter((line) => line.includes(" add ")), [add, add, add], "the same add runs again, up to two more times");
  assert.deepEqual(log.filter((line) => line.startsWith("sleep ")), ["sleep 5", "sleep 15"]);
  assert.match(result.stdout, /::warning::shadcn could not fetch registry\/ouro\/components\/ouro\/dialog\/dialog-parts\.tsx from raw\.githubusercontent\.com \(attempt 1 of 3 failed\)/);
  assert.match(result.stdout, /\(attempt 2 of 3 failed\)/);
  assert.ok(log.includes("npx tsc -b"), "the install goes on to the type check once the add passes");
});

test("install-github fails once the raw fetch has dropped on every attempt", () => {
  const tag = latestRelease();
  const { result, log } = runGithubInstall(failingAddNpx, {
    FAILS: "3",
    FAIL_TEXT: `RegistrySourceFileError: Failed to read GitHub source file "registry/ouro/components/ouro/dialog/dialog-parts.tsx" from ourostack/ouro-ui#${tag}. GitHub ref resolution succeeded, but the CLI could not fetch from raw.githubusercontent.com.`,
  });
  assert.notEqual(result.status, 0);
  assert.equal(log.filter((line) => line.includes(" add ")).length, 3);
  assert.ok(!log.includes("npx tsc -b"), "a failed add stops the install before the checks");
});

test("install-github retries a registry.json read that the raw fetch cut off mid-body, with a warning, then passes", () => {
  const tag = latestRelease();
  const { result, log } = runGithubInstall(failingAddNpx, {
    FAILS: "1",
    FAIL_TEXT: `Something went wrong. Please check the error below for more details.\n\nError:\nFailed to read source registry file at ourostack/ouro-ui#${tag}/registry.json.\n\nMessage:\nTypeError: terminated\n\nSuggestion:\nCheck that the repository has a registry.json file at its root.`,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const add = `npx --yes shadcn@9.8.7 add --yes ourostack/ouro-ui/ouro-base#${tag} ourostack/ouro-ui/dialog#${tag}`;
  assert.deepEqual(log.filter((line) => line.includes(" add ")), [add, add], "the same add runs again");
  assert.deepEqual(log.filter((line) => line.startsWith("sleep ")), ["sleep 5"]);
  assert.match(result.stdout, new RegExp(`::warning::shadcn could not fetch ourostack/ouro-ui#${tag.replaceAll(".", "\\.")}/registry\\.json from raw\\.githubusercontent\\.com \\(attempt 1 of 3 failed\\)`));
  assert.ok(log.includes("npx tsc -b"), "the install goes on to the type check once the add passes");
});

test("install-github does not retry a registry.json that is missing: its 404 fails at once", () => {
  const tag = latestRelease();
  const { result, log } = runGithubInstall(failingAddNpx, {
    FAILS: "3",
    FAIL_TEXT: `Something went wrong. Please check the error below for more details.\n\nError:\nFailed to read GitHub source file "registry.json" from ourostack/ouro-ui#${tag}.\n\nMessage:\nHTTP 404`,
  });
  assert.notEqual(result.status, 0);
  assert.equal(log.filter((line) => line.includes(" add ")).length, 1, "a missing registry.json fails at once");
  assert.ok(!log.some((line) => line.startsWith("sleep ")), "and waits for no retry");
});

test("install-github does not retry any other add failure", () => {
  const tag = latestRelease();
  const { result, log } = runGithubInstall(failingAddNpx, {
    FAILS: "3",
    FAIL_TEXT: `RegistrySourceFileError: Failed to read GitHub source file "registry/ouro/components/ouro/dialog/dialog-parts.tsx" from ourostack/ouro-ui#${tag}. The file is not in that release.`,
  });
  assert.notEqual(result.status, 0);
  assert.equal(log.filter((line) => line.includes(" add ")).length, 1, "a missing file fails at once");
  assert.ok(!log.some((line) => line.startsWith("sleep ")), "and waits for no retry");
});

test("install-github runs its add with the raw fetch retry preloaded into shadcn's process", () => {
  const { result, log } = runGithubInstall(`echo "npx $* [$NODE_OPTIONS]" >> "$CALLS"`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const add = log.filter((line) => line.includes(" add "));
  assert.equal(add.length, 1);
  assert.ok(add[0].endsWith(` [--import=${join(root, "scripts/raw-fetch-retry-preload.mjs")}]`), add[0]);
});

test("Form answer proof propagates a failing test command through both logged pipelines", () => {
  const proof = readFileSync(join(dir, "form-answer-proof.yml"), "utf8");
  const browser = proof.match(/- name: Shipped Form, constructor and Link regressions with focused coverage\n(?:\s+if: [^\n]+\n)?\s+run: \|\n([\s\S]+?)\n\s+- if: always\(\)/)?.[1];
  const node = proof.match(/run: (pnpm exec vitest run --config test\/form-answer\.config\.ts[^\n]*)/)?.[1];
  assert.ok(browser && node, "The proof must execute both regression commands.");
  // GitHub's implicit shell is bash -e; explicit shell: bash additionally sets pipefail.
  const strict = /^defaults:\n {2}run:\n {4}shell: bash$/m.test(proof);
  for (const script of [node, browser]) {
    const controlled = `pnpm() { return 17; }\n${script.replace(/tee \.tmp\/adopt-a-form-value\/[\w-]+\.log/g, "tee /dev/null")}`;
    const control = spawnSync("bash", ["-e", "-c", controlled], { encoding: "utf8", env: sandboxEnv() });
    assert.equal(control.status, 0, "The former implicit-shell pipeline conceals the test failure.");
    const args = strict ? ["--noprofile", "--norc", "-e", "-o", "pipefail"] : ["-e"];
    const actual = spawnSync("bash", [...args, "-c", controlled], { encoding: "utf8", env: sandboxEnv() });
    assert.equal(actual.status, 17, "A failed regression/coverage command must fail the proof job, not only tee.");
  }
});

test("Form answer proof skips its fixture, browsers and tests only on a pull request whose change cannot reach it", () => {
  const proof = readFileSync(join(dir, "form-answer-proof.yml"), "utf8");
  // HEAD^1 is the pull request's base in its merge commit.
  assert.match(proof, /^ {6}- uses: actions\/checkout@\S+ # v[\d.]+\n {8}with:\n {10}persist-credentials: false\n {10}fetch-depth: 2$/m);
  const steps = proof.slice(proof.indexOf("    steps:")).split(/\n {6}- /).slice(1);
  const at = steps.findIndex((step) => /^id: impact$/m.test(step));
  assert.ok(at > 0, "the impact step");
  const impact = steps[at];
  assert.match(impact, /if \[ "\$EVENT" = pull_request \]; then\n\s+node scripts\/form-answer-impact\.mjs HEAD\^1 HEAD \|\| echo "run=true" >> "\$GITHUB_OUTPUT"\n\s+else\n\s+echo "The proof runs: \$EVENT\."\n\s+echo "run=true" >> "\$GITHUB_OUTPUT"\n\s+fi/);
  for (const step of steps.slice(0, at)) assert.doesNotMatch(step, /vitest|npm ci|playwright/, step);
  const after = steps.slice(at + 1);
  assert.ok(after.length >= 5);
  for (const step of after) assert.match(step, /^(?:- )?(?:if: |\s+if: )(?:always\(\) && )?steps\.impact\.outputs\.run == 'true'$/m, step);
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
/** One job's block of a workflow's text, from its `  name:` line to the next job. */
const jobIn = (text, name, file = "workflow") => {
  const start = text.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `${file} has no ${name} job`);
  const next = text.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return text.slice(start, next === -1 ? undefined : start + 1 + next);
};
const job = (name) => jobIn(scheduled, name, "scheduled-install.yml");


test("Scheduled install installs GitHub's newest release and checks the site names it", () => {
  const latest = job("latest");
  assert.match(workflow("scheduled-install.yml"), /gh api "repos\/\${{ github\.repository }}\/releases\/latest" --jq \.tag_name/);
  assert.match(latest, /node scripts\/published-release\.mjs "\${{ needs\.refs\.outputs\.tag }}"/);
});

test("Scheduled install reports any failure in one issue, with issues: write on that job only", () => {
  const report = job("report");
  assert.match(report, /needs: \[refs, latest, install, install-latest\]\n\s+if: failure\(\)/);
  assert.match(report, /permissions:\n\s+contents: read\n\s+issues: write/);
  assert.match(report, /run: scripts\/scheduled-failure\.sh /);
  assert.match(scheduled, /^permissions:\n {2}contents: read\njobs:/m);
});

test("Required checks compares the file with main's live rules hourly, on a change to it, and by hand, and reports only a drift, in one issue, at most daily", () => {
  const text = workflow("required-checks.yml");
  assert.match(text, /^ {2}schedule:\n {4}- cron: "\d+ \* \* \* \*"$/m);
  assert.match(text, /^ {2}workflow_dispatch:$/m);
  for (const event of ["push", "pull_request"]) {
    const block = text.split(new RegExp(`^ {2}${event}:\n`, "m"))[1].split(/\n {2}\S/)[0];
    for (const path of [".github/required-checks.json", "scripts/required-checks.mjs", ".github/workflows/required-checks.yml"]) assert.ok(block.includes(`- ${path}`), `${event} ${path}`);
  }
  assert.match(text, /^permissions:\n {2}contents: read\n(#.*\n)*concurrency:\n/m);
  assert.match(text, /^ {8}id: compare\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/required-checks\.mjs$/m);
  assert.match(text, /^ {4}outputs:\n {6}drift: \$\{\{ steps\.compare\.outputs\.drift \}\}$/m);
  const report = text.slice(text.indexOf("\n  report:\n"));
  // An API error is no drift: the report waits on the drift output, not on any failure.
  assert.match(report, /needs: \[compare\]\n\s+if: always\(\) && needs\.compare\.outputs\.drift == 'true' && github\.event_name != 'pull_request'/);
  assert.match(report, /QUIET_HOURS: 24/);
  assert.match(report, /permissions:\n\s+contents: read\n\s+issues: write/);
  assert.match(report, /run: scripts\/scheduled-failure\.sh "[^"]+" "Required checks drifted" /);
});

test("pages-clear.sh cancels other builds' Pages deployments that did not succeed, waits for one in progress to settle, and leaves this one, succeeded ones and a broken gh alone (#2447)", () => {
  const bin = scratchDir("ouro-gh-");
  const log = join(bin, "calls.log");
  const cancelled = join(bin, "cancelled");
  // A stand-in gh: this run's deployment (cur), one GitHub still holds (old) until it is cancelled, one that reads cancelled
  // already (gone), which once still held off deploys until it was cancelled again, and one that succeeded (done).
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\n[ -z "$BROKEN" ] || exit 1\ncase "$*" in\n  *"deployments?environment=github-pages"*) printf 'cur\\nold\\nold\\ngone\\ndone\\n' ;;\n  *"pages/deployments/gone/cancel"*) ;;\n  *"pages/deployments/gone --jq .status") echo deployment_cancelled ;;\n  *"pages/deployments/old/cancel"*) touch "${cancelled}" ;;\n  *"pages/deployments/old --jq .status") [ -e "${cancelled}" ] && echo deployment_cancelled || echo updating_pages ;;\n  *"pages/deployments/done --jq .status") echo succeed ;;\n  *) exit 99 ;;\nesac\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  const run = (env = {}) => spawnSync("bash", [join(root, "scripts/pages-clear.sh"), "cur"], { encoding: "utf8", env: sandboxEnv({ GH_REPO: "o/r", GH_TOKEN: "t", PAGES_CLEAR_SLEEP: "0", ...env }, [bin]) });
  const cleared = run();
  assert.equal(cleared.status, 0, cleared.stderr);
  assert.match(cleared.stdout, /The Pages deployment of old is updating_pages: cancelling it/);
  assert.match(cleared.stdout, /The Pages deployment of old is now deployment_cancelled\./);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(calls.filter((call) => call.includes("/cancel")), ["api -X POST repos/o/r/pages/deployments/old/cancel", "api -X POST repos/o/r/pages/deployments/gone/cancel"]);
  assert.ok(!calls.some((call) => call.includes("pages/deployments/cur")), "this run's own deployment is never read or cancelled");
  // A gh that answers nothing leaves the deploy to fail as before, without failing the job here.
  const broken = run({ BROKEN: "1" });
  assert.equal(broken.status, 0, broken.stderr);
  assert.equal(broken.stdout, "");
});

test("pages-clear.sh bounds every gh call, so one that hangs returns within its own bound instead of blocking the job for hours (#3375)", () => {
  const bin = scratchDir("ouro-gh-hang-");
  // A gh that never answers the deployments listing, as happened when GitHub's own retry for a rate limit hung for
  // nearly two hours with no timeout on the call (#3375).
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\ncase "$*" in\n  *"deployments?environment=github-pages"*) sleep 600 ;;\n  *) exit 99 ;;\nesac\n`);
  chmodSync(join(bin, "gh"), 0o755);
  const before = Date.now();
  const cleared = spawnSync("bash", [join(root, "scripts/pages-clear.sh"), "cur"], {
    encoding: "utf8",
    env: sandboxEnv({ GH_REPO: "o/r", GH_TOKEN: "t", PAGES_CLEAR_SLEEP: "0", PAGES_CLEAR_GH_TIMEOUT: "1" }, [bin]),
  });
  assert.equal(cleared.status, 0, cleared.stderr);
  assert.ok(Date.now() - before < 30_000, "returned well within its own one-second-per-call bound, not after the hang");
});

test("pages-clear.sh skips a deployments listing that is not a clean sha list, instead of splitting it into words and treating each as a sha (#3375)", () => {
  const bin = scratchDir("ouro-gh-garbage-");
  const log = join(bin, "calls.log");
  // The error body a secondary rate limit actually leaked onto stdout in place of the sha list (#3375), word-split by
  // the old `for sha in $(...)`, into dozens of fake shas it then polled and tried to cancel one by one.
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\ncase "$*" in\n  *"deployments?environment=github-pages"*) echo "You have exceeded a secondary rate limit" ;;\n  *) exit 99 ;;\nesac\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  const cleared = spawnSync("bash", [join(root, "scripts/pages-clear.sh"), "cur"], { encoding: "utf8", env: sandboxEnv({ GH_REPO: "o/r", GH_TOKEN: "t", PAGES_CLEAR_SLEEP: "0" }, [bin]) });
  assert.equal(cleared.status, 0, cleared.stderr);
  assert.equal(cleared.stdout, "");
  // Only the one listing call: no per-word follow-up call for "you", "have", "exceeded" and so on.
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), ["api repos/o/r/deployments?environment=github-pages&per_page=5 --jq .[].sha"]);
});

test("every job in pages.yml has timeout-minutes, so a hung step frees the pages concurrency group instead of blocking every later run (#3375)", () => {
  const pages = workflow("pages.yml");
  const jobs = pages.split(/^jobs:\n/m)[1].split(/\n(?= {2}[\w-]+:\n)/);
  assert.ok(jobs.length >= 3, "tip, build and deploy are all present");
  for (const job of jobs) {
    const id = job.match(/^ {2}([\w-]+):/)[1];
    assert.match(job, /^ {4}timeout-minutes: \d+$/m, `${id} has no timeout-minutes, so a hung step could block the pages concurrency group for the default six hours`);
  }
});

test("Pages clears a deployment still in progress before it deploys, and deploys once more after clearing again when GitHub refuses it (#2447)", () => {
  const deploy = workflow("pages.yml").split("\n  deploy:\n")[1];
  const steps = deploy.slice(deploy.indexOf("    steps:"));
  assert.match(deploy, /^ {6}url: \$\{\{ steps\.again\.outputs\.page_url \|\| steps\.deployment\.outputs\.page_url \}\}$/m);
  const clear = steps.indexOf('- run: scripts/pages-clear.sh "$GITHUB_SHA"');
  const first = steps.indexOf("- id: deployment\n        continue-on-error: true\n        uses: actions/deploy-pages@");
  const again = steps.indexOf("- id: again\n        if: steps.deployment.outcome == 'failure'\n        uses: actions/deploy-pages@");
  assert.ok(clear > 0 && first > clear && again > first, "clear, deploy, then deploy again only after a refusal");
  assert.match(steps, /- if: steps\.deployment\.outcome == 'failure'\n {8}run: \|\n[^\n]*\n {10}scripts\/pages-clear\.sh "\$GITHUB_SHA"\n/);
});

test("scheduled-failure.sh comments with the text it is given, and says \"Failed again\" by default", () => {
  const bin = scratchDir("ouro-gh-");
  const log = join(bin, "calls.log");
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\necho "$*" >> "${log}"\nif [ "$1 $2" = "issue list" ]; then printf '%s' 7; fi\n`);
  chmodSync(join(bin, "gh"), 0o755);
  const run = (...args) => spawnSync("bash", [join(root, "scripts/scheduled-failure.sh"), "https://github.com/o/r/actions/runs/5", ...args], { encoding: "utf8", env: sandboxEnv({}, [bin]) });
  assert.equal(run("Release waiting", "Waited too long").status, 0);
  assert.equal(run("Release waiting", "Waited too long", "Still waiting: 90 minutes").status, 0);
  const calls = readFileSync(log, "utf8").trim().split("\n").filter((call) => call.startsWith("issue comment "));
  assert.deepEqual(calls, ["issue comment 7 --body Failed again: https://github.com/o/r/actions/runs/5", "issue comment 7 --body Still waiting: 90 minutes"]);
});

test("scheduled-failure.sh opens the issue once, then comments on it", () => {
  const bin = scratchDir("ouro-gh-");
  const log = join(bin, "calls.log");
  // A stand-in gh: logs its arguments, and answers `issue list` with $OPEN and `issue view` with $LAST (the jq results).
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\nall="$*"\nprintf '%s\\n' "\${all//$'\\n'/ }" >> "${log}"\nif [ "$1 $2" = "issue list" ]; then printf '%s' "$OPEN"; fi\nif [ "$1 $2" = "issue view" ]; then printf '%s' "$LAST"; fi\n`);
  chmodSync(join(bin, "gh"), 0o755);
  const run = (open) =>
    spawnSync("bash", [join(root, "scripts/scheduled-failure.sh"), "https://github.com/o/r/actions/runs/1"], {
      encoding: "utf8",
      env: sandboxEnv({ OPEN: open }, [bin]),
    });
  assert.equal(run("").status, 0);
  assert.equal(run("42").status, 0);
  // Another workflow names its own issue and says what failed.
  assert.equal(spawnSync("bash", [join(root, "scripts/scheduled-failure.sh"), "https://github.com/o/r/actions/runs/2", "Required checks drifted", "The required checks drifted from main's rules"], { encoding: "utf8", env: sandboxEnv({ OPEN: "" }, [bin]) }).status, 0);
  // With QUIET_HOURS, an issue commented on (or opened) within that many hours gets no comment.
  const quiet = (last) => spawnSync("bash", [join(root, "scripts/scheduled-failure.sh"), "https://github.com/o/r/actions/runs/3", "Required checks drifted", "Drifted"], { encoding: "utf8", env: sandboxEnv({ OPEN: "7", LAST: String(last), QUIET_HOURS: "24" }, [bin]) });
  const now = Math.floor(Date.now() / 1000);
  assert.equal(quiet(now - 3600).status, 0);
  assert.equal(quiet(now - 25 * 3600).status, 0);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.match(calls[6], /^issue list /);
  assert.match(calls[7], /^issue view 7 --json createdAt,comments --jq /);
  assert.match(calls[8], /^issue list /);
  assert.match(calls[9], /^issue view 7 /);
  assert.equal(calls[10], "issue comment 7 --body Failed again: https://github.com/o/r/actions/runs/3");
  assert.equal(calls.length, 11);
  assert.match(calls[0], /^issue list --state open --search in:title "Scheduled install failed"/);
  assert.match(calls[1], /^issue create --title Scheduled install failed --body The weekly install of main and the newest release failed: https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  assert.match(calls[2], /^issue list /);
  assert.equal(calls[3], "issue comment 42 --body Failed again: https://github.com/o/r/actions/runs/1");
  assert.match(calls[4], /^issue list --state open --search in:title "Required checks drifted"/);
  assert.match(calls[5], /^issue create --title Required checks drifted --body The required checks drifted from main's rules: https:\/\/github\.com\/o\/r\/actions\/runs\/2/);
});

// v0.7.0 was out for two hours while the site's llms.txt and main's README still gave install
// commands for v0.6.0: main named the old release until a person merged the "Prepare main"
// pull request, and Pages then skipped three deploys in a row because main kept moving.

const workflow = (file) => workflows.find((entry) => entry.file === file).text;

const probe = workflow("skeleton-frames.yml");
const probeOn = probe.split(/^on:\n/m)[1].split(/\n(?=\S)/)[0];

test("the route profile probe runs by hand only, in WebKit, and no CI shard runs it", () => {
  const profile = workflow("route-profile.yml");
  const on = profile.split(/^on:\n/m)[1].split(/\n(?=\S)/)[0];
  assert.deepEqual([...on.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]), ["workflow_dispatch"]);
  assert.match(profile, /playwright test --config playwright\.route-profile\.config\.ts/);
  assert.doesNotMatch(workflow("ci.yml"), /route-profile/);
});

test("the skeleton frame probe runs daily and by hand, never on a pull request or a push", () => {
  assert.deepEqual([...probeOn.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]), ["schedule", "workflow_dispatch"]);
  const cron = /^ {4}- cron: "(\d+) (\d+) \* \* \*"$/m.exec(probeOn);
  assert.ok(cron, "a daily cron");
  // Off the hour, so the run does not queue with every other scheduled job at the same minute.
  assert.notEqual(cron[1], "0");
});

test("the skeleton frame probe runs one measurement at a time, in WebKit, and never beside itself", async () => {
  assert.match(probe, /^concurrency:\n {2}group: skeleton-frames\n {2}cancel-in-progress: false$/m);
  const frames = jobIn(probe, "frames", "skeleton-frames.yml");
  assert.match(frames, /^ {6}max-parallel: 1\n {6}matrix:\n {8}project: \[webkit\]$/m);
  assert.match(frames, /pnpm exec playwright test registry\/ouro\/e2e\/probes\/skeleton-frames\.spec\.ts --config playwright\.probes\.config\.ts --project "\$PROJECT"/);
  const config = (await import("../playwright.probes.config.ts")).default;
  assert.deepEqual(config.projects.map((project) => project.name), ["webkit"]);
});

test("the skeleton frame probe files a failed scheduled run in one issue, with issues: write on that job only", () => {
  const report = jobIn(probe, "report", "skeleton-frames.yml");
  assert.match(report, /needs: frames\n\s+if: failure\(\) && github\.event_name == 'schedule'\n/);
  assert.match(report, /permissions:\n\s+contents: read\n\s+issues: write/);
  assert.match(report, /run: scripts\/scheduled-failure\.sh "[^"]+" "Skeleton frames probe failed" /);
  assert.equal(probe.match(/issues: write/g)?.length, 1);
  assert.match(probe, /^permissions:\n {2}contents: read\nconcurrency:/m);
});

test("the skeleton frame probe runs in the image the e2e shards run in, and CI pins that image", () => {
  const image = (text) => text.match(/^ {6}image: (mcr\.microsoft\.com\/playwright@sha256:[0-9a-f]{64} # v[\w.-]+)$/m)?.[1];
  assert.ok(image(probe));
  assert.equal(image(probe), image(ciJobs()["e2e-shard"]));
});

test("CI's e2e shards never run the skeleton frame probe: the probes are no e2e spec, and the main config ignores them", async () => {
  const { e2eFiles } = await import("./shard.mjs");
  const files = e2eFiles();
  assert.ok(files.includes("registry/ouro/e2e/ouro/skeleton.spec.ts"));
  assert.deepEqual(files.filter((file) => file.includes("/probes/")), []);
  const main = (await import("../playwright.config.ts")).default;
  assert.ok(main.testIgnore.test("registry/ouro/e2e/probes/skeleton-frames.spec.ts"));
  assert.ok(main.testIgnore.test("/checkout/registry/ouro/e2e/probes/skeleton-frames.spec.ts"));
  const probes = (await import("../playwright.probes.config.ts")).default;
  assert.equal(probes.testDir, "registry/ouro/e2e/probes");
});

test("published-release verification validates its tag, reads protected main and runs the existing public proofs without write permission", () => {
  assert.ok(existsSync(join(dir, "verify-published.yml")), "A published release needs a read-only hosted verification entry.");
  const text = workflow("verify-published.yml");
  assert.match(text, /^ {2}workflow_dispatch:\n/m);
  assert.doesNotMatch(text, /^ {2}(push|pull_request|schedule):/m);
  assert.match(text, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(text, /^\s+(contents|actions|pages|id-token|pull-requests): write$/m);
  assert.match(text, /ref: main\n\s+persist-credentials: false/);
  assert.match(text, /node scripts\/published-release\.mjs "\$TAG" --wait 900/);
  assert.match(text, /node scripts\/public-registry\.mjs verify-live "\$TAG" --wait 900/);
  const block = /- name: Validate the release tag\n[\s\S]*?run: \|\n((?: {10}[^\n]*\n)+)/.exec(text)?.[1];
  assert.ok(block, "The tag validator must run before repository setup.");
  const script = block.replace(/^ {10}/gm, "");
  for (const tag of ["v1.2.1", "v0.0.1", "v12.34.56"]) {
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: sandboxEnv({ TAG: tag }) });
    assert.equal(result.status, 0, `${tag}: ${result.stderr}${result.stdout}`);
  }
  for (const tag of ["", "main", "1.2.1", "v1.2.1-beta", "v1.2.1; false", "../v1.2.1"]) {
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: sandboxEnv({ TAG: tag }) });
    assert.equal(result.status, 1, tag);
    assert.match(result.stdout + result.stderr, /::error::/);
  }
});

test("published-release verification refuses unfinished main, drafts, prereleases and a missing release", () => {
  const text = workflow("verify-published.yml");
  const block = /- name: Check the published release and current main\n[\s\S]*?run: \|\n((?: {10}[^\n]*\n)+)/.exec(text)?.[1];
  assert.ok(block);
  const script = block.replace(/^ {10}/gm, "");
  const bin = scratchDir("ouro-verify-release-");
  writeFileSync(join(bin, "node"), '#!/usr/bin/env bash\nprintf "%s\\n" "$RECORDED_TAG"\n');
  writeFileSync(join(bin, "gh"), '#!/usr/bin/env bash\nif [ "${GH_EXIT:-0}" != 0 ]; then echo "release not found" >&2; exit "$GH_EXIT"; fi\nprintf "%s\\n" "$RELEASE_JSON"\n');
  chmodSync(join(bin, "node"), 0o755);
  chmodSync(join(bin, "gh"), 0o755);
  const run = (extra = {}) => spawnSync("bash", ["-e", "-c", script], {
    encoding: "utf8",
    env: sandboxEnv({ TAG: "v1.2.1", RECORDED_TAG: "v1.2.1", RELEASE_JSON: '{"isDraft":false,"isPrerelease":false}', GH_EXIT: "0", ...extra }, [bin]),
  });
  assert.equal(run().status, 0);
  const unfinished = run({ RECORDED_TAG: "v1.2.0" });
  assert.equal(unfinished.status, 1);
  assert.match(unfinished.stdout, /Merge the release preparation PR/);
  for (const metadata of ['{"isDraft":true,"isPrerelease":false}', '{"isDraft":false,"isPrerelease":true}', "{}"]) {
    const result = run({ RELEASE_JSON: metadata });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /must be a published stable release/);
  }
  const missing = run({ GH_EXIT: "1" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /release not found/);
});

test("Pages deploys on every push to main from that commit, never after main's CI", () => {
  const pages = workflow("pages.yml");
  assert.match(pages, /\non:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:/);
  assert.doesNotMatch(pages, /workflow_run/);
  assert.match(pages, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(pages, /\$tip" = "\$HEAD_SHA"/);
});

test("Pages names GitHub's newest release before it builds, whatever main's package.json says", () => {
  const pages = workflow("pages.yml");
  const name = pages.indexOf('gh api "repos/$REPO/releases/latest" --jq .tag_name');
  const set = pages.indexOf('node scripts/latest-release.mjs set "$newest"');
  assert.ok(name > 0 && set > name, "pages.yml asks GitHub for the newest release and sets it");
  assert.ok(pages.indexOf("pnpm run docs", set) > set, "then regenerates the docs that name it");
  assert.ok(pages.indexOf("pnpm site:build") > set, "before the site builds");
  assert.ok(pages.indexOf("scripts/namespace.sh _site/r") > set, "and before the namespace builds");
});

test("Pages writes core's newest release into the Platforms pages before it builds, and keeps main's copies when GitHub cannot be read", () => {
  const pages = workflow("pages.yml");
  const write = pages.indexOf("node scripts/platform-versions.mjs --write || code=$?");
  const render = pages.indexOf("node scripts/parity-matrix.mjs --render");
  assert.ok(write > 0, "pages.yml writes core's copies and the Platforms pages from GitHub");
  assert.ok(render > write, "then renders the parity page from the copies it wrote");
  assert.ok(pages.indexOf("pnpm site:build") > render, "before the site builds");
  assert.match(pages, /if \[ "\$code" = 2 \]; then\n\s+echo "Core's newest release could not be read[^\n]*>> "\$GITHUB_STEP_SUMMARY"\n\s+elif \[ "\$code" != 0 \]; then\n\s+exit "\$code"\n\s+fi\n/);
});

test("the scheduled Apple check holds only what is pinned, through --live, and only Pages writes core's release and the kits' newest releases", () => {
  const apple = workflow("apple-release.yml");
  assert.match(apple, /run: node scripts\/platform-versions\.mjs --live$/m);
  assert.match(apple, /^ {12}node scripts\/parity-matrix\.mjs --live$/m);
  assert.match(apple, /^ {12}node scripts\/parity-matrix\.mjs --live --pins$/m);
  assert.doesNotMatch(apple, /platform-versions\.mjs --(write|render|apple)/);
  assert.doesNotMatch(apple, /run: node scripts\/parity-matrix\.mjs --(write|render)/);
  assert.match(workflow("pages.yml"), /node scripts\/platform-versions\.mjs --write/);
  assert.match(workflow("pages.yml"), /node scripts\/parity-matrix\.mjs --write/);
});

test("Pages writes the other kits' newest releases into the parity matrix before it builds, and keeps main's copy when GitHub cannot be read", () => {
  const pages = workflow("pages.yml");
  const core = pages.indexOf("node scripts/platform-versions.mjs --write || code=$?");
  const write = pages.indexOf("node scripts/parity-matrix.mjs --write || code=$?");
  const render = pages.indexOf("node scripts/parity-matrix.mjs --render");
  assert.ok(write > core, "pages.yml writes the matrix's kits after core's copies");
  assert.ok(render > write, "then renders the matrix from the data it wrote");
  assert.ok(pages.indexOf("pnpm site:build") > render, "before the site builds");
  assert.match(pages, /if \[ "\$code" = 2 \]; then\n\s+echo "The other kits' newest releases could not be read[^\n]*>> "\$GITHUB_STEP_SUMMARY"\n\s+elif \[ "\$code" != 0 \]; then\n\s+exit "\$code"\n\s+fi\n/);
});

test("CI cancels only a pull request's superseded run: never a merge-queue, main or dispatched run", () => {
  const text = workflow("ci.yml");
  const block = text.split("\nconcurrency:\n")[1].split(/\n(?=\S)/)[0];
  assert.equal(block, ["  group: ci-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}", "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}"].join("\n"));
  assert.doesNotMatch(text.split("\njobs:\n")[1], /^\s+concurrency:/m, "no job has a group of its own that could cancel it");
});

test("Release takes main's CI from main's runs on its commit: a push, a dispatch on main, the merge queue's run, and the pull request run that proved its tree", () => {
  const release = workflow("release.yml");
  const filter = release.match(/ci=\$\(gh run list --workflow "\$workflow" --commit "\$sha" --json databaseId,event,headBranch --jq '([^']+)'\)/)?.[1];
  assert.ok(filter, "release.yml reads the runs on main's commit, on any branch");
  // That run passes when the checks main's rules require passed, whatever ci-budget did.
  assert.match(release, /\n +scripts\/required-ci\.sh \$runs \|\| \{ echo "::error::CI on main \(\$sha\) did not pass the checks main's rules require[^\n]+exit 1; \}\n/);
  // gh run list lists the newest run first; the step passes them all to required-ci.sh.
  const conclusion = (runs) => {
    const result = spawnSync("jq", ["-r", filter], { input: JSON.stringify(runs), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const run = (event, headBranch, databaseId) => ({ event, headBranch, databaseId });
  const queue = "gh-readonly-queue/main/pr-9-abc";
  assert.equal(conclusion([run("push", "main", 1)]), "1");
  // The push run after the queue skips every required job but install-github: the queue's run,
  // which passed them on this very commit, is passed with it (required-ci.sh: a check passes when one run passed it).
  assert.equal(conclusion([run("push", "main", 2), run("merge_group", queue, 1)]), "2 1");
  // A queue merge made with the workflow's token starts no push run: the queue's run decides.
  assert.equal(conclusion([run("merge_group", queue, 1)]), "1");
  assert.equal(conclusion([run("workflow_dispatch", queue, 1), run("pull_request", "fix", 2)]), "1");
  // The run release.yml dispatches on main after merging "Prepare main" (no push run either).
  assert.equal(conclusion([run("workflow_dispatch", "main", 1)]), "1");
  // A pull request's run, or a dispatch on another branch, is not main's CI.
  assert.equal(conclusion([run("pull_request", "fix", 1), run("workflow_dispatch", "release/v1.0.0", 2)]), "");
  // Except the pull request run whose tree-proof job passed on the commit's tree, which scripts/ci-proof.mjs finds
  // again, when main's push run skipped what that run had passed.
  assert.match(release, /\n +GITHUB_OUTPUT="\$proof_out" node scripts\/ci-proof\.mjs "\$sha"\n +proof=\$\(sed -n 's\/\^proof-run=\/\/p' "\$proof_out"\)\n +if \[ -n "\$proof" \]; then runs="\$runs \$proof"; fi\n/);
  assert.ok(release.indexOf("node scripts/ci-proof.mjs") < release.indexOf("scripts/required-ci.sh $runs"));
});


test("Release deploys Pages itself and fails when the published llms.txt or README names another release", () => {
  const release = workflow("release.yml");
  const deploy = release.indexOf("gh workflow run pages.yml --ref main");
  const check = release.indexOf('node scripts/published-release.mjs "$TAG" --wait');
  assert.ok(deploy > release.indexOf('git tag "$TAG"'), "Pages is deployed once the tag is out, in a job of its own");
  assert.match(release, /^ {2}pages:\n(?: {4}#.*\n)* {4}needs: release$/m, "which does not wait for the pull request that prepares main");
  assert.match(release, /^ {4}needs: \[release, pages\]$/m, "and the published page is checked once Pages has deployed");
  assert.ok(check > deploy);
});

test("the publish job caches no pnpm store: it runs no install, so a cache-save hiccup there cannot red a release", () => {
  const release = workflow("release.yml");
  const publish = release.split(/^ {2}publish:\n/m)[1].split(/^ {2}finish:\n/m)[0];
  assert.doesNotMatch(publish, /cache: pnpm/, "the publish job's check reads only node built-ins and never runs pnpm install, so there is nothing for a pnpm cache to save");
});

/** The rehearsal "Check the version, the tag and main's CI" records for the notes (scripts/rehearsal-evidence.mjs). */
const rehearsalNote = "Rehearsed: [the rehearsal of v9.9.9](https://github.com/ourostack/ouro-ui/actions/runs/7) passed on main's commit `" + "a".repeat(40) + "`, which this release is cut from.\n";

/** Runs "Tag and publish the release" in a folder holding this registry.json and UPGRADING.md, the CHANGES.md given and the rehearsal's note (none when null), with git and gh logged; returns the notes it published. */
function publishRelease(changes, rehearsal = rehearsalNote) {
  const fixture = scratchDir("ouro-release-notes-");
  const temp = join(fixture, "runner-temp");
  mkdirSync(temp);
  if (rehearsal !== null) writeFileSync(join(temp, "proof.md"), rehearsal);
  for (const file of ["registry.json", "UPGRADING.md"]) copyFileSync(join(root, file), join(fixture, file));
  writeFileSync(join(fixture, "CHANGES.md"), changes);
  const calls = join(fixture, "calls.log");
  const published = join(fixture, "published.md");
  const stubs = `
git() { printf 'git %s\\n' "$*" >> "${calls}"; }
gh() {
  printf 'gh %s\\n' "$*" >> "${calls}"
  case "$*" in "release create "*) cp "\${@: -1}" "${published}" ;; esac
}
`;
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", stubs + releaseStep("Tag and publish the release")], {
    cwd: fixture,
    encoding: "utf8",
    env: sandboxEnv({ TAG: "v9.9.9", BRANCH: "release/v9.9.9", GITHUB_REPOSITORY: "ourostack/ouro-ui", RUNNER_TEMP: temp }),
  });
  return { ...result, temp, calls: existsSync(calls) ? readFileSync(calls, "utf8") : "", notes: existsSync(published) ? readFileSync(published, "utf8") : undefined };
}

test("Release's notes list the items by name and stay well under GitHub's 125,000-character limit for this registry", () => {
  // v1.3.0's release (run 41279874378) failed at `gh release create`: with every item's description, the notes were over the limit.
  // A release lists only the fragment lines its predecessor's tag did not hold (scripts/changes.mjs), so the notes
  // are measured the same way: every fragment on main less those at the newest release tag here (#1485). CI
  // fetches that tag before the script tests.
  const newest = execFileSync("git", ["tag", "--list", "v*", "--sort=-v:refname"], { cwd: root, encoding: "utf8" }).split("\n")[0];
  assert.ok(newest, "no release tag in this checkout: fetch the newest, git fetch --no-tags --depth=1 origin refs/tags/<tag>:refs/tags/<tag>");
  const changes = assemble(join(root, "changes"), releasedAt(newest, "changes", root).join("\n"));
  const { status, stdout, stderr, calls, notes, temp } = publishRelease(changes);
  assert.equal(status, 0, stdout + stderr);
  assert.ok([...notes].length < 100_000, `the notes are ${[...notes].length} characters; keep them under 100,000 so growth fails here before GitHub refuses them`);
  assert.ok(!/\[\^[^\]]*\]/.test(notes), "the notes drop UPGRADING.md's footnotes, marks and definitions alike");
  assert.match(notes, /^npx shadcn@latest add ourostack\/ouro-ui\/ouro-base#v9\.9\.9 ourostack\/ouro-ui\/dialog#v9\.9\.9$/m);
  assert.ok(notes.includes(changes.replace(/^# /, "### ")), "the notes hold CHANGES.md");
  assert.match(notes, /^### Upgrading from v0\.1\.0$/m);
  assert.ok(notes.includes("https://github.com/ourostack/ouro-ui/blob/v9.9.9/registry.json"), "the notes link the tag's registry.json for the descriptions");
  // The rehearsal the release rests on, before the items.
  assert.ok(notes.includes(rehearsalNote), "the notes name the runs the release rests on");
  const { items } = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
  assert.equal(notes.split("\n").at(-2), items.map(({ name }) => `\`${name}\``).join(", "));
  assert.ok(!notes.includes(items[0].description), "an item's description is in the notes");
  assert.deepEqual(calls.trim().split("\n"), ["git tag v9.9.9", "git push origin v9.9.9", `gh release create v9.9.9 --verify-tag --title v9.9.9 --notes-file ${join(temp, "notes.md")}`, "git push origin --delete release/v9.9.9"]);
});

test("Release tags nothing when its notes would be over GitHub's limit", () => {
  const { status, stdout, calls, notes } = publishRelease(`# Changes in this release\n\n${"- A change.\n".repeat(12_000)}`);
  assert.equal(status, 1);
  assert.match(stdout, /^::error::The release notes are \d+ bytes, over GitHub's 125,000-character limit, so v9\.9\.9 is not tagged\./m);
  assert.equal(calls, "", "it tagged, pushed or released");
  assert.equal(notes, undefined);
});

test("required-ci.sh waits for the runs, then passes them when each check main's rules require passed in them, whatever the other jobs did", () => {
  const bin = scratchDir("ouro-required-ci-");
  const log = join(bin, "calls.log");
  const polls = join(bin, "polls");
  // A stand-in gh: logs; reports run 5 in progress $BUSY times (an unreadable status when
  // $UNREADABLE is set), then finished; answers the rules, and run 5's jobs from $JOBS and run
  // 6's from $EXEMPT (name<TAB>conclusion lines).
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\ncase "$*" in\n  "run watch "*) exit 1 ;;\n  "run view 5 --json status --jq .status") n=$(( $(cat "${polls}" 2>/dev/null || echo 0) + 1 )); echo "$n" > "${polls}"; [ -z "$UNREADABLE" ] || exit 1; [ "$n" -gt "$BUSY" ] && echo completed || echo in_progress ;;\n  "run view "*) echo completed ;;\n  *"/rules/branches/main "*) printf '%s\\n' ci e2e "install (shadcn, nova)" "conformance exemptions" lighthouse ;;\n  *"/actions/runs/5/jobs"*) printf '%b' "$JOBS" ;;\n  *"/actions/runs/6/jobs"*) printf '%b' "$EXEMPT" ;;\n  *) exit 99 ;;\nesac\n`);
  chmodSync(join(bin, "gh"), 0o755);
  const lines = (jobs) => jobs.map(([name, conclusion]) => `${name}\\t${conclusion}\\n`).join("");
  const run = (jobs, exempt = [["conformance exemptions", "success"]], runs = ["5", "6"], env = {}) => {
    writeFileSync(log, "");
    writeFileSync(polls, "0");
    return spawnSync("bash", [join(root, "scripts/required-ci.sh"), ...runs], { cwd: root, encoding: "utf8", env: sandboxEnv({ GITHUB_REPOSITORY: "ourostack/ouro-ui", JOBS: lines(jobs), EXEMPT: lines(exempt), POLL_SECONDS: "0", BUSY: "0", UNREADABLE: "", ...env }, [bin]) });
  };
  const passing = [["plan", "success"], ["ci", "success"], ["e2e", "success"], ["install (shadcn, nova)", "success"], ["lighthouse", "success"]];
  // ci-budget failed, as gh run watch would have said: the required checks decide.
  const green = run([...passing, ["ci-budget", "failure"]]);
  assert.equal(green.status, 0, green.stdout + green.stderr);
  assert.match(green.stdout, /passed the checks main's rules require/);
  assert.doesNotMatch(readFileSync(log, "utf8"), /run watch/);
  // It polls each run's status until the run has finished, and reads the jobs only then.
  const waited = run(passing, undefined, undefined, { BUSY: "3" });
  assert.equal(waited.status, 0, waited.stdout + waited.stderr);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(calls.filter((call) => call === "run view 5 --json status --jq .status").length, 4);
  assert.ok(calls.findIndex((call) => call.includes("/runs/5/jobs")) > calls.lastIndexOf("run view 5 --json status --jq .status"));
  // A status it cannot read, ten times in a row, stops the wait rather than passing or hanging.
  const unreadable = run(passing, undefined, undefined, { UNREADABLE: "1" });
  assert.equal(unreadable.status, 1);
  assert.match(unreadable.stdout, /::error::Could not read the status of run 5\./);
  assert.equal(readFileSync(polls, "utf8").trim(), "10");
  assert.doesNotMatch(readFileSync(log, "utf8"), /\/jobs/);
  // A required check that failed, was skipped or is in none of the runs fails them, by name.
  const red = run([...passing.filter(([name]) => name !== "lighthouse"), ["lighthouse", "failure"]]);
  assert.equal(red.status, 1);
  assert.match(red.stdout, /::error::.*lighthouse: failure/);
  assert.match(run(passing.filter(([name]) => name !== "e2e")).stdout, /e2e: not in the run/);
  assert.equal(run([...passing.filter(([name]) => name !== "e2e"), ["e2e", "skipped"]]).status, 1);
  // Without the run of the workflow that reports conformance exemptions, that check is missing.
  assert.match(run(passing, [], ["5"]).stdout, /conformance exemptions: not in the run/);
  // Main's commit after the merge queue: the newest run is the push run, which skips every
  // required job but install-github; the queue's run on the same commit passed them.
  const push = passing.map(([name]) => [name, name === "plan" ? "success" : "skipped"]).concat([["install-github", "success"], ["conformance exemptions", "skipped"]]);
  const queue = [...passing, ["conformance exemptions", "success"], ["install-github", "skipped"]];
  const pushOnly = run(push, [], ["5"]);
  assert.equal(pushOnly.status, 1, "the push run alone passes none of them");
  assert.match(pushOnly.stdout, /ci: skipped/);
  const both = run(push, queue, ["5", "6"]);
  assert.equal(both.status, 0, both.stdout + both.stderr);
  // A check none of the runs passed still fails, with what each run did.
  const neither = run(push, queue.map(([name, conclusion]) => [name, name === "e2e" ? "failure" : conclusion]), ["5", "6"]);
  assert.equal(neither.status, 1);
  assert.match(neither.stdout, /e2e: skipped\/failure/);
  // --also adds a gate the rules do not require (the release commit's install-latest job): it must pass too, and a skip does not.
  const gate = "install (shadcn@latest, nova)";
  const also = (conclusion) => spawnSync("bash", [join(root, "scripts/required-ci.sh"), "--also", gate, "5", "6"], { cwd: root, encoding: "utf8", env: sandboxEnv({ GITHUB_REPOSITORY: "ourostack/ouro-ui", JOBS: lines(conclusion ? [...passing, [gate, conclusion]] : passing), EXEMPT: lines([["conformance exemptions", "success"]]), POLL_SECONDS: "0", BUSY: "0", UNREADABLE: "" }, [bin]) });
  assert.equal(also("success").status, 0);
  assert.match(also("failure").stdout, /install \(shadcn@latest, nova\): failure/);
  assert.equal(also("skipped").status, 1);
  assert.match(also(undefined).stdout, /install \(shadcn@latest, nova\): not in the run/);
  assert.equal(spawnSync("bash", [join(root, "scripts/required-ci.sh"), "--also"], { encoding: "utf8", env: sandboxEnv() }).status, 2);
});

test("each check main's rules require comes from a workflow Release can start by dispatch", async () => {
  const { readWorkflows, requiredProducers } = await import("./required-producers.mjs");
  const all = readWorkflows();
  const { producers, problems } = requiredProducers(requiredChecks, all);
  assert.deepEqual(problems, []);
  assert.deepEqual(producers, ["ci.yml", "conformance-exemptions.yml", "release-note.yml"]);
  const spec = (on) => ({ file: "x.yml", text: `on:\n  pull_request:\n${on}jobs:\n  check:\n    name: lane\n    runs-on: ubuntu-latest\n` });
  assert.deepEqual(requiredProducers(["lane"], [spec("")]).problems, ['x.yml reports the required check "lane" but has no workflow_dispatch trigger, so Release cannot start it']);
  assert.deepEqual(requiredProducers(["lane"], [spec("  workflow_dispatch:\n")]), { producers: ["x.yml"], problems: [] });
  assert.deepEqual(requiredProducers(["nobody"], all).problems, ['no workflow reports the required check "nobody"']);
});

const releaseStep = (name) => {
  const release = workflow("release.yml");
  const start = release.search(new RegExp(`^ {6}(- | {2})name: ${name.replace(/[?()]/g, "\\$&")}\n`, "m"));
  assert.notEqual(start, -1, `no step named ${name}`);
  // The step's own text, up to the next step, so a step whose run is one line never reads another step's block.
  const rest = release.slice(start);
  const next = rest.search(/\n {6}- /);
  const step = next === -1 ? rest : rest.slice(0, next);
  const inline = step.match(/^ {8}run: (?!\|$)(.+)$/m);
  if (inline) return inline[1];
  const lines = step.split("        run: |\n")[1].split("\n");
  const end = lines.findIndex((line) => line !== "" && !line.startsWith(" ".repeat(10)));
  return lines.slice(0, end === -1 ? undefined : end).map((line) => line.slice(10)).join("\n");
};

test("public proof dependencies are installed without the publishing token, and an install failure stops the job", () => {
  const publish = workflow("release.yml").split("\n  pages:\n")[1].split("\n  finish:\n")[0];
  const manager = publish.indexOf("uses: pnpm/action-setup@");
  assert.ok(manager >= 0 && manager < publish.indexOf("uses: actions/setup-node@"));
  assert.ok(publish.indexOf("name: Install dependencies for the public proofs") > manager);
  assert.doesNotMatch(publish.split("\n    steps:\n")[0], /^\s+GH_TOKEN:/m);
  for (const step of publish.split(/\n(?= {6}- )/).filter((step) => step.includes("GH_TOKEN:"))) {
    assert.match(step, /name: (Delete the branch that prepared main|Deploy Pages and check the namespace it serves)\n/);
  }
  const install = releaseStep("Install dependencies for the public proofs");
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c",
    `pnpm() { return 37; }\n${install}\nprintf 'PROOF RAN\\n'`], { encoding: "utf8", env: sandboxEnv() });
  assert.equal(result.status, 37, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /PROOF RAN/);
});

test("a release checks last that Pages serves the tag's @ouro namespace byte for byte, after the published pages", () => {
  const deploy = releaseStep("Deploy Pages and check the namespace it serves");
  const lines = deploy.trimEnd().split("\n");
  assert.deepEqual(lines.filter((line) => line.startsWith("node ")), ['node scripts/public-registry.mjs verify-live "$TAG" --wait 900']);
  assert.equal(lines.at(-1), 'node scripts/public-registry.mjs verify-live "$TAG" --wait 900');
  assert.ok(deploy.indexOf("verify-live") > deploy.indexOf('gh run watch "$run"'), "after the Pages deploy finishes");
  assert.doesNotMatch(deploy, /--exit-status/, "the dispatched run's conclusion decides, not gh run watch's exit status");
});

/** Runs "Deploy Pages and check the namespace it serves" with stand-ins for gh and node: the dispatched Pages run ends as `conclusion`, and a newer Pages run for main exists when `newer`. */
function runDeployStep(conclusion, newer) {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp", "ci-pages-"));
  const log = join(dir, "calls.log");
  const runs = newer ? '[{"databaseId":101},{"databaseId":100},{"databaseId":99}]' : '[{"databaseId":100},{"databaseId":99}]';
  const stub = `gh() {
  printf 'gh %s\\n' "$*" >> "$LOG"
  case "$*" in
    "workflow run pages.yml --ref main") : > "$DIR/dispatched" ;;
    "run view"*) printf '{"conclusion":"%s"}' "$CONCLUSION" | jq -r "\${@: -1}" ;;
    *"--event workflow_dispatch"*) if [ -f "$DIR/dispatched" ]; then echo '[{"databaseId":100}]'; else echo '[{"databaseId":99}]'; fi | jq -r "\${@: -1}" ;;
    *"--branch main"*) printf '%s' "$RUNS" | jq -r "\${@: -1}" ;;
  esac
}
node() { printf 'node %s\\n' "$*" >> "$LOG"; }`;
  try {
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${stub}\n${releaseStep("Deploy Pages and check the namespace it serves")}`], {
      cwd: root,
      encoding: "utf8",
      env: sandboxEnv({ DIR: dir, LOG: log, CONCLUSION: conclusion, RUNS: runs, TAG: "v9.9.9" }),
    });
    return { status: result.status, output: result.stdout + result.stderr, calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a release's Pages step lets the namespace check decide when a newer Pages run replaced the dispatched one", () => {
  const deployed = runDeployStep("success", false);
  assert.equal(deployed.status, 0, deployed.output);
  assert.match(deployed.calls, /^node scripts\/public-registry\.mjs verify-live v9\.9\.9 --wait 900$/m);
  const replaced = runDeployStep("cancelled", true);
  assert.equal(replaced.status, 0, replaced.output);
  assert.match(replaced.output, /::notice::Pages run 100 was replaced by a newer Pages run for main/);
  assert.match(replaced.calls, /^node scripts\/public-registry\.mjs verify-live v9\.9\.9 --wait 900$/m);
});

test("a release's Pages step fails when the dispatched Pages run failed, or was cancelled with no newer run", () => {
  for (const [conclusion, newer, message] of [
    ["failure", false, /::error::Pages run 100 ended failure\. Run it by hand/],
    ["cancelled", false, /::error::Pages run 100 was cancelled, and no newer Pages run replaced it\. Run it by hand/],
  ]) {
    const result = runDeployStep(conclusion, newer);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, message);
    assert.doesNotMatch(result.calls, /verify-live/);
  }
});

test("the release runs the public-registry tests with the script tests", () => {
  assert.ok(scriptTestFiles().includes("scripts/public-registry.test.mjs"));
});

test("every ci.yml job that runs npm or npx resolves packages as published a day ago, as install-test.sh does", () => {
  const runsNpm = (job) => job.split("\n").some((line) => !/^\s*#/.test(line) && !/\becho\b/.test(line) && /(?:^|[\s;&|(])(?:npx|npm) /.test(line));
  const jobs = Object.entries(ciJobs()).filter(([, job]) => runsNpm(job));
  assert.deepEqual(jobs.map(([id]) => id).sort(), ["lighthouse", "registry"]);
  for (const [id, job] of jobs) assert.match(job, /^ {6}- [&*]npm-day-old$/m, id);
  assert.match(workflow("ci.yml"), /^ {8}run: echo "npm_config_before=\$\(date -u -d '1 day ago' \+%Y-%m-%dT%H:%M:%SZ\)" >> "\$GITHUB_ENV"$/m);
  assert.match(readFileSync(join(root, "scripts/install-test.sh"), "utf8"), /^export npm_config_before="\$\{npm_config_before:-\$\(date -u -d '1 day ago' /m);
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
      # Reads its input as node would, so a step that pipes into node never loses its writer to SIGPIPE under pipefail (#2175).
      cat > /dev/null
      printf 'CALL node %s\\n' "$*" >&2
      case "$2" in
        stories) echo checkbox ;;
        e2e) if [ "$1" = scripts/shard.mjs ] && [ -n "\${SHARD_SPECS+set}" ]; then echo "$SHARD_SPECS"; else echo "registry/ouro/e2e/ouro/checkbox.spec.ts site/e2e/"; fi ;;
        installs|heavy) [ -z "\${TIER_RUN-}" ] || echo "run=$TIER_RUN" >> "$GITHUB_OUTPUT" ;;
        plan) printf 'full=false\\ncomponents=checkbox\\n' >> "$GITHUB_OUTPUT" ;;
      esac
      return "$NODE_STATUS"
    }
    ${script}
  `], { cwd: root, encoding: "utf8", env: sandboxEnv({ ...env, GITHUB_OUTPUT: output, NODE_STATUS: String(nodeStatus) }) });
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

test("a pull request into main skips the install test or the heavy tier only when the plan proves the change cannot reach it", () => {
  const tiers = stepScript(ciJobs().plan, "Can the change reach the install test or the heavy tier?");
  const pr = { EVENT: "pull_request", BASE_REF: "main", HEAD_REF: "feature" };
  // The relevance script says run=false for both: only then does a tier skip.
  assert.deepEqual(runStep(tiers, { ...pr, TIER_RUN: "false" }).output, { installs: "skip", heavy: "skip" });
  assert.match(runStep(tiers, { ...pr, TIER_RUN: "false" }).calls, /^CALL node scripts\/ci-relevance\.mjs installs HEAD\^1 HEAD$/m);
  assert.match(runStep(tiers, { ...pr, TIER_RUN: "false" }).calls, /^CALL node scripts\/ci-relevance\.mjs heavy HEAD\^1 HEAD$/m);
  // A run=true, no answer, or a script that fails all run the tier.
  for (const env of [{ TIER_RUN: "true" }, {}]) assert.deepEqual(runStep(tiers, { ...pr, ...env }).output, { installs: "here", heavy: "here" });
  assert.deepEqual(runStep(tiers, { ...pr, TIER_RUN: "false" }, { nodeStatus: 1 }).output, { installs: "here", heavy: "here" });
  // Every other event, a release branch and a pull request into another branch run both tiers.
  for (const env of [{ EVENT: "push" }, { EVENT: "merge_group" }, { EVENT: "workflow_dispatch" }, { ...pr, HEAD_REF: "release/v1.1.0" }, { ...pr, BASE_REF: "release/v1.1.0" }]) {
    const run = runStep(tiers, { TIER_RUN: "false", ...env });
    assert.deepEqual(run.output, { installs: "here", heavy: "here" }, JSON.stringify(env));
    assert.doesNotMatch(run.calls, /CALL node/);
  }
  // No job waits on a queue, and nothing skips by a workflow-level paths filter.
  const text = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.doesNotMatch(text, /outputs\.(installs|heavy) [!=]= 'queue'/);
  assert.doesNotMatch(text, /heavy-queued/);
  assert.doesNotMatch(text.split("\njobs:")[0], /^\s+paths(-ignore)?:/m);
});

test("CI's plan runs everything when planning fails", () => {
  const { status, stdout, output } = runStep(stepScript(ciJobs().plan, "Plan the tests"), { EVENT: "pull_request", REF: "refs/pull/9/merge", BASE_REF: "main", HEAD_REF: "feature" }, { nodeStatus: 1 });
  assert.equal(status, 0);
  assert.equal(output.full, "true");
  assert.match(stdout, /::warning::Could not plan the tests, so everything runs/);
});

test("the plan's merge commit has its base: the checkout fetches the merge commit's parents", () => {
  assert.match(ciJobs().plan, /- uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}persist-credentials: false\n(?: {10}#.*\n)* {10}fetch-depth: 2\n/);
});

test("a push to main whose tree already passed runs only install-github", () => {
  const jobs = ciJobs();
  assert.match(jobs.plan, /^ {6}- id: tested\n {8}name: Has this tree already passed\?\n {8}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\n {8}timeout-minutes: 5\n {8}continue-on-error: true\n/m);
  // It waits up to 3 minutes for the merged pull request's run to finish, within the step's 5 and the plan's 15 on a push, which keeps its 10 besides.
  assert.match(jobs.plan, /^ {8}run: node scripts\/ci-proof\.mjs "\$GITHUB_SHA" --wait 180$/m);
  assert.match(jobs.plan, /^ {4}timeout-minutes: \$\{\{ github\.event_name == 'pull_request' && 20 \|\| 15 \}\}$/m);
  assert.match(jobs.plan, /^ {6}tested: \$\{\{ steps\.tested\.outputs\.tested \}\}$/m);
  assert.match(jobs.plan, /^ {6}tree: \$\{\{ steps\.tree\.outputs\.tree \}\}$/m);
  assert.match(jobs.plan, /^ {8}run: echo "tree=\$\(git rev-parse 'HEAD\^\{tree\}'\)" >> "\$GITHUB_OUTPUT"$/m);
  assert.match(jobs.plan, /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n {6}pull-requests: read/m);
  // A proven push installs nothing for the plan either.
  assert.match(readFileSync(join(dir, "ci.yml"), "utf8").split("\n  checks:\n")[0], /^ {6}- if: steps\.tested\.outputs\.tested != 'true'\n {8}id: install\n/m);
  // Every job but the plan, the GitHub install, the release-only install, fail-fast and fresh-main (pull
  // requests only) and tree-proof skips on it, gates included; motion-coverage waits on ci and browser-fallback on
  // the coverage job. Nothing else reads it.
  const condition = (block) => block.match(/^ {4}if: (.+)$/m)?.[1];
  const skipping = Object.keys(jobs).filter((id) => [untested, queuedInstalls, browserRuns, mutationRuns, heavyRuns, designRuns, laneRuns].includes(condition(jobs[id])));
  assert.deepEqual(skipping.sort(), Object.keys(jobs).filter((id) => !["plan", "install-github", "install-latest", "motion-coverage", "browser-fallback", "fail-fast", "fresh-main", "tree-proof", "yield"].includes(id)).sort());
  assert.match(jobs["motion-coverage"], /^ {4}needs: \[plan, browser, coverage, browser-fallback\]$/m);
  assert.match(jobs["browser-fallback"], /^ {4}needs: \[plan, coverage\]$/m);
  assert.doesNotMatch(jobs["install-github"], /tested/);
  for (const id of skipping) assert.match(jobs[id], /^ {4}needs: \[plan[\],]/m, `${id} needs the plan`);
  const runs = (tested) => runInNewContext(untested.slice(4, -3).replace("!cancelled()", "true").replace("needs.plan.outputs.tested", "value"), { value: tested });
  // A plan that failed or never ran leaves the output empty: everything runs.
  assert.deepEqual(["", "true"].map(runs), [true, false]);
});

test("a pull request's run reports tree-proof, named for its tree, only when its plan left nothing out and every job passed", async () => {
  const jobs = ciJobs();
  const block = jobs["tree-proof"];
  const { PREFIX } = await import("./ci-proof.mjs");
  assert.equal(block.match(/^ {4}name: (.+)$/m)?.[1], `${PREFIX}\${{ needs.plan.outputs.tree }}`);
  // It waits on what ci-budget waits on but the jobs that run only off a pull request and fresh-main, which tests a newer main.
  const needsOf = (id) => jobs[id].match(/^ {4}needs: \[([^\]]*)\]$/m)[1].split(",").map((need) => need.trim());
  assert.deepEqual(needsOf("tree-proof").sort(), needsOf("ci-budget").filter((id) => !["fresh-main", "install-github", "install-latest"].includes(id)).sort());
  const expression = block.match(/^ {4}if: \$\{\{ (.+) \}\}$/m)[1];
  // Every need is checked by name: a job's if: counts the jobs above its needs in needs.*.result too, so a skipped
  // fallback shard upstream would make !contains(needs.*.result, 'skipped') false on every run.
  assert.doesNotMatch(expression, /needs\.\*/);
  for (const id of needsOf("tree-proof")) assert.ok(expression.includes(`needs.${id}.result == 'success'`), id);
  const reports = ({ event = "pull_request", results = {}, plan = {}, fallback = "false" } = {}) =>
    runInNewContext(
      expression
        .replace("!cancelled()", "true")
        .replace("github.event_name", "event")
        .replace(/needs\.([\w-]+)\.result == 'success'/g, "(results['$1'] ?? 'success') === 'success'")
        .replace(/needs\.plan\.outputs\.(\w+)/g, "plan.$1")
        .replace("needs.ci.outputs.fallback", "fallback"),
      { event, results, plan: { tree: "t", full: "true", browser: "true", design: "true", installs: "here", heavy: "here", ...plan }, fallback },
    );
  assert.equal(reports(), true);
  // A plan that failed leaves its outputs empty: no tree, no proof.
  assert.equal(reports({ plan: { tree: "" } }), false);
  for (const plan of [{ full: "false" }, { browser: "false" }, { design: "false" }, { installs: "skip" }, { heavy: "skip" }, { installs: "" }, { heavy: "" }]) assert.equal(reports({ plan }), false, JSON.stringify(plan));
  for (const result of ["failure", "cancelled", "skipped"]) for (const id of needsOf("tree-proof")) assert.equal(reports({ results: { [id]: result } }), false, `${id} ${result}`);
  assert.equal(reports({ fallback: "true" }), false);
  for (const event of ["push", "merge_group", "workflow_dispatch"]) assert.equal(reports({ event }), false, event);
  // It reads nothing and runs nothing but its notice.
  assert.doesNotMatch(block, /checkout|permissions/);
});

test("every job that reads the plan runs whatever happened to it, and runs everything unless it says full=false", () => {
  const jobs = ciJobs();
  // ci-budget reads it too, in its step's env (the budget job's own test).
  const readers = Object.keys(jobs).filter((name) => /^ {6}FULL: \$\{\{ needs\.plan\.outputs\.full/m.test(jobs[name]));
  assert.deepEqual(readers.sort(), ["browser", "conformance-shard", "coverage", "e2e-shard", "install-shard", "subsets", "themes-shard"]);
  for (const name of readers) {
    // install-shard also waits for the merge queue on a pull request (installs=queue, the install test's own test).
    const condition = name === "install-shard" ? queuedInstalls : name === "browser" || name === "subsets" ? browserRuns : [...heavyJobs.filter((id) => id !== "themes"), "latency-shard", "e2e-shard", "sweep-shard", "sweeps-compare"].includes(name) ? heavyRuns : untested;
    const needs = jobs[name].match(new RegExp(`^ {4}needs: \\[([^\\]]*)\\]\\n {4}if: ${condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"))?.[1].split(",").map((need) => need.trim());
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
const matrixValues = (block, key) =>
  (block.match(new RegExp(`^ {8}${key}: \\[([^\\]]*)\\]$`, "m")) ?? block.match(new RegExp(`^ {8}${key}: \\$\\{\\{ fromJSON\\(github\\.event_name == 'pull_request' && '\\[([^\\]]*)\\]' \\|\\| '\\[[^\\]]*\\]'\\) \\}\\}$`, "m")))?.[1]
    .split(",")
    .map((value) => value.trim().replace(/^"(.*)"$/, "$1"));

/** Every name a job's checks report: its name with each combination of its matrix, less the excluded ones. */
function checkNames(block, id) {
  const name = block.match(/^ {4}name: (.+)$/m)?.[1] ?? id;
  const keys = [...name.matchAll(/\$\{\{ matrix\.(\w+) \}\}/g)].map((match) => match[1]);
  let combinations = [{}];
  for (const key of keys) combinations = combinations.flatMap((combination) => (matrixValues(block, key) ?? []).map((value) => ({ ...combination, [key]: value })));
  const excluded = [...(block.split(/^ {8}exclude:\n/m)[1] ?? "").matchAll(/^ {10}- (\w+): (\S+)\n {12}(\w+): (\S+)$/gm)].map(([, k1, v1, k2, v2]) => ({ [k1]: v1, [k2]: v2 }));
  combinations = combinations.filter((combination) => !excluded.some((exclusion) => Object.entries(exclusion).every(([key, value]) => combination[key] === value)));
  return combinations.map((combination) => keys.reduce((text, key) => text.replace(`\${{ matrix.${key} }}`, combination[key]), name).replace("${{ github.event_name == 'pull_request' && 6 || 3 }}", "6").replace("${{ strategy.job-total }}", String(Math.max(...keys.map((key) => matrixValues(block, key).length))))); // a pull request's count: the names the ruleset requires
}

/** The condition of every job a push whose tree already passed skips (the plan's `tested`, scripts/ci-proof.mjs). */
const untested = "${{ !cancelled() && needs.plan.outputs.tested != 'true' }}";

/** The install test's jobs (not its gates): they also skip on a pull request that changes nothing the install test reads (the plan's `installs`). */
const queuedInstalls = "${{ !cancelled() && needs.plan.outputs.tested != 'true' && needs.plan.outputs.installs != 'skip' }}";

/** The browser shards': they also skip on a pull request that changes nothing they read (the plan's `browser`). */
const browserRuns = "${{ !cancelled() && needs.plan.outputs.tested != 'true' && needs.plan.outputs.browser != 'false' }}";

/** The heavy tier's jobs: on a pull request that changes nothing they read (the plan's heavy=skip) they skip, and a job without a matrix reports skipped, which a required check accepts; they run everywhere else. */
const heavyJobs = ["themes", "visual", "theme-install", "latency", "lighthouse"];
const heavyRuns = "${{ !cancelled() && needs.plan.outputs.tested != 'true' && needs.plan.outputs.heavy != 'skip' }}";

/** The design shards': they also skip on a pull request that changes nothing the site build or Ouro check reads (the plan's `design`). */
const designRuns = "${{ !cancelled() && needs.plan.outputs.tested != 'true' && needs.plan.outputs.design != 'false' }}";

/** The mutation shards': they also skip when the plan counts none (no changed path is runtime source). */
const mutationRuns = "${{ !cancelled() && needs.plan.outputs.tested != 'true' && needs.mutation-plan.outputs.count != '0' }}";

/** The screen-reader lane (sr-yield and screen-reader): a pull request from this repository whose change reaches a spec, which the plan's screen_reader names. */
const laneRuns = "${{ !cancelled() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && needs.plan.outputs.screen_reader != 'none' }}";

/** The checks the main ruleset requires (ruleset 24881709, .github/required-checks.json). */
const requiredChecks = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));

test("every required check is still a job that reports, under the name the ruleset requires", () => {
  const jobs = ciJobs();
  const names = new Map();
  for (const [id, block] of Object.entries(jobs)) {
    // heavy-queued reports the heavy tier's checks under their own names, on the pull requests where those skip.
    if (id === "heavy-queued") continue;
    for (const name of checkNames(block, id)) {
      assert.ok(!names.has(name), `${name} is reported by both ${names.get(name)} and ${id}`);
      names.set(name, id);
    }
    // A job a required check names never skips itself on a pull request or in the merge queue: at
    // most it runs whatever its needs did, and skips only on a push whose tree already passed.
    const condition = block.match(/^ {4}if: (.+)$/m)?.[1];
    // browser-fallback is no required check: it runs only when the coverage job asks, and the ci check fails when it then did not pass.
    // motion-coverage runs beside ci once the coverage job and the shards it reads passed or were skipped.
    if (id === "motion-coverage") assert.equal(condition, "${{ !cancelled() && needs.coverage.result == 'success' && contains(fromJSON('[\"success\",\"skipped\"]'), needs.browser.result) && contains(fromJSON('[\"success\",\"skipped\"]'), needs.browser-fallback.result) }}");
    // browser is no required check either: the ci check holds it, and passes its skip only when the plan asked for it.
    else if (!["fail-fast", "install-github", "install-latest", "plan", "yield", "browser-fallback", "fresh-main", "tree-proof"].includes(id)) assert.ok(!condition || condition === (id === "install-shard" || id === "install-prep" || id === "install-checks" || id === "install-upgrade" || id === "install-current" ? queuedInstalls : id === "browser" || id === "subsets" ? browserRuns : id === "design" ? designRuns : id === "mutation-shard" ? mutationRuns : id === "sr-yield" || id === "screen-reader" ? laneRuns : [...heavyJobs.filter((job) => job !== "themes"), "latency-shard", "e2e-shard", "sweep-shard", "sweeps-compare"].includes(id) ? heavyRuns : untested), `${id} has if: ${condition}`);
  }
  // The heavy tier: every check its jobs report is required. On a pull request that leaves them to
  // the merge queue, a job without a matrix reports skipped under its own name, which a required
  // check accepts, and the themes shards are no required check, only the themes check over them.
  for (const id of heavyJobs) for (const name of checkNames(jobs[id], id)) assert.ok(requiredChecks.includes(name), `${name} is required`);
  for (const id of heavyJobs) assert.doesNotMatch(jobs[id].match(/^ {4}name: (.+)$/m)?.[1] ?? "", /matrix/, id);
  // GitHub reports a skipped job whose name is only an expression under the bare expression
  // ("matrix.check"), which no job's name matches, so the budget would fail it as unmatched.
  for (const [id, block] of Object.entries(jobs)) assert.doesNotMatch(block.match(/^ {4}name: (.+)$/m)?.[1] ?? id, /^\$\{\{[^}]*\}\}$/, `${id}'s name has text besides an expression`);
  assert.match(jobs.plan, /^ {6}heavy: \$\{\{ steps\.tiers\.outputs\.heavy \}\}$/m);
  // The checks of the other workflows that run on a pull request and in the merge queue (conformance exemptions).
  for (const { file, text } of workflows.filter((entry) => entry.file !== "ci.yml" && /^ {2}pull_request:/m.test(entry.text) && /^ {2}merge_group:/m.test(entry.text))) {
    for (const [, name] of text.matchAll(/^ {4}name: (.+)$/gm)) names.set(name, file);
  }
  // The ruleset's required checks, which the claims check also reads (verify:ciJob accepts only these).
  for (const check of requiredChecks) assert.ok(names.has(check), `${check} is not among ${[...names.keys()].join(", ")}`);
  // ruleset 24881709 requires these; required-checks.yml holds the file to the live rules.
  for (const check of ["ci-budget", "conformance", "conformance exemptions", "mutation"]) assert.ok(requiredChecks.includes(check), check);
  const installShards = shardCount(jobs["install-shard"]);
  const installs = ["shadcn, nova", "shadcn, vega", "ouro, nova"].flatMap((app) => Array.from({ length: installShards }, (_, index) => `install (${app}, ${index + 1}/${installShards})`));
  assert.deepEqual(checkNames(jobs["install-shard"], "install-shard"), installs);
  // conformance and mutation report under the names the ruleset will require once this workflow is on main.
  for (const check of ["conformance", "mutation"]) assert.ok(names.has(check), `${check} is not among ${[...names.keys()].join(", ")}`);
});

test("the required ci job runs the claims ratchet on a pull request, against its base, with its description", () => {
  const block = ciJobs().checks;
  const step = block.slice(block.search(/^ {6}- name: Claims\n/m)).split(/\n {6}- /)[0];
  assert.match(step, /^ {10}PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}$/m);
  const script = `git() { printf 'CALL git %s\\n' "$*" >&2; }\n${stepScript(block, "Claims")}`;
  const pull = runStep(script, { BASE_REF: "main", GITHUB_SHA: "f00d" });
  assert.equal(pull.status, 0);
  assert.match(pull.calls, /^CALL git fetch --no-tags --depth=2 origin f00d\nCALL node scripts\/claims\.mjs ratchet\nCALL node scripts\/real-clock-ratchet\.mjs\nCALL node scripts\/headroom-ratchet\.mjs\nCALL node scripts\/patch-guard\.mjs\nCALL pnpm claims:check --network=changed$/m);
  // Against the merge's first parent, main as GitHub merged the pull request into it, never main's tip, which may have
  // moved since: its changes would read as the pull request's (#726).
  const exemptions = workflow("claims.yml").slice(workflow("claims.yml").search(/^ {6}- name: Exemptions against the base\n/m));
  for (const name of ["CLAIMS_BASE_REF", "REAL_CLOCK_BASE_REF", "HEADROOM_BASE_REF", "PATCH_GUARD_BASE_REF"]) {
    assert.doesNotMatch(step, new RegExp(`${name}="origin/`));
    assert.doesNotMatch(exemptions, new RegExp(`${name}="origin/`));
  }
  assert.match(exemptions, /git fetch --no-tags --depth=2 origin "\$GITHUB_SHA"\n {10}CLAIMS_BASE_REF="HEAD\^1" node scripts\/claims\.mjs ratchet\n {10}REAL_CLOCK_BASE_REF="HEAD\^1" node scripts\/real-clock-ratchet\.mjs\n {10}HEADROOM_BASE_REF="HEAD\^1" node scripts\/headroom-ratchet\.mjs/);
  assert.equal(step.match(/(?:CLAIMS|REAL_CLOCK|HEADROOM|PATCH_GUARD)_BASE_REF="HEAD\^1"/g)?.length, 5);
  // A failing ratchet fails the job.
  assert.notEqual(runStep(script, { BASE_REF: "main" }, { nodeStatus: 1 }).status, 0);
  assert.doesNotMatch(runStep(script, { BASE_REF: "" }).calls, /ratchet/);
  assert.ok(JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8")).includes("ci"));
});

test("the claims, release note and exemption steps read a pull request's description as it is now, and the event's copy when GitHub does not answer", () => {
  // A re-run replays the event the run started with, so a description edited since reaches the checks only when read live:
  // when GitHub starts no run for an edit, a re-run is then enough, with no need to close and reopen the pull request.
  assert.match(ciJobs().checks, /^ {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n/m);
  for (const file of ["claims.yml", "release-note.yml", "conformance-exemptions.yml"]) {
    assert.match(workflow(file), /^permissions:\n {2}contents: read\n {2}pull-requests: read\n/m, file);
  }
  const steps = [
    [ciJobs().checks, "Claims"],
    [workflow("claims.yml"), "Claims in the title and body"],
    [workflow("claims.yml"), "Exemptions against the base"],
    [workflow("release-note.yml"), "Release note against the base"],
    [workflow("conformance-exemptions.yml"), "Exemptions against the base"],
  ];
  for (const [block, name] of steps) {
    const read = (gh) =>
      runStep(`git() { :; }\ngh() { ${gh} }\nnode() { printf 'TEXT %s / %s\\n' "\${PR_TITLE-}" "$PR_BODY" >&2; }\npnpm() { node; }\n${stepScript(block, name)}`, {
        BASE_REF: "main",
        PR: "7",
        PR_TITLE: "Old title",
        PR_BODY: "from the event",
      });
    const live = read(`case "$*" in *title*) echo "New title" ;; *) echo "edited since" ;; esac;`);
    assert.equal(live.status, 0, `${name}: ${live.calls}`);
    assert.match(live.calls, /^TEXT .* \/ edited since$/m, name);
    assert.doesNotMatch(live.calls, /from the event/, name);
    const down = read("return 1;");
    assert.equal(down.status, 0, `${name}: ${down.calls}`);
    assert.match(down.calls, /^TEXT .* \/ from the event$/m, name);
  }
  const title = runStep(`gh() { case "$*" in *title*) echo "New title" ;; *) echo "edited since" ;; esac; }\npnpm() { printf 'TEXT %s\\n' "$PR_TITLE" >&2; }\n${stepScript(workflow("claims.yml"), "Claims in the title and body")}`, { PR: "7", PR_TITLE: "Old title" });
  assert.match(title.calls, /^TEXT New title$/m);
});

/** A matrix job's shard count, from its `shard` list, which must count 1 to n. */
function shardCount(block) {
  const shards = matrixValues(block, "shard").map(Number);
  assert.deepEqual(shards, shards.map((_, index) => index + 1));
  return shards.length;
}

test("each browser shard runs its share of every browser test, or of the reduced run, and the subsets jobs share out the installed subsets", () => {
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
  assert.doesNotMatch(block, /Coverage of installed subsets/);
  const sub = ciJobs().subsets;
  assert.equal(shardCount(sub), 5);
  assert.match(sub, /^ {4}name: subsets \(\$\{\{ matrix\.shard \}\}\/5\)$/m);
  assert.match(sub, /^ {6}SHARD: \$\{\{ matrix\.shard \}\}\/5$/m);
  const subsets = stepScript(sub, "Coverage of installed subsets");
  assert.match(runStep(subsets, { FULL: "true", SHARD: "2/5" }).calls, /^CALL node scripts\/subset-coverage\.mjs --shard 2\/5$/m);
  assert.match(runStep(subsets, { FULL: "false", COMPONENTS: "checkbox", SHARD: "2/5" }).calls, /^CALL node scripts\/subset-coverage\.mjs --touching checkbox --shard 2\/5$/m);
  // Its coverage and timings go up for the ci job and the next split.
  assert.match(block, /^ {10}name: coverage-browser-\$\{\{ matrix\.shard \}\}\n {10}path: coverage\/coverage-final\.json\n/m);
  assert.match(block, /^ {10}name: timings-browser-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/timings\/\n/m);
});

test("the script test shards run every file of pnpm test:scripts between them", async () => {
  const block = ciJobs().scripts;
  const count = shardCount(block);
  assert.match(block, /^ {6}SHARD: \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/m);
  assert.match(block, /^ {6}TIMINGS: \.tmp\/timings\/scripts-\$\{\{ matrix\.shard \}\}of\$\{\{ strategy\.job-total \}\}\.json$/m);
  assert.match(stepScript(block, "Script tests"), /^node scripts\/run-script-tests\.mjs --test-reporter=spec --test-reporter-destination=stdout --test-reporter=\.\/scripts\/timings-node-reporter\.mjs --test-reporter-destination="\$TIMINGS" \$\(node scripts\/shard\.mjs scripts "\$SHARD"\)$/m);
  const { readTimings, shardKeys } = await import("./shard.mjs");
  const all = Array.from({ length: count }, (_, index) => shardKeys(scriptTestFiles(), { index: index + 1, count }, readTimings("scripts"))).flat();
  assert.deepEqual(all.sort(), scriptTestFiles().sort());
});

test("the full-suite fallback runs in shards, in the same Playwright image, runner and setup as the browser shards, after the coverage job asks for it", () => {
  const jobs = ciJobs();
  const block = jobs["browser-fallback"];
  const container = (job) => job.match(/^ {4}container:\n(?: {6}.*\n)+/m)?.[0];
  assert.ok(container(jobs.browser));
  // Same image digest, user, zstd and system packages: the fonts and browsers the shards lay text out with.
  assert.equal(container(block), container(jobs.browser));
  assert.equal(block.match(/^ {4}runs-on: (.+)$/m)?.[1], jobs.browser.match(/^ {4}runs-on: (.+)$/m)?.[1]);
  assert.match(block, /^ {4}needs: \[plan, coverage\]$/m);
  assert.equal(block.match(/^ {4}if: (.+)$/m)?.[1], "${{ !cancelled() && needs.coverage.outputs.fallback == 'true' }}");
  // The whole suite, as a full run's browser shards run it, in more shards, since it starts only after them.
  const count = shardCount(block);
  assert.ok(count > shardCount(jobs.browser), "more fallback shards than browser shards");
  assert.match(block, new RegExp(`^ {4}name: browser fallback \\(\\$\\{\\{ matrix\\.shard \\}\\}/${count}\\)$`, "m"));
  assert.match(block, new RegExp(`^ {6}SHARD: \\$\\{\\{ matrix\\.shard \\}\\}/${count}$`, "m"));
  assert.equal(stepScript(block, "Browser tests"), 'pnpm exec vitest run --coverage --shard="$SHARD"');
  assert.match(stepScript(jobs.browser, "Browser tests"), /^ *pnpm exec vitest run --coverage --shard="\$SHARD"$/m);
  assert.match(block, /^ {10}name: coverage-fallback-\$\{\{ matrix\.shard \}\}\n {10}path: coverage\/coverage-final\.json\n {10}if-no-files-found: error\n/m);
  // The coverage job decides, and only after every browser shard passed.
  const coverage = jobs.coverage;
  assert.match(coverage, /^ {4}needs: \[plan, browser\]$/m);
  const passed = stepScript(coverage, "Every browser shard passed");
  assert.equal(runStep(passed, { BROWSER: "success" }).status, 0);
  for (const result of ["failure", "cancelled", "skipped"]) assert.equal(runStep(passed, { BROWSER: result }).status, 1, result);
  assert.match(stepScript(coverage, "Browser test coverage"), /node scripts\/test-impact\.mjs coverage /);
});

test("the design shards run Ouro check on the site at a phone's, a laptop's and a 4K screen's size, light and dark, and a gated finding fails the ci check", () => {
  const jobs = ciJobs();
  const block = jobs.design;
  assert.match(block, /^ {4}needs: \[plan\]$/m);
  assert.match(block, /^ {4}name: design \(\$\{\{ matrix\.shard \}\}\/\$\{\{ github\.event_name == 'pull_request' && 24 \|\| 6 \}\}\)$/m);
  assert.match(block, /^ {8}shard: \$\{\{ fromJSON\(github\.event_name == 'pull_request' && '\[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24\]' \|\| '\[1,2,3,4,5,6\]'\) \}\}$/m);
  // The check itself, through the repository's action, on the build, with the waivers file and no way to pass a finding.
  assert.match(block, /uses: \.\/\.github\/actions\/check\n {8}with:\n {10}targets: site\/dist\n {10}sizes: 390x844,1440x900,3840x2160\n {10}shard: \$\{\{ matrix\.shard \}\}\/\$\{\{ github\.event_name == 'pull_request' && 24 \|\| 6 \}\}\n {10}script: registry\/ouro\/check\/check\.ts\n {10}config: \.github\/ouro-check\.json\n/);
  assert.doesNotMatch(block, /continue-on-error/);
  assert.match(block, /^ {6}- run: pnpm site:build$/m);
  // The plan decides whether its runners start at all (scripts/ci-relevance.mjs screens): off a pull request (the
  // merge queue, main, a dispatch) and on a change to ci.yml it always runs.
  assert.equal(block.match(/^ {4}if: (.+)$/m)?.[1], designRuns);
  assert.doesNotMatch(block, /steps\.relevance|id: relevance/);
  assert.match(jobs.plan, /^ {6}design: \$\{\{ steps\.design\.outputs\.run \}\}$/m);
  const decide = stepScript(jobs.plan, "Can the change reach the site?");
  for (const event of ["merge_group", "push", "workflow_dispatch"]) assert.deepEqual(runStep(decide, { EVENT: event }).output, { run: "true" }, event);
  assert.deepEqual(runStep(decide, { EVENT: "pull_request", BASE_REF: "main", HEAD_REF: "release/v1.0.0" }).output, { run: "true" });
  // On a pull request into main, ci.yml's own change runs it, and so does a relevance check that fails.
  assert.match(decide, /git diff --name-only HEAD\^1 HEAD \| grep -qx "\.github\/workflows\/ci\.yml"/);
  assert.match(decide, /^ +node scripts\/ci-relevance\.mjs screens HEAD\^1 HEAD \|\| echo "run=true" >> "\$GITHUB_OUTPUT"$/m);
  const runs = (design) => runInNewContext(designRuns.slice(4, -3).replace("!cancelled()", "true").replace("needs.plan.outputs.tested", "''").replace("needs.plan.outputs.design", "value"), { value: design });
  assert.deepEqual(["", "true", "false"].map(runs), [true, true, false]);
  // The ci check counts their skip as a pass only when the plan asked for it.
  assert.match(jobs.ci, /^ {6}DESIGN_RUN: \$\{\{ needs\.plan\.outputs\.design != 'false' \}\}$/m);
  const parts = stepScript(jobs.ci, "Every part passed");
  const ok = { CHECKS: "success", ATTRIBUTION: "success", DESIGN: "skipped", BROWSER: "success", SUBSETS: "success", SCRIPTS: "success", SCRIPTS_BROWSER: "success", CHECK_NODE: "success", CHECK_NODE_MERGE: "success", COVERAGE: "success", BROWSER_FALLBACK: "skipped", SCREEN_READER: "skipped", SCREEN_READER_RUN: "false", FALLBACK: "" };
  assert.equal(runStep(parts, { ...ok, DESIGN_RUN: "false" }).status, 0);
  for (const [run, result] of [["true", "skipped"], ["false", "failure"], ["false", "cancelled"]]) assert.equal(runStep(parts, { ...ok, DESIGN_RUN: run, DESIGN: result }).status, 1, `${run} ${result}`);
  // Each waiver gives its reason.
  const { waive } = JSON.parse(readFileSync(join(root, ".github/ouro-check.json"), "utf8"));
  for (const [glob, rules] of Object.entries(waive)) for (const [rule, why] of Object.entries(rules)) assert.ok(why.trim().length > 20, `${glob} ${rule}`);
  assert.match(jobs.ci, /"design=\$DESIGN"/);
});

test("the ci check passes only when its parts passed and the browser shards' merged coverage reaches 100%, or the full suite decides", () => {
  const jobs = ciJobs();
  const block = jobs.ci;
  assert.match(block, /^ {4}needs: \[plan, checks, attribution, design, browser, subsets, scripts, scripts-browser, check-node, check-node-merge, coverage, browser-fallback, screen-reader\]$/m);
  const parts = stepScript(block, "Every part passed");
  const passed = { CHECKS: "success", ATTRIBUTION: "success", DESIGN: "success", BROWSER: "success", SUBSETS: "success", SCRIPTS: "success", SCRIPTS_BROWSER: "success", CHECK_NODE: "success", CHECK_NODE_MERGE: "success", COVERAGE: "success", BROWSER_FALLBACK: "skipped", SCREEN_READER: "skipped", SCREEN_READER_RUN: "false", FALLBACK: "false" };
  assert.equal(runStep(parts, passed).status, 0);
  assert.equal(runStep(parts, { ...passed, FALLBACK: "true", BROWSER_FALLBACK: "success" }).status, 0);
  for (const failed of [{ BROWSER: "failure" }, { SUBSETS: "failure" }, { SUBSETS: "skipped" }, { CHECKS: "cancelled" }, { ATTRIBUTION: "failure" }, { ATTRIBUTION: "skipped" }, { DESIGN: "failure" }, { DESIGN: "skipped" }, { SCRIPTS: "skipped" }, { SCRIPTS_BROWSER: "failure" }, { CHECK_NODE: "failure" }, { CHECK_NODE_MERGE: "failure" }, { CHECK_NODE_MERGE: "skipped" }, { COVERAGE: "failure" }, { SCREEN_READER: "failure" }, { SCREEN_READER_RUN: "true", SCREEN_READER: "skipped" }, { FALLBACK: "true", BROWSER_FALLBACK: "failure" }, { FALLBACK: "true", BROWSER_FALLBACK: "skipped" }, { FALLBACK: "true", BROWSER_FALLBACK: "cancelled" }]) {    const result = runStep(parts, { ...passed, ...failed });
    assert.equal(result.status, 1, JSON.stringify(failed));
    assert.match(result.stdout, /^::error::The [\w-]+ jobs did not pass/m);
  }
  // The coverage job merges the browser shards' coverage, or hands the decision to the fallback shards.
  const coverageJob = jobs.coverage;
  assert.equal(coverageJob.match(/^ {6}BROWSER_SHARDS: (\d+)$/m)?.[1], String(shardCount(jobs.browser)));
  const coverage = stepScript(coverageJob, "Browser test coverage");
  const full = runStep(coverage, { FULL: "true", RUNNER_TEMP: "/r", BROWSER_SHARDS: "6" });
  assert.match(full.calls, /^CALL node scripts\/coverage-merge\.mjs \/r\/coverage --shards 6$/m);
  assert.deepEqual(full.output, { reduced: "false", stems: "", fallback: "false" });
  const reduced = runStep(coverage, { FULL: "false", COMPONENTS: "checkbox", RUNNER_TEMP: "/r", BROWSER_SHARDS: "6" });
  assert.match(reduced.calls, /^CALL node scripts\/test-impact\.mjs coverage \/r\/coverage checkbox --shards 6$/m);
  assert.match(coverageJob, /^ {6}reduced: \$\{\{ steps\.tests\.outputs\.reduced \}\}\n {6}stems: \$\{\{ steps\.tests\.outputs\.stems \}\}\n {6}fallback: \$\{\{ steps\.tests\.outputs\.fallback \}\}$/m);
  assert.match(coverageJob, /^ {10}pattern: coverage-browser-\*\n {10}path: \$\{\{ runner\.temp \}\}\/coverage\n/m);
  // After a fallback, the ci check merges the fallback shards' coverage, the full suite's, and holds it to 100%.
  assert.match(block, /^ {6}reduced: \$\{\{ needs\.coverage\.outputs\.reduced \}\}\n {6}stems: \$\{\{ needs\.coverage\.outputs\.stems \}\}\n {6}fallback: \$\{\{ needs\.coverage\.outputs\.fallback \}\}$/m);
  assert.equal(block.match(/^ {6}FALLBACK_SHARDS: (\d+)$/m)?.[1], String(shardCount(jobs["browser-fallback"])));
  assert.match(block, /^ {6}- if: env\.FALLBACK == 'true'\n {8}uses: actions\/download-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}pattern: coverage-fallback-\*\n {10}path: \$\{\{ runner\.temp \}\}\/coverage\n/m);
  assert.match(block, /^ {6}- if: env\.FALLBACK == 'true'\n {8}name: Full suite coverage\n/m);
  const merge = stepScript(block, "Full suite coverage");
  assert.match(runStep(merge, { RUNNER_TEMP: "/r", FALLBACK_SHARDS: "16" }).calls, /^CALL node scripts\/coverage-merge\.mjs \/r\/coverage --shards 16$/m);
});

test("the attribution job fails a pull request whose title, body or commits name an internal app, with ourostack/.github's one list", () => {
  const block = ciJobs().attribution;
  const script = stepScript(block, "No internal names");
  // The guard's two files come from ourostack/.github's main; curl stands in here, so no test reads the network.
  const run = (env, nodeStatus = 0) => runStep(`curl() { printf 'CALL curl %s\\n' "$*" >&2; }\n${script}`, { RUNNER_TEMP: "/tmp", ...env }, { nodeStatus });
  const pull = run({ EVENT: "pull_request", BASE_REF: "main", PR_HEAD: "abc", PR_TITLE: "t", PR_BODY: "b" });
  assert.equal(pull.status, 0, pull.calls);
  // The title and body reach node through a pipe: a writer slower than the reader still passes.
  const late = runStep(`curl() { :; }\nprintf() { [ "$1" != '%s\\n\\n%s\\n' ] || sleep 0.2; builtin printf "$@"; }\n${script}`, { RUNNER_TEMP: "/tmp", EVENT: "pull_request", BASE_REF: "main", PR_HEAD: "abc", PR_TITLE: "t", PR_BODY: "b" });
  assert.equal(late.status, 0, late.calls);
  assert.match(pull.calls, /CALL curl .*raw\.githubusercontent\.com\/ourostack\/\.github\/main\/tools\/internal-names\/check\.mjs$/m);
  assert.match(pull.calls, /CALL curl .*\/tools\/internal-names\/hashes\.txt$/m);
  assert.match(pull.calls, /^CALL node \/tmp\/internal-names\/check\.mjs --text$/m);
  assert.match(pull.calls, /^CALL node \/tmp\/internal-names\/check\.mjs origin\/main\.\.abc$/m);
  assert.match(run({ EVENT: "merge_group", QUEUE_BASE: "base", QUEUE_HEAD: "head" }).calls, /^CALL node \/tmp\/internal-names\/check\.mjs base\.\.head$/m);
  // A finding fails the job, and with it the ci check.
  assert.equal(run({ EVENT: "pull_request", BASE_REF: "main", PR_HEAD: "abc" }, 1).status, 1);
  const push = run({ EVENT: "push" });
  assert.equal(push.status, 0);
  assert.doesNotMatch(push.calls, /CALL (curl|node)/);
  // The title and body are checked again when the description is edited, in the Claims workflow.
  const claims = readFileSync(join(dir, "claims.yml"), "utf8");
  assert.match(claims, /types: \[opened, edited, synchronize, reopened\]/);
  assert.match(claims, /- name: No internal names in the title and body\n/);
  assert.match(claims, /node "\$guard\/check\.mjs" --text/);
});

test("the ci check requires the attribution job, which checks a pull request's commits and the merge queue's squash commits with git alone", () => {
  const jobs = ciJobs();
  const block = jobs.attribution;
  assert.ok(jobs.ci.match(/^ {4}needs: \[([^\]]*)\]$/m)[1].split(", ").includes("attribution"));
  assert.match(stepScript(jobs.ci, "Every part passed"), /"attribution=\$ATTRIBUTION"/);
  assert.match(jobs.ci, /^ {10}ATTRIBUTION: \$\{\{ needs\.attribution\.result \}\}$/m);
  assert.match(block, /^ {4}needs: \[plan\]$/m);
  assert.equal(block.match(/^ {4}if: (.+)$/m)?.[1], untested);
  // Cheap: no install, and every commit without its trees, so any range reads.
  assert.doesNotMatch(block, /pnpm|npm |npx /);
  assert.match(block, /- uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}persist-credentials: false\n(?: {10}#.*\n)* {10}fetch-depth: 0\n {10}filter: tree:0\n/);
  // The partial clone fetches trees lazily while the log reads them, so the script tries its log again rather than fail on one dropped connection.
  const attribution = readFileSync(new URL("./attribution.mjs", import.meta.url), "utf8");
  assert.match(attribution, /LOG_TRIES = \d+;/);
  assert.match(attribution, /if \(attempt >= LOG_TRIES\) throw error;/);
  const step = block.slice(block.search(/^ {6}- name: No AI attribution\n/m));
  for (const [name, value] of [["EVENT", "github.event_name"], ["BASE_REF", "github.base_ref"], ["PR_HEAD", "github.event.pull_request.head.sha"], ["QUEUE_BASE", "github.event.merge_group.base_sha"], ["QUEUE_HEAD", "github.event.merge_group.head_sha"]]) {
    assert.match(step, new RegExp(`^ {10}${name}: \\$\\{\\{ ${value.replace(/\./g, "\\.")} \\}\\}$`, "m"));
  }
  const script = stepScript(block, "No AI attribution");
  const pull = runStep(script, { EVENT: "pull_request", BASE_REF: "main", PR_HEAD: "abc" });
  assert.equal(pull.status, 0);
  assert.match(pull.calls, /^CALL node scripts\/attribution\.mjs origin\/main abc$/m);
  const queue = runStep(script, { EVENT: "merge_group", QUEUE_BASE: "base", QUEUE_HEAD: "head" });
  assert.match(queue.calls, /^CALL node scripts\/attribution\.mjs base head$/m);
  // A problem, or a range it cannot read, fails the job, and with it the ci check.
  for (const env of [{ EVENT: "pull_request", BASE_REF: "main", PR_HEAD: "abc" }, { EVENT: "merge_group", QUEUE_BASE: "", QUEUE_HEAD: "" }]) {
    assert.equal(runStep(script, env, { nodeStatus: 1 }).status, 1, env.EVENT);
  }
  // A push to main or a dispatched run adds no commit the pull request and the queue did not check.
  for (const EVENT of ["push", "workflow_dispatch"]) {
    const other = runStep(script, { EVENT });
    assert.equal(other.status, 0);
    assert.doesNotMatch(other.calls, /CALL node/);
    assert.match(other.stdout, /^::notice::No commits to check/m);
  }
});

test("the themes shards pass as not affected when a pull request changes no component, and scan only the selected stories otherwise", () => {
  const block = ciJobs()["themes-shard"];
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
  assert.match(runStep(scan, { FULL: "true", SHARD: "2" }).calls, /CALL pnpm test:themes --shard=2\/6\nOURO_STORIES=unset/);
  assert.match(runStep(scan, { FULL: "false", COMPONENTS: "checkbox-group", SHARD: "2" }).calls, /CALL pnpm test:themes --shard=2\/6\nOURO_STORIES=checkbox$/m);
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
  // Three shards where every story is checked (main, the merge queue, a full plan); on a reduced pull request, the plan's
  // count (one for a few stories, three for most: scripts/test-impact.mjs conformanceShards), else one.
  assert.match(block, /^ {8}shard: \$\{\{ fromJSON\(needs\.plan\.outputs\.full != 'false' && \(github\.event_name == 'pull_request' && '\[1,2,3\]' \|\| '\[1,2\]'\) \|\| needs\.plan\.outputs\.conformance_shards \|\| '\[1\]'\) \}\}$/m);
  assert.match(ciJobs().plan, /^ {6}conformance_shards: \$\{\{ steps\.plan\.outputs\.conformance_shards \}\}$/m);
  assert.match(block, /^ {4}name: conformance \(\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}\)$/m);
});

test("conformance and mutation are each one check over their shards, which passes only when every shard passed", () => {
  const jobs = ciJobs();
  for (const [check, needs] of [["conformance", "plan, conformance-shard"], ["themes", "plan, themes-shard"], ["mutation", "plan, mutation-plan, mutation-shard"]]) {
    assert.match(jobs[check], new RegExp(`^ {4}needs: \\[${needs}\\]\n {4}if: ${untested.replace(/[$(){}!.]/g, "\\$&")}$`, "m"), check);
    const script = stepScript(jobs[check], "Every shard passed");
    assert.equal(runStep(script, { RESULT: "success" }).status, 0, check);
    for (const result of ["failure", "cancelled", "skipped"]) assert.notEqual(runStep(script, { RESULT: result }).status, 0, `${check} with ${result}`);
  }
  // Mutation passes on skipped shards only when the plan counted none.
  const mutation = stepScript(jobs.mutation, "Every shard passed");
  assert.equal(runStep(mutation, { COUNT: "0", RESULT: "skipped" }).status, 0);
  for (const [count, result] of [["0", "failure"], ["0", "cancelled"], ["3", "skipped"], ["", "skipped"]]) assert.notEqual(runStep(mutation, { COUNT: count, RESULT: result }).status, 0, `${count} ${result}`);
});

test("the mutation plan keys the kept results by pull request and dependency hash, and plans a pull request's shards from its estimated work, at least five without kept results, three with", () => {
  const block = ciJobs()["mutation-plan"];
  const key = stepScript(block, "The cache key's prefix");
  const pull = runStep(key, { EVENT: "pull_request", PR: "139" });
  assert.match(pull.calls, /^CALL node scripts\/mutation\/cache\.mjs key HEAD\^1$/m);
  assert.equal(pull.output.key, "stryker-139--");
  assert.equal(runStep(key, { EVENT: "merge_group", PR: "" }).output.key, "");
  assert.match(block, /^ {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}path: \.tmp\/stryker-incremental\.json\n {10}key: \$\{\{ steps\.key\.outputs\.key \}\}\$\{\{ github\.sha \}\}\n {10}restore-keys: \$\{\{ steps\.key\.outputs\.key \}\}\n {10}lookup-only: true$/m);
  const count = stepScript(block, "How many shards");
  // A stand-in for scripts/mutation.mjs --count: prints the larger of its minimum and $PLANNED.
  const planned = (shards) => `node() { printf 'CALL node %s\\n' "$*" >&2; min=\${4%%/*}; echo $(( ${shards} > min ? ${shards} : min )); }\n${count}`;
  const cold = runStep(planned(5), { KEY: "stryker-139-abc-", MATCHED: "" });
  assert.match(cold.calls, /^CALL node scripts\/mutation\.mjs HEAD\^1 --count 5\/24$/m);
  assert.deepEqual(cold.output, { count: "5", shards: "[1,2,3,4,5]" });
  assert.deepEqual(runStep(planned(13), { KEY: "stryker-139-abc-", MATCHED: "" }).output, { count: "13", shards: "[1,2,3,4,5,6,7,8,9,10,11,12,13]" });
  const warm = runStep(planned(2), { KEY: "stryker-139-abc-", MATCHED: "stryker-139-abc-f00" });
  assert.match(warm.calls, /--count 3\/24$/m);
  assert.deepEqual(warm.output, { count: "3", shards: "[1,2,3]" });
  // No changed path is runtime source: no shard starts (the matrix still needs a value).
  const none = runStep(`node() { echo 0; }\n${count}`, { KEY: "stryker-139-abc-", MATCHED: "" });
  assert.equal(none.status, 0);
  assert.deepEqual(none.output, { count: "0", shards: "[0]" });
  assert.equal(ciJobs()["mutation-shard"].match(/^ {4}if: (.+)$/m)?.[1], mutationRuns);
  // Not a pull request: nothing to mutate, so no shard starts, and no plan.
  const other = runStep(planned(13), { KEY: "", MATCHED: "" });
  assert.deepEqual(other.output, { count: "0", shards: "[0]" });
  assert.doesNotMatch(other.calls, /CALL node/);
  // A plan that prints no count fails the job rather than guess.
  assert.notEqual(runStep(`node() { :; }\n${count}`, { KEY: "stryker-139-abc-", MATCHED: "" }).status, 0);
  // The job installs the packages the plan reads the changed lines with only on a pull request.
  for (const step of ["uses: pnpm/action-setup@", "run: pnpm i --frozen-lockfile"]) assert.match(block, new RegExp(`- if: steps\\.key\\.outputs\\.key != ''\\n {8}${step.replace(/[.]/g, "\\.")}`), step);
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
  // With no shard planned there is nothing to merge or keep.
  assert.match(block, /^ {6}KEY: \$\{\{ needs\.mutation-plan\.outputs\.count != '0' && needs\.mutation-plan\.outputs\.key \|\| '' \}\}$/m);
  assert.match(block, /run: node scripts\/mutation\/cache\.mjs merge \.tmp\/stryker-incremental\.json \.tmp\/shards\/\*\/stryker-incremental\.json/);
  assert.match(block, /uses: actions\/cache\/save@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}path: \.tmp\/stryker-incremental\.json\n {10}key: \$\{\{ env\.KEY \}\}\$\{\{ github\.sha \}\}$/m);
});

test("ci-budget reads the sweep timings only when the sweeps ran, so a run that skipped them has no download to check", () => {
  const block = ciJobs()["ci-budget"];
  const steps = block.split("\n      - ").filter((step) => /timings-sweeps-\*|scripts\/waivers\.mjs \.tmp/.test(step));
  assert.equal(steps.length, 2);
  for (const step of steps) assert.match(step, /if: \$\{\{ needs\.e2e\.result == 'success' && needs\.plan\.outputs\.tested != 'true' && needs\.plan\.outputs\.heavy != 'skip' \}\}/);
});

test("the e2e shards run every spec, or the selected components' and the site's, each shard its share by measured time, and the e2e check passes when they all did", async () => {
  const jobs = ciJobs();
  const block = jobs["e2e-shard"];
  const count = shardCount(block);
  assert.match(block, /^ {6}SHARD: \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/m);
  assert.match(block, /fromJSON\(github\.event_name == 'pull_request' && '\[1,2,3,4,5,6,7,8\]' \|\| '\[1,2,3\]'\)/);
  const script = stepScript(block, "End-to-end specs");
  // A full run: the spec files the shard's measured share holds (the stand-in for node prints two).
  const full = runStep(script, { FULL: "true", SHARD: "1/3" });
  assert.match(full.calls, /^CALL node scripts\/shard\.mjs e2e 1\/3\nCALL pnpm test:e2e registry\/ouro\/e2e\/ouro\/checkbox\.spec\.ts site\/e2e\/$/m);
  assert.match(block, /^ {6}OURO_E2E_TIMINGS: \.tmp\/timings\/e2e-\$\{\{ matrix\.shard \}\}of\$\{\{ strategy\.job-total \}\}\.json$/m);
  assert.match(block, /^ {10}name: timings-e2e-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/timings\/\n/m);
  // Between them, the shards run every spec file once.
  const { e2eFiles, readTimings, shardKeys } = await import("./shard.mjs");
  const shares = Array.from({ length: count }, (_, index) => shardKeys(e2eFiles(), { index: index + 1, count }, readTimings("e2e")));
  assert.deepEqual(shares.flat().sort(), e2eFiles());
  assert.ok(shares.every((share) => share.length > 0));
  // A reduced run: the same split by measured time, of the selected components' specs and the site's.
  const reduced = runStep(script, { FULL: "false", COMPONENTS: "checkbox", SHARD: "1/6", SHARD_SPECS: "site/e2e/home.spec.ts" });
  assert.equal(reduced.status, 0);
  assert.match(reduced.calls, /^CALL node scripts\/test-impact\.mjs e2e checkbox\nCALL node scripts\/shard\.mjs e2e 1\/6 registry\/ouro\/e2e\/ouro\/checkbox\.spec\.ts site\/e2e\/\nCALL pnpm test:e2e site\/e2e\/home\.spec\.ts$/m);
  // A reduced shard the split leaves no spec passes without running Playwright, which would run every spec.
  const empty = runStep(script, { FULL: "false", COMPONENTS: "checkbox", SHARD: "4/4", SHARD_SPECS: "" });
  assert.equal(empty.status, 0);
  assert.doesNotMatch(empty.calls, /CALL pnpm/);
  // A failing selection or split fails the shard rather than running nothing or everything.
  assert.notEqual(runStep(script, { FULL: "false", COMPONENTS: "checkbox", SHARD: "1/6" }, { nodeStatus: 1 }).status, 0);
  assert.match(jobs.e2e, /^ {4}needs: \[plan, e2e-shard, sweep-shard, sweeps-compare\]$/m);
  const gate = stepScript(jobs.e2e, "Every shard passed");
  assert.equal(runStep(gate, { SHARDS: "success", SWEEPS: "success", COMPARE: "success" }).status, 0);
  assert.equal(runStep(gate, { SHARDS: "failure", SWEEPS: "success", COMPARE: "success" }).status, 1);
  assert.equal(runStep(gate, { SHARDS: "success", SWEEPS: "failure", COMPARE: "success" }).status, 1);
  assert.equal(runStep(gate, { SHARDS: "success", SWEEPS: "success", COMPARE: "failure" }).status, 1);
  // The plan's heavy=skip (only files the specs never read changed) passes the skipped shards; anything else needs them.
  assert.equal(runStep(gate, { SHARDS: "skipped", SWEEPS: "skipped", COMPARE: "skipped", HEAVY: "skip" }).status, 0);
  assert.equal(runStep(gate, { SHARDS: "skipped", SWEEPS: "skipped", COMPARE: "skipped", HEAVY: "here" }).status, 1);
  // Each sweeps shard saves its looks, and one job compares every part's, so a page in another shard is compared too (#2527).
  assert.match(jobs["sweep-shard"], /name: sweeps-looks-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/looks\//);
  assert.match(jobs["sweeps-compare"], /^ {4}needs: \[plan, sweep-shard\]$/m);
  assert.match(jobs["sweeps-compare"], /pattern: sweeps-looks-\*\n {10}path: \.tmp\/looks\n {10}merge-multiple: true/);
  assert.match(jobs["sweeps-compare"], /run: node scripts\/sweeps-compare\.mjs \.tmp\/looks \.tmp\/timings$/m);
  assert.match(jobs["sweeps-compare"], /name: timings-sweeps-compare/);
  // On a pull request the shard sets the scope in which a changed control's picture is taken twice (site/e2e/stable-take.ts), before the specs run.
  const retake = stepScript(jobs["sweep-shard"], "Sweeps retake scope");
  assert.match(retake, /GITHUB_EVENT_NAME" = pull_request/);
  assert.match(retake, /node scripts\/sweeps-retake\.mjs "\$GITHUB_EVENT_NAME" \.tmp\/sweeps-changed\.txt/);
  assert.ok(jobs["sweep-shard"].indexOf("Sweeps retake scope") < jobs["sweep-shard"].indexOf("name: Sweep specs"));
  // ci-budget reaches sweeps-compare through the e2e gate, which waits on it.
  // The sweeps run in shards of their own, so between the e2e and sweep shards every spec runs once.
  const { sweepFiles } = await import("./shard.mjs");
  const sweeps = Array.from({ length: 14 }, (_, index) => shardKeys(sweepFiles(), { index: index + 1, count: 14 }, readTimings("e2e")));
  assert.deepEqual(sweeps.flat().sort(), sweepFiles());
  assert.ok(sweeps.every((share) => share.length > 0));
  assert.match(jobs["sweep-shard"], /^ {6}SHARD: \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/m);
  assert.deepEqual(matrixValues(jobs["sweep-shard"], "shard"), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
  assert.match(jobs["sweep-shard"], /fromJSON\(github\.event_name == 'pull_request' && '\[1,2,3,4,5,6,7,8,9,10,11,12,13,14\]' \|\| '\[1,2,3,4\]'\)/);
});

test("an install shard runs its share of the shipped tests by measured time, or a reduced run's, and its variant's check counts every shard's marker", () => {
  const jobs = ciJobs();
  const block = jobs["install-shard"];
  const count = shardCount(block);
  assert.match(block, /^ {6}OURO_SHARD: \$\{\{ matrix\.shard \}\}\/\$\{\{ github\.event_name == 'pull_request' && 6 \|\| 3 \}\}$/m);
  assert.equal(count, 6);
  const script = stepScript(block, "Install test");
  // `show` stands for install-test.sh: it prints whether OURO_COMPONENTS is set, and to what.
  const scriptWithShow = (env) => {
    const scratch = scratchDir("ouro-install-step-");
    const show = 'show() { if [ -n "${OURO_COMPONENTS+set}" ]; then echo "components=[$OURO_COMPONENTS] $*"; else echo "components=unset $*"; fi; }';
    const result = spawnSync("bash", ["-e", "-c", `${show}\n${script.replace("scripts/install-test.sh", "show")}`], { cwd: root, encoding: "utf8", env: sandboxEnv({ ...env, RUNNER_TEMP: scratch, PASSED: "install-passed-shadcn-nova-2", OURO_APP: "/tmp/ouro-app" }) });
    return { ...result, scratch };
  };
  const full = scriptWithShow({ FULL: "true", COMPONENTS: "", VARIANT: "shadcn", REF: "abc" });
  assert.equal(full.status, 0, full.stderr);
  assert.match(full.stdout, /^components=unset shadcn \/tmp\/ouro-app abc$/m);
  assert.equal(readFileSync(join(full.scratch, "passed/install-passed-shadcn-nova-2"), "utf8").trim(), "install-passed-shadcn-nova-2");
  assert.match(scriptWithShow({ FULL: "false", COMPONENTS: "", VARIANT: "ouro", REF: "abc" }).stdout, /^components=\[\] ouro /m);
  assert.match(scriptWithShow({ FULL: "false", COMPONENTS: "dialog,sheet", VARIANT: "ouro", REF: "abc" }).stdout, /^components=\[dialog,sheet\] ouro /m);
  // The variant's check: its marker for every shard.
  const gate = jobs["install-gate"];
  assert.match(gate, /^ {4}needs: \[plan, install-shard, install-checks\]$/m);
  assert.deepEqual(checkNames(gate, "install-gate"), ["install (shadcn, nova)", "install (shadcn, vega)", "install (ouro, nova)"]);
  assert.match(gate, /^ {10}pattern: install-passed-\$\{\{ matrix\.variant \}\}-\$\{\{ matrix\.preset \}\}-\*\n/m);
  const counting = stepScript(gate, "Every shard passed");
  assert.match(counting, /^for shard in \$\(seq 1 "\$SHARD_COUNT"\); do$/m);
  const markers = scratchDir("ouro-install-gate-");
  mkdirSync(join(markers, "passed"));
  for (let shard = 1; shard < count; shard++) writeFileSync(join(markers, `passed/install-passed-shadcn-vega-${shard}`), "");
  const passed = { RUNNER_TEMP: markers, VARIANT: "shadcn", PRESET: "vega", SHARD_COUNT: String(count), SHARDS: "success", CHECKS: "success" };
  assert.match(gate, /^ {10}SHARDS: \$\{\{ needs\.install-shard\.result \}\}$/m);
  const missing = runStep(counting, passed);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, new RegExp(`^::error::install \\(shadcn, vega, ${count}/${count}\\) did not pass`, "m"));
  writeFileSync(join(markers, `passed/install-passed-shadcn-vega-${count}`), "");
  assert.equal(runStep(counting, passed).status, 0);
  // Every marker, but from an earlier attempt: this attempt's failed shard still fails the check.
  const rerun = runStep(counting, { ...passed, SHARDS: "failure" });
  assert.equal(rerun.status, 1);
  assert.match(rerun.stdout, /^::error::an install shard of this attempt did not pass \(failure\)/m);
});

test("every job of a workflow that runs on pull requests or in the merge queue ends within an hour", () => {
  const checked = workflows.filter(({ text }) => /^ {2}(?:pull_request|pull_request_target|merge_group):/m.test(text.split(/^jobs:$/m)[0].split(/^on:$/m)[1] ?? ""));
  assert.ok(["ci.yml", "claims.yml", "conformance-exemptions.yml"].every((file) => checked.some((workflow) => workflow.file === file)), checked.map(({ file }) => file).join(", "));
  for (const { file, text } of checked) {
    const jobs = text.split(/^jobs:\n/m)[1].split(/\n(?= {2}[\w-]+:\n)/);
    for (const job of jobs) {
      const id = job.match(/^ {2}([\w-]+):/)[1];
      // A job that calls a reusable workflow takes no limit of its own: the called workflow's jobs keep theirs (the lane's is 60 minutes).
      if (/^ {4}uses: /m.test(job)) continue;
      // A limit is a number, or `${{ github.event_name == 'pull_request' && <a> || <b> }}`: then both must be within the hour.
      const line = job.match(/^ {4}timeout-minutes: (.+)$/m)?.[1] ?? "";
      const byEvent = /^\$\{\{ github\.event_name == '[a-z_]+' && (\d+) \|\| (\d+) \}\}$/.exec(line);
      const limits = byEvent ? [Number(byEvent[1]), Number(byEvent[2])] : [Number(/^\d+$/.test(line) ? line : NaN)];
      for (const minutes of limits) assert.ok(minutes >= 10 && minutes <= 60, `${file}: ${id} has timeout-minutes ${minutes}`);
    }
  }
});

test("an install shard ends within 30 minutes, about twice its 90th percentile", () => {
  const shard = ciJobs()["install-shard"];
  assert.match(shard, /\n {4}timeout-minutes: 30\n/);
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
    return spawnSync("bash", ["-e", "-u", "-o", "pipefail", "-c", `${stubs}\nroot=${JSON.stringify(root)}\n${tail}`], { cwd: scratch, encoding: "utf8", env: sandboxEnv({ CI: "", ...env }) });
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
  assert.match(shard.stdout, new RegExp(`^npx vitest run --maxWorkers=1 ${escaped(mine)}$`, "m"));
  assert.match(shard.stdout, new RegExp(`^npx playwright test --fully-parallel --reporter=list ${escaped(mySpecs)}$`, "m"));
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
  // 39759795561 and #161's queue run 39764170430 the background apt outlasted a 15-minute wait and
  // the two raced for dpkg's and the package lists' locks.
  const scratch = scratchDir("ouro-install-deps-");
  const status = join(scratch, "deps.status");
  writeFileSync(status, "0\n");
  const idle = "pgrep() { return 1; }";
  assert.match(run({ CI: "1", OURO_BROWSER_DEPS: status }, [], idle).stdout, /^npx playwright install chromium webkit$/m);
  // Still running: the status lands only after 500 polls of 2 seconds, past the 15 minutes the old wait gave up at.
  const late = join(scratch, "late.status");
  const slow = run({ CI: "1", OURO_BROWSER_DEPS: late, LATE: late }, [], `${idle}\npolls=0\nsleep() { polls=$((polls + 1)); [ "$polls" -lt 500 ] || { echo 0 > "$LATE"; echo "polled $polls times"; }; }`);
  assert.equal(slow.status, 0, slow.stderr);
  assert.match(slow.stdout, /^polled 500 times$/m);
  assert.match(slow.stdout, /^npx playwright install chromium webkit$/m);
  // It failed: the system packages are installed here, once it has finished, and the browsers without them.
  writeFileSync(status, "100\n");
  const failed = run({ CI: "1", OURO_BROWSER_DEPS: status }, [], idle);
  assert.match(failed.stdout, /did not install them; installing them here/);
  assert.match(failed.stdout, /^npx playwright install-deps chromium webkit$[\s\S]*^npx playwright install chromium webkit$/m);
  for (const result of [slow, failed]) assert.doesNotMatch(result.stdout, /--with-deps/);
  // Whatever else runs apt (the runner's own updates) is waited out before the app's playwright install, which may run apt.
  const busy = run({ CI: "1" }, [], 'checks=0\npgrep() { checks=$((checks + 1)); [ "$checks" -lt 3 ]; }\nsleep() { echo "waited for apt"; }');
  assert.equal(busy.status, 0, busy.stderr);
  assert.match(busy.stdout, /^waited for apt\nwaited for apt\n(?:.*\n)*npx playwright install --with-deps chromium webkit$/m);
  assert.match(run({ CI: "1" }).stdout, /^npx playwright install --with-deps chromium webkit$/m);
  // In Playwright's image the browsers' system packages are there: no wait, no apt, no --with-deps.
  const image = run({ CI: "1", OURO_SYSTEM_PACKAGES: "image", OURO_BROWSER_DEPS: join(scratch, "never.status") }, [], 'pgrep() { echo "pgrep $*"; return 1; }\nsleep() { echo "slept"; exit 9; }');
  assert.equal(image.status, 0, image.stderr);
  assert.match(image.stdout, /^npx playwright install chromium webkit$/m);
  assert.doesNotMatch(image.stdout, /--with-deps|install-deps|slept/);
  assert.match(ciJobs()["install-shard"], /^ {8}OURO_SYSTEM_PACKAGES: image$/m);
  assert.doesNotMatch(ciJobs()["install-shard"], /OURO_BROWSER_DEPS|browser-deps/);
  // In CI a shard's run adds the stall reporter, so a hang in the installed app fails in minutes and names what hung (#671).
  const watched = run({ CI: "1", OURO_SYSTEM_PACKAGES: "image", OURO_SHARD: "2/2" }, [...shipped, ...specs]);
  assert.equal(watched.status, 0, watched.stderr);
  assert.match(watched.stdout, new RegExp(`^npx vitest run --maxWorkers=1 --reporter=default --reporter=${escaped([join(root, "scripts/stall-reporter-default.mts")])} ${escaped(mine)}$`, "m"));
  assert.doesNotMatch(all.stdout + shard.stdout, /stall-reporter/);
  const some = run({ OURO_COMPONENTS: "checkbox,checkbox-group", OURO_SHARD: "1/3" });
  assert.equal(some.status, 0, some.stderr);
  assert.match(some.stdout, /^npx vitest run --maxWorkers=1 --passWithNoTests --shard=1\/3 components\/ouro\/checkbox\/$/m);
  assert.match(some.stdout, /^npx playwright test --fully-parallel --reporter=list --pass-with-no-tests --shard=1\/3 e2e\/ouro\/checkbox\.spec\.ts e2e\/ouro\/checkbox-group\.spec\.ts$/m);
});

test("install-test.sh ties the shipped tests' stall budgets to what is actually left of the job's own OURO_CI_JOB_BUDGET_MS", async () => {
  const install = readFileSync(join(root, "scripts/install-test.sh"), "utf8");
  const tail = install.slice(install.indexOf("# The shipped tests to run:"));
  const run = (env, files = []) => {
    const scratch = scratchDir("ouro-install-budget-");
    for (const file of files) {
      mkdirSync(join(scratch, dirname(file)), { recursive: true });
      writeFileSync(join(scratch, file), "");
    }
    const stubs = `npx() { echo "npx $*"; }`;
    return spawnSync("bash", ["-e", "-u", "-o", "pipefail", "-c", `${stubs}\nroot=${JSON.stringify(root)}\n${tail}`], { cwd: scratch, encoding: "utf8", env: sandboxEnv({ CI: "", ...env }) });
  };
  const shipped = ["src/components/ouro/button/button.test.tsx"];
  const specs = ["e2e/ouro/dialog.spec.ts"];
  // Without a job budget (a contributor's own run, and install-shard's job before this change), the
  // shipped tests' existing defaults are untouched: an unbounded stall reporter and an unbounded
  // Playwright run (install (ouro, nova, 3/3), run 45307477177, cut off at the job's own 30 minutes
  // with nothing named).
  const noBudget = run({ CI: "1", OURO_SYSTEM_PACKAGES: "image", OURO_SHARD: "1/1" }, [...shipped, ...specs]);
  assert.equal(noBudget.status, 0, noBudget.stderr);
  assert.doesNotMatch(noBudget.stdout, /OURO_CI_STEP_BUDGET_MS|remaining budget/);
  assert.doesNotMatch(noBudget.stdout, /--global-timeout/);
  // With a job budget, the Vitest stall reporter's own OURO_CI_STEP_BUDGET_MS is exported with what
  // is left of it (close to the whole budget here, since nothing in this sandboxed run has spent any
  // of it yet), and the Playwright run is bounded the same way, with its own margin subtracted so it
  // fails first and leaves Playwright's own report time to flush.
  const budgeted = run({ CI: "1", OURO_SYSTEM_PACKAGES: "image", OURO_SHARD: "1/1", OURO_CI_JOB_BUDGET_MS: "1800000" }, [...shipped, ...specs]);
  assert.equal(budgeted.status, 0, budgeted.stderr);
  assert.match(budgeted.stdout, /^Shipped Vitest browser tests: a stall fails within \d+ms \(this job's own remaining budget\), naming what is in flight\.$/m);
  const vitestMs = Number(budgeted.stdout.match(/a stall fails within (\d+)ms/)[1]);
  assert.ok(vitestMs > 1_700_000 && vitestMs <= 1_800_000, `vitest budget ${vitestMs} should be close to the full 1800000ms job budget`);
  assert.match(budgeted.stdout, /^Shipped Playwright specs: a hang anywhere in the run fails within \d+ms \(this job's own remaining budget\)\.$/m);
  const pwMs = Number(budgeted.stdout.match(/Shipped Playwright specs: a hang anywhere in the run fails within (\d+)ms/)[1]);
  assert.ok(Math.abs(vitestMs - pwMs - 20_000) <= 1_000, `playwright's ${pwMs}ms should be vitest's ${vitestMs}ms minus its 20s margin`);
  assert.match(budgeted.stdout, new RegExp(`^npx playwright test --fully-parallel --reporter=list --global-timeout=${pwMs} `, "m"));
});

test("motion coverage runs beside the ci check, over the partitions the browser shards upload, expecting every project in every shard", async () => {
  const jobs = ciJobs();
  // A browser test job runs Vitest and uploads the partitions it wrote as its next step, before
  // any other Vitest run in the job can rewrite them.
  const browserJobs = Object.keys(jobs).filter((name) => /^ {6}- id: tests\n {8}name: Browser tests\n/m.test(jobs[name]));
  assert.deepEqual(browserJobs, ["browser", "browser-fallback"]);
  assert.match(
    jobs.browser,
    /^ {8}name: Browser tests\n(?: {8}timeout-minutes: \d+\n)? {8}run: \|\n(?: {10}.*\n)+(?: {6}#.*\n)*^ {6}- uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}name: motion-browser-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/motion\/\n {10}include-hidden-files: true\n {10}if-no-files-found: error\n/m,
    "the browser shards upload .tmp/motion/ as a motion-browser-* artifact right after their browser tests",
  );
  const coverage = jobs["motion-coverage"];
  assert.ok(coverage, "ci.yml has a motion-coverage job");
  assert.match(coverage, /^ {4}needs: \[plan, browser, coverage, browser-fallback\]$/m, "motion-coverage waits on the shards and the coverage job, not on the ci check");
  assert.match(coverage, /- if: env\.BROWSER_RUN == 'true'\n {8}uses: actions\/download-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}pattern: \$\{\{ needs\.coverage\.outputs\.fallback == 'true' && 'motion-fallback-\*' \|\| 'motion-browser-\*' \}\}\n {10}path: \$\{\{ runner\.temp \}\}\/motion\n/);
  // When the plan skipped the browser shards, no motion was recorded: every step but a notice is skipped.
  assert.match(coverage, /^ {6}BROWSER_RUN: \$\{\{ needs\.plan\.outputs\.browser != 'false' && needs\.coverage\.outputs\.fallback == 'true' \}\}$/m);
  const steps = coverage.slice(coverage.indexOf("    steps:")).split(/\n {6}- /).slice(1);
  assert.match(steps[0], /^if: env\.BROWSER_RUN == 'false'\n {8}run: echo /);
  for (const step of steps.slice(1)) assert.match(step, /^if: env\.BROWSER_RUN == 'true'$/m, step);
  const check = stepScript(coverage, "Motion coverage");
  // Full: every map complete. Reduced: every project still ran, and only the ci job's stems' maps must be complete.
  const env = { MOTION_PARTITIONS: "p:6", FULL_SUITE_PARTITIONS: "p:12", RUNNER_TEMP: "/r" };
  assert.match(runStep(check, { ...env, REDUCED: "false", FALLBACK: "false" }).calls, /^CALL node scripts\/motion-coverage\.mts --dir \/r\/motion --expect p:6$/m);
  assert.match(runStep(check, { ...env, REDUCED: "true", STEMS: "checkbox,checkbox-group", FALLBACK: "false" }).calls, /^CALL node scripts\/motion-coverage\.mts --dir \/r\/motion --expect p:6 --stems checkbox,checkbox-group$/m);
  assert.match(runStep(check, { ...env, REDUCED: "", FALLBACK: "" }).calls, /^CALL node scripts\/motion-coverage\.mts --dir \/r\/motion --expect p:6$/m);
  // The full suite decided in the browser-fallback shards: their partitions.
  assert.match(runStep(check, { ...env, REDUCED: "false", FALLBACK: "true" }).calls, /^CALL node scripts\/motion-coverage\.mts --dir \/r\/motion --expect p:12$/m);
  assert.match(coverage, /^ {6}REDUCED: \$\{\{ needs\.coverage\.outputs\.reduced \}\}\n {6}STEMS: \$\{\{ needs\.coverage\.outputs\.stems \}\}\n {6}FALLBACK: \$\{\{ needs\.coverage\.outputs\.fallback \}\}$/m);
  assert.match(
    jobs["browser-fallback"],
    /^ {8}name: Browser tests\n(?: {8}timeout-minutes: \d+\n)? {8}run: \|\n(?: {10}.*\n)+^ {6}- uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}name: motion-fallback-\$\{\{ matrix\.shard \}\}\n {10}path: \.tmp\/motion\/\n {10}include-hidden-files: true\n {10}if-no-files-found: error\n/m,
    "the fallback shards upload .tmp/motion/ as a motion-fallback-* artifact right after their browser tests",
  );
  // The expected partitions: each project vitest.config.ts runs (CI_VISUAL unset, as in the
  // browser shards), once per shard, and once per fallback shard when the full suite decided. The reduced run
  // names every project too (scripts/test-impact.mjs).
  const config = (await import("../vitest.config.ts")).default;
  const projects = config.test.projects.map((project) => project.test.name);
  assert.deepEqual(projects, ["ouro-chromium", "ouro-webkit", "ouro-touch", "site"]);
  const shards = shardCount(jobs.browser);
  assert.equal(coverage.match(/^ {6}MOTION_PARTITIONS: (.+)$/m)?.[1], projects.map((name) => `${name}:${shards}`).join(","));
  assert.equal(coverage.match(/^ {6}FULL_SUITE_PARTITIONS: (.+)$/m)?.[1], projects.map((name) => `${name}:${shardCount(jobs["browser-fallback"])}`).join(","));
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

test("a browser shard runs two test files at a time in each Vitest project, and every other run keeps Vitest's default", () => {
  // vitest.config.ts reads the shard from its process's arguments and the suite from the environment, so each case loads it afresh.
  const configUrl = new URL("../vitest.config.ts", import.meta.url).href;
  const maxWorkers = (args, env = {}) => {
    const probe = `const config = (await import(${JSON.stringify(configUrl)})).default; console.log(JSON.stringify(config.test.maxWorkers ?? null));`;
    const clean = { ...process.env, OURO_THEMES: "", OURO_CONFORMANCE: "", OURO_MUTATION: "", CI_VISUAL: "" };
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", probe, "--", ...args], { cwd: root, env: { ...clean, ...env }, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout.trim().split("\n").at(-1));
  };
  assert.equal(maxWorkers(["--shard=3/6"]), 2);
  assert.equal(maxWorkers(["--shard", "7/16"]), 2);
  assert.equal(maxWorkers([]), null);
  assert.equal(maxWorkers(["--shard=1/3"], { OURO_THEMES: "1" }), null);
  assert.equal(maxWorkers(["--shard=1/3"], { OURO_CONFORMANCE: "1" }), null);
  assert.equal(maxWorkers(["--shard=1/3"], { OURO_MUTATION: "1" }), null);
});

test("the budget job waits on every other job, reads the run's jobs and nothing else, and its name patterns match every check", async () => {
  const jobs = ciJobs();
  const block = jobs["ci-budget"];
  // It runs whatever the other jobs did, but not on a cancelled run, which would hold a runner for
  // nothing, nor on a push whose tree already passed, which runs nothing to measure.
  assert.equal(block.match(/^ {4}if: (.+)$/m)?.[1], untested);
  // Whether the run was full, which its ci-timings record says.
  assert.match(block, /^ {10}FULL: \$\{\{ needs\.plan\.outputs\.full != 'false' \}\}$/m);
  // Whether ci ran the full suite as a fallback, which is not judged, and the branch whose previous full run confirms a regression.
  assert.match(block, /^ {10}FALLBACK: \$\{\{ needs\.ci\.outputs\.fallback == 'true' \}\}$/m);
  assert.match(block, /^ {10}HEAD_REF: \$\{\{ github\.head_ref \}\}$/m);
  assert.match(block, /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n/m);
  const needs = block.match(/^ {4}needs: \[([^\]]*)\]$/m)[1].split(",").map((need) => need.trim());
  // Every job no other job needs: the ends of the run's chains, but fail-fast, which watches this
  // job too and stops once it has finished (scripts/ci-fail-fast.mjs).
  const needed = new Set(Object.entries(jobs).filter(([id]) => id !== "ci-budget" && id !== "tree-proof").flatMap(([, other]) => other.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()) ?? []));
  // tree-proof, the proof a push to main reads, runs beside it on what it waits on.
  const ends = Object.keys(jobs).filter((id) => id !== "ci-budget" && id !== "fail-fast" && id !== "tree-proof" && !needed.has(id));
  assert.deepEqual([...needs].sort(), [...new Set([...ends, "plan", "ci"])].sort());
  const { jobGraph } = await import("./ci-budget.mjs");
  const graph = jobGraph(workflow("ci.yml"));
  for (const [id, block] of Object.entries(jobs)) {
    for (const name of checkNames(block, id)) assert.deepEqual(graph.filter((node) => node.pattern.test(name)).map((node) => node.id), [id], name);
  }
});

// The screen-reader lane (screen-reader-lane.yml, which screen-reader.yml and ci.yml call): real VoiceOver and
// NVDA through Guidepup, nightly, and on every push to main, right after a release tags it; ci.yml's plan selects it for no pull request.
// Guidepup's setup rewrites VoiceOver and TCC settings, so the lane runs only what it is asked to, on throwaway
// hosted runners, with nothing to leak. Only screen-reader.yml writes issues, on a schedule or a push: a pull
// request's call never meets that job.

const screenReader = () => workflow("screen-reader.yml");
const jobsOf = (text) =>
  Object.fromEntries(
    text
      .split("\njobs:\n")[1]
      .split(/\n(?= {2}[\w-]+:\n)/)
      .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
  );
/** The lane's jobs, in screen-reader-lane.yml. */
const srJobs = () => jobsOf(workflow("screen-reader-lane.yml"));
/** screen-reader.yml's jobs: the call to the lane, and the report that files the infrastructure issue. */
const callerJobs = () => jobsOf(screenReader());

test("screen-reader.yml runs the lane on every push to main, nightly, and on dispatch with a required source_sha, and never for a pull request", () => {
  const text = screenReader();
  const on = text.split("\non:\n")[1].split(/\n(?=\S)/)[0];
  assert.deepEqual([...on.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]), ["push", "schedule", "workflow_dispatch"]);
  assert.match(on, /^ {4}- cron: "[^"]+"$/m);
  assert.match(on, /^ {6}source_sha:\n {8}description: .+\n {8}required: true$/m);
  assert.doesNotMatch(on, /pull_request|workflow_call/);
  // The lane it calls is the read-only file, given this run's commit, every spec and this repository.
  assert.match(callerJobs().lane, /^ {4}uses: \.\/\.github\/workflows\/screen-reader-lane\.yml$/m);
  assert.match(callerJobs().lane, /^ {6}source_sha: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}$/m);
  assert.match(callerJobs().lane, /^ {6}head_repo: \$\{\{ github\.repository \}\}$/m);
  assert.match(callerJobs().lane, /^ {6}specs: all$/m);
});

test("screen-reader-lane.yml is only a workflow_call, with the three inputs every caller passes and no trigger of its own", () => {
  const on = workflow("screen-reader-lane.yml").split("\non:\n")[1].split(/\n(?=\S)/)[0];
  assert.deepEqual([...on.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]), ["workflow_call"]);
  // Every input is required and typed: ci.yml passes the pull request's head commit and its specs; screen-reader.yml passes this run's commit.
  assert.match(on, /^ {2}workflow_call:\n {4}inputs:\n {6}source_sha:\n {8}description: .+\n {8}required: true\n {8}type: string\n {6}specs:\n {8}description: .+\n {8}required: true\n {8}type: string\n {6}head_repo:\n {8}description: .+\n {8}required: true\n {8}type: string$/m);
  assert.doesNotMatch(on, /pull_request/);
});

test("ci.yml calls the lane for a pull request from this repository only, with its head commit and the specs its change reaches, after yielding to main's lane", () => {
  const ci = ciJobs();
  const same = "${{ !cancelled() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && needs.plan.outputs.screen_reader != 'none' }}";
  assert.equal(ci["sr-yield"].match(/^ {4}if: (.+)$/m)[1], same);
  assert.equal(ci["screen-reader"].match(/^ {4}if: (.+)$/m)[1], same);
  assert.match(ci["sr-yield"], /^ {4}needs: \[plan\]$/m);
  assert.match(ci["sr-yield"], /^ {8}run: node scripts\/sr-yield\.mjs$/m);
  assert.match(ci["screen-reader"], /^ {4}needs: \[plan, sr-yield\]$/m);
  assert.match(ci["screen-reader"], /^ {4}uses: \.\/\.github\/workflows\/screen-reader-lane\.yml$/m);
  assert.match(ci["screen-reader"], /^ {6}source_sha: \$\{\{ github\.event\.pull_request\.head\.sha \}\}$/m);
  assert.match(ci["screen-reader"], /^ {6}head_repo: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}$/m);
  // The lane's guard reads that input, not the event payload a called workflow may not see, and refuses any other head repository.
  assert.match(srJobs().lane, /^ {10}HEAD_REPO: \$\{\{ inputs\.head_repo \}\}$/m);
  assert.match(ci["screen-reader"], /^ {6}specs: \$\{\{ needs\.plan\.outputs\.screen_reader_specs \}\}$/m);
  // The caller grants what the lane needs, and no secret reaches it.
  assert.match(ci["screen-reader"], /^ {4}permissions:\n {6}contents: read\n?$/m);
  assert.doesNotMatch(ci["screen-reader"], /secrets/);
  // The plan's lane step asks sr-impact's `pr` command only for a pull request into main from this repository, which runs
  // the lane when the change touches the lane's own files (#666); every other event and a fork wait for main's push run.
  const lane = stepScript(ci.plan, "Which screen-reader specs can the change reach?");
  for (const [event, baseRef, headRepo] of [["pull_request", "main", "someone/fork"], ["push", "", ""], ["merge_group", "", ""], ["pull_request", "release/v1.3.0", "ourostack/ouro-ui"]]) {
    const ran = runStep(lane, { EVENT: event, BASE_REF: baseRef, HEAD_REPO: headRepo, REPO: "ourostack/ouro-ui" });
    assert.equal(ran.status, 0, ran.stdout + ran.stderr);
    assert.doesNotMatch(ran.calls, /sr-impact/, `${event} ${baseRef} ${headRepo}`);
    assert.equal(ran.output.screen_reader, "none");
  }
  const asked = runStep(lane, { EVENT: "pull_request", BASE_REF: "main", HEAD_REPO: "ourostack/ouro-ui", REPO: "ourostack/ouro-ui" });
  assert.equal(asked.status, 0, asked.stdout + asked.stderr);
  assert.match(asked.calls, /^CALL node scripts\/sr-impact\.mjs pr HEAD\^1 HEAD$/m);
  // It fails closed: a selection that fails runs every spec.
  const failed = runStep(lane, { EVENT: "pull_request", BASE_REF: "main", HEAD_REPO: "ourostack/ouro-ui", REPO: "ourostack/ouro-ui" }, { nodeStatus: 1 });
  assert.equal(failed.status, 0, failed.stdout + failed.stderr);
  assert.deepEqual(failed.output, { screen_reader: "all", screen_reader_specs: "all" });
  // The ci check passes the lane's skip only when the plan selected no spec, and counts every other result.
  const parts = stepScript(ci.ci, "Every part passed");
  const passing = { CHECKS: "success", ATTRIBUTION: "success", DESIGN: "success", BROWSER: "success", SUBSETS: "success", SCRIPTS: "success", SCRIPTS_BROWSER: "success", CHECK_NODE: "success", CHECK_NODE_MERGE: "success", COVERAGE: "success", BROWSER_FALLBACK: "skipped", FALLBACK: "", SCREEN_READER: "skipped", SCREEN_READER_RUN: "false" };
  assert.match(ci.ci, /^ {6}SCREEN_READER_RUN: \$\{\{ needs\.plan\.outputs\.screen_reader != 'none' \}\}$/m);
  assert.equal(runStep(parts, passing).status, 0);
  assert.equal(runStep(parts, { ...passing, SCREEN_READER_RUN: "true" }).status, 1, "a selected lane that was skipped fails ci");
  assert.equal(runStep(parts, { ...passing, SCREEN_READER_RUN: "true", SCREEN_READER: "success" }).status, 0);
  assert.equal(runStep(parts, { ...passing, SCREEN_READER: "failure" }).status, 1, "a lane that failed fails ci");
  assert.equal(runStep(parts, { ...passing, SCREEN_READER: "cancelled", SCREEN_READER_RUN: "true" }).status, 1);
});

test("the screen-reader lane reads the repository and nothing more, and holds no secret", () => {
  const text = screenReader();
  assert.match(text, /^permissions:\n {2}contents: read\nconcurrency:/m);
  assert.doesNotMatch(text, /secrets\./);
  const lane = workflow("screen-reader-lane.yml");
  assert.match(lane, /^permissions:\n {2}contents: read\njobs:/m);
  assert.doesNotMatch(lane, /secrets\.|: write$/m);
  const jobs = srJobs();
  assert.doesNotMatch(jobs.lane, /permissions:/);
  // Only the job that files the infrastructure issue may write issues, and it runs no Guidepup.
  const callers = callerJobs();
  assert.match(callers.lane, /^ {4}permissions:\n {6}contents: read$/m);
  assert.match(callers.report, /^ {4}permissions:\n {6}contents: read\n {6}issues: write$/m);
  assert.match(callers.report, /^ {4}if: failure\(\) && \(github\.event_name == 'schedule' \|\| github\.event_name == 'push'\)$/m);
  assert.doesNotMatch(callers.report, /guidepup|test:sr/i);
  assert.match(callers.report, /^ {10}CONTEXT: \$\{\{ github\.event_name == 'push' && 'push to main' \|\| 'nightly' \}\}$/m);
  assert.match(callers.report, /scripts\/sr-infra-issue\.sh "\$RUN_URL" "\$CONTEXT"/);
});

test("a pull request calls only the read-only lane: ci.yml's job grants contents: read, and nothing the lane's file or its jobs request is more", () => {
  const ci = ciJobs();
  assert.match(ci["screen-reader"], /^ {4}permissions:\n {6}contents: read\n?$/m);
  const lane = workflow("screen-reader-lane.yml");
  assert.match(lane, /^permissions:\n {2}contents: read\n/m);
  for (const [id, block] of Object.entries(srJobs())) assert.deepEqual(permissionsOf(block), {}, `${id} requests no permission of its own`);
  assert.doesNotMatch(lane, /^\s*[\w-]+: write$/m);
  // Every workflow ci.yml calls is one of these, and none may ask for more than the caller grants.
  for (const [, called] of workflow("ci.yml").matchAll(/uses: \.\/\.github\/workflows\/([\w.-]+)$/gm)) {
    assert.doesNotMatch(workflow(called), /^\s*[\w-]+: write$/m, `${called} asks for write access`);
  }
  // ci.yml itself writes no issues: rerun-guard.yml, a separate workflow_run workflow, is the only caller
  // that comments on #2469 when a push's rerun has no cause on record (scripts/rerun-guard.mjs).
  assert.equal(workflow("ci.yml").match(/issues: write/g)?.length ?? 0, 0);
});

test("the screen-reader lane's report upload is tried twice and never decides the lane's verdict (#2254)", () => {
  const lane = srJobs().lane;
  const first = lane.match(/- id: upload\n {8}if: (.*)\n {8}uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}continue-on-error: true\n {8}with: &sr-report\n/);
  assert.ok(first, "the first upload continues on error and names its settings");
  assert.equal(first[1], "always() && steps.classify.outcome != 'skipped'");
  assert.match(lane, /^ {10}overwrite: true$/m);
  assert.match(lane, /- id: upload-again\n {8}if: always\(\) && steps\.upload\.outcome == 'failure'\n {8}uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n {8}continue-on-error: true\n {8}with: \*sr-report\n/);
  assert.match(lane, /if: always\(\) && steps\.upload-again\.outcome == 'failure'\n {8}run: echo "::warning title=Screen-reader report not uploaded::/);
});

test("the screen-reader lane gates on VoiceOver on macos-26 and NVDA on windows-2025, with VoiceOver on macos-15 advisory nightly, at the commit it was given", () => {
  const lane = srJobs().lane;
  // The matrix for an event: the nightly run adds the advisory macos-15 job; a push to main, a dispatch and a pull request's call run the two that gate (#2097).
  const include = lane.match(/include: \$\{\{ (fromJSON\(.*\)) \}\}\n/)[1];
  const matrix = (event_name, strict = false) => runInNewContext(include.replace(/github\.event_name/g, JSON.stringify(event_name)).replace(/'/g, "`"), { fromJSON: JSON.parse, inputs: { strict } });
  const gate = [{ os: "macos-26", project: "voiceover", advisory: false }, { os: "windows-2025", project: "nvda", advisory: false }];
  const advisory = { os: "macos-15", project: "voiceover", advisory: true };
  assert.deepEqual(matrix("push"), gate);
  assert.deepEqual(matrix("schedule"), [gate[0], advisory, gate[1]]);
  assert.deepEqual(matrix("workflow_dispatch"), gate);
  assert.deepEqual(matrix("pull_request"), gate);
  // The nightly strict call runs VoiceOver on macos-26 alone, advisory, with the hint-only fallback off (#2085).
  assert.deepEqual(matrix("schedule", true), [{ os: "macos-26", project: "voiceover", advisory: true }]);
  assert.match(lane, /^ {6}SR_STRICT: \$\{\{ inputs\.strict && '1' \|\| '' \}\}$/m);
  // An advisory job's failure does not fail the run, whose conclusion release.yml reads; each job keeps its own artifact.
  assert.match(lane, /^ {4}continue-on-error: \$\{\{ matrix\.advisory \}\}$/m);
  assert.match(lane, /name: screen-reader-\$\{\{ matrix\.project \}\}-\$\{\{ matrix\.os \}\}\$\{\{ inputs\.strict && '-strict' \|\| '' \}\}\n/);
  // At most two macOS runners at once.
  assert.equal(matrix("schedule").filter((job) => job.os.startsWith("macos-")).length, 2);
  assert.equal(matrix("push").filter((job) => job.os.startsWith("macos-")).length, 1);
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
  ["a pull request from this repository on a hosted runner", { SOURCE_SHA: sha, EVENT: "pull_request", HEAD_REPO: "o/r", DISPATCHED_SHA: "c".repeat(40), RUNNER_KIND: "github-hosted", HEAD: sha }, true],
  ["a pull request whose head repository was deleted", { SOURCE_SHA: sha, EVENT: "pull_request", HEAD_REPO: "", DISPATCHED_SHA: "c".repeat(40), RUNNER_KIND: "github-hosted", HEAD: sha }, false],
  ["the spec files a change reaches", { SOURCE_SHA: sha, EVENT: "pull_request", HEAD_REPO: "o/r", DISPATCHED_SHA: "c".repeat(40), RUNNER_KIND: "github-hosted", HEAD: sha, SPECS: "registry/ouro/e2e/screen-reader/button.sr.spec.ts registry/ouro/e2e/screen-reader/dialog.sr.spec.ts" }, true],
  ["a spec file outside the lane", { SOURCE_SHA: sha, EVENT: "pull_request", HEAD_REPO: "o/r", DISPATCHED_SHA: "c".repeat(40), RUNNER_KIND: "github-hosted", HEAD: sha, SPECS: "registry/ouro/e2e/ouro/button.spec.ts" }, false],
  ["a command smuggled into the spec list", { SOURCE_SHA: sha, EVENT: "pull_request", HEAD_REPO: "o/r", DISPATCHED_SHA: "c".repeat(40), RUNNER_KIND: "github-hosted", HEAD: sha, SPECS: "registry/ouro/e2e/screen-reader/button.sr.spec.ts; rm -rf ." }, false],
]) {
  test(`the screen-reader lane's guard ${ok ? "lets through" : "stops"} ${name}`, () => {
    const guard = stepScript(srJobs().lane, "Check the commit and the runner");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `git() { echo "$HEAD"; }\n${guard}`], { encoding: "utf8", env: sandboxEnv({ REPO: "o/r", SPECS: "all", ...env, PROJECT: "voiceover" }) });
    assert.equal(result.status === 0, ok, result.stdout + result.stderr);
    if (!ok) assert.match(result.stdout, /::error::/);
  });
}

test("the screen-reader lane's guard stops a pull request from a fork", () => {
  const guard = stepScript(srJobs().lane, "Check the commit and the runner");
  const env = { SOURCE_SHA: sha, EVENT: "pull_request", HEAD_REPO: "someone/fork", DISPATCHED_SHA: "c".repeat(40), RUNNER_KIND: "github-hosted", HEAD: sha };
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `git() { echo "$HEAD"; }\n${guard}`], { encoding: "utf8", env: sandboxEnv({ REPO: "o/r", SPECS: "all", ...env, PROJECT: "voiceover" }) });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /::error::A pull request from a fork \(someone\/fork\) never runs the screen-reader lane\./);
});

test("the screen-reader lane sets up Guidepup in two phases, setup --ci then install, through the bin its package declares", () => {
  const lane = srJobs().lane;
  const order = ["- run: pnpm i --frozen-lockfile", "- run: pnpm exec playwright install --with-deps webkit chromium", "name: Find Guidepup's setup command", 'run: pnpm exec "$GUIDEPUP" setup --ci', 'run: pnpm exec "$GUIDEPUP" install', 'pnpm test:sr "${specs[@]}" --project "$PROJECT"', "node scripts/sr-classify.mjs"];
  const at = order.map((line) => lane.indexOf(line));
  assert.ok(at.every((index) => index > 0), order.filter((_, index) => at[index] <= 0).join(", "));
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in this order");
  assert.match(lane, /readFileSync\("node_modules\/@guidepup\/setup\/package\.json", "utf8"\)\)\.bin\)\[0\]/);
  const setup = JSON.parse(readFileSync(join(root, "node_modules/@guidepup/setup/package.json"), "utf8"));
  assert.deepEqual(Object.keys(setup.bin), ["guidepup"]);
  // The classification runs whatever failed before it, except the guard, and fails the job unless the lane passed.
  assert.match(lane, /^ {8}if: always\(\) && steps\.guard\.outcome == 'success'$/m);
});

test("the screen-reader lane annotates every failed verdict but an accessibility finding title=infra, so main's auto-revert reverts only for a finding about the components", () => {
  const classify = stepScript(srJobs().lane, "Classify the result");
  for (const [name, log, exit, annotated] of [
    ["an accessibility finding", `  ✘  1 [voiceover] › registry/ouro/e2e/screen-reader/button.sr.spec.ts:8:1 › Button\n    Error: [sr] no utterance matched /save/i; heard: "Close, button"\n  1 failed`, "1", false],
    ["an infrastructure failure", `  ✘  1 [voiceover] › registry/ouro/e2e/screen-reader/button.sr.spec.ts:8:1 › Button\n    Error: VoiceOver cannot be started\n  1 failed`, "1", true],
    ["a harness failure", "Error: No tests found", "1", true],
    ["a run with no log", "", "", true],
    ["a pass", `  ✓  1 [voiceover] › registry/ouro/e2e/screen-reader/button.sr.spec.ts:8:1 › Button (4.0s)\n  1 passed`, "0", false],
  ]) {
    const temp = scratchDir("ouro-sr-classify-");
    try {
      writeFileSync(join(temp, "sr.log"), log);
      const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", classify], { cwd: root, encoding: "utf8", env: sandboxEnv({ RUNNER_TEMP: temp, EXIT: exit }) });
      assert.equal(result.status === 0, exit === "0", `${name}: ${result.stdout}${result.stderr}`);
      assert.equal(/^::error title=infra::Screen-reader lane: /m.test(result.stdout), annotated, `${name}: ${result.stdout}`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});

test("the screen-reader lane tries Guidepup's OS setup once more when it fails, with a warning naming why (#2396)", () => {
  const lane = srJobs().lane;
  assert.match(lane, /^ {6}- id: os\n {8}name: Set up the OS for screen reader automation\n {8}continue-on-error: true\n/m);
  assert.match(lane, /^ {6}- name: Guidepup's OS setup failed; trying it once more \(#2396\)\n {8}if: steps\.os\.outcome == 'failure'\n {8}run: echo "::warning title=Guidepup setup failed::/m);
  assert.match(lane, /^ {6}- if: steps\.os\.outcome == 'failure'\n {8}env:\n {10}GUIDEPUP: \$\{\{ steps\.guidepup\.outputs\.bin \}\}\n {8}run: pnpm exec "\$GUIDEPUP" setup --ci$/m);
  assert.equal(lane.split('run: pnpm exec "$GUIDEPUP" setup --ci').length - 1, 2, "one try and one retry, no more");
});

test("the lane runs the specs its input names before --project, or every spec when there are none, within its own hour", () => {
  const lane = srJobs().lane;
  assert.match(lane, /^ {6}SPECS: \$\{\{ inputs\.specs \|\| 'all' \}\}$/m);
  assert.match(lane, /if \[ "\$SPECS" != all \]; then read -r -a specs <<< "\$SPECS"; fi\n/);
  // A pull request's call and its dispatch and push share one limit: the budget job reads it from here for the called lane.
  assert.match(lane, /^ {4}timeout-minutes: 60$/m);
});

test("release names only screen-reader.yml's push runs, which a pull request's call never is, and Release auto waits for none", () => {
  assert.match(workflow("release.yml"), /gh run list --workflow screen-reader\.yml --commit "\$sha" --event push/);
  assert.doesNotMatch(workflow("release-auto.yml"), /screen-reader\.yml|Screen reader/);
});

test("the screen-reader lane runs after the tag, and a commit that breaks it twice is reverted through a pull request that merges on green", () => {
  const text = workflow("screen-reader-revert.yml");
  const on = text.split("\non:\n")[1].split(/\n(?=\S)/)[0];
  assert.match(on, /^ {2}workflow_run:\n {4}workflows: \[Screen reader\]\n {4}types: \[completed\]\n {4}branches: \[main\]$/m);
  assert.doesNotMatch(on, /pull_request|workflow_dispatch|schedule/);
  assert.match(text, /^permissions: \{\}$/m);
  assert.match(text, /if: github\.event\.workflow_run\.event == 'push' && github\.event\.workflow_run\.conclusion == 'failure' && github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.doesNotMatch(text, /actions\/checkout/, "it runs no code from the repository");
  const decide = stepScript(text, "Did this commit break the lane?");
  assert.ok(decide.indexOf("SR_CLASS=infrastructure") < decide.indexOf("gh run rerun"), "infrastructure reverts nothing, before any rerun");
  assert.match(decide, /if \[ "\$ATTEMPT" = 1 \]; then\n\s+gh run rerun "\$RUN_ID" --failed\n/, "a first failure reruns the failed jobs once");
  assert.match(decide, /gh run list --workflow screen-reader\.yml --commit "\$parent" --event push/, "only the first red commit is reverted");
  assert.match(decide, /--label red-main-fix --search "Revert in:title #\$pr"/, "one open revert is enough");
  const revert = stepScript(text, "Revert the pull request, and merge the revert on green");
  assert.match(revert, /revertPullRequest\(input: \{ pullRequestId: \$id, body: \$body \}\)/);
  assert.match(revert, /gh pr edit "\$revert" --add-label red-main-fix\n/);
  assert.match(revert, /gh pr merge "\$revert" --auto --squash\n/);
  assert.doesNotMatch(text, /@(?![0-9a-f]{40}\b)[a-z]|--reviewer|--assignee|gh pr comment|gh issue comment/i, "it mentions and asks no one (an action pinned by its commit hash is not a mention)");
  assert.match(text, /GH_TOKEN: \$\{\{ steps\.app\.outputs\.token \}\}/, "the Ouro Current app opens the revert, so its checks run");
});

test("the screen-reader packages are pinned exactly, and test:sr runs its own config", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const name of ["@guidepup/guidepup", "@guidepup/playwright", "@guidepup/setup"]) assert.match(pkg.devDependencies[name] ?? "", /^\d+\.\d+\.\d+$/, name);
  assert.equal(pkg.scripts["test:sr"], "playwright test --config playwright.screen-reader.config.ts");
  assert.ok(scriptTestFiles().includes("scripts/sr-classify.test.mjs"));
});

test("the site's end-to-end specs run against the build served as GitHub Pages serves it, over HTTP/2 and TLS", async () => {
  const main = (await import("../playwright.config.ts")).default;
  const site = main.projects.filter((project) => project.name.startsWith("site-"));
  assert.deepEqual(site.map((project) => project.name), ["site-chromium", "site-webkit"]);
  for (const project of site) {
    assert.equal(project.use.baseURL, "https://127.0.0.1:4179/", project.name);
    assert.equal(project.use.ignoreHTTPSErrors, true, project.name);
  }
  const server = main.webServer.find((entry) => entry.url === "https://127.0.0.1:4179/");
  assert.equal(server.command, "pnpm site:build && node site/scripts/serve-pages.mjs 4179");
  assert.equal(server.ignoreHTTPSErrors, true);
  assert.match(readFileSync(join(root, "site/scripts/serve-pages.mjs"), "utf8"), /createSecureServer\(/);
  // Each site browser opens the voyage pages once before any spec (site/e2e/warm-up.ts).
  assert.equal(main.globalSetup, "./site/e2e/warm-up.ts");
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

/** release.yml's jobs, by name, each the text of its block. */
const releaseJobs = () =>
  Object.fromEntries(
    workflow("release.yml")
      .split("\njobs:\n")[1]
      .split(/\n(?= {2}[\w-]+:\n)/)
      .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
  );

/** The scopes a job block asks for, as `{ scope: level }`. */
const permissionsOf = (block) => {
  const lines = (block.split(/^ {4}permissions:\n/m)[1] ?? "").split("\n");
  const own = lines.slice(0, lines.findIndex((line) => !/^ {6}[\w-]+: \w+/.test(line)));
  return Object.fromEntries(own.map((line) => line.trim().match(/^([\w-]+): (\w+)/).slice(1)));
};

test("a release gives each job its own permissions, and none may write commit statuses or pull requests", () => {
  const release = workflow("release.yml");
  assert.match(release, /^permissions: \{\}$/m);
  const jobs = releaseJobs();
  assert.deepEqual(Object.keys(jobs), ["release", "pages", "publish", "finish", "next", "docs-pin", "attest"]);
  const permissions = permissionsOf;
  // It reads main's CI runs and the pull request merged as the commit, whose run may prove its tree (scripts/ci-proof.mjs).
  assert.deepEqual(permissions(jobs.release), { contents: "write", actions: "read", "pull-requests": "read" });
  assert.deepEqual(permissions(jobs.pages), { actions: "write" });
  assert.deepEqual(permissions(jobs.publish), {});
  assert.deepEqual(permissions(jobs.finish), { contents: "read", issues: "write" });
  assert.deepEqual(permissions(jobs.next), { actions: "write" });
  assert.deepEqual(permissions(jobs["docs-pin"]), { actions: "write" });
  // It attaches the tag's registry.json to the release and signs an attestation for it.
  assert.deepEqual(permissions(jobs.attest), { contents: "write", "id-token": "write", attestations: "write" });
  for (const block of Object.values(jobs)) assert.doesNotMatch(block, /statuses: write|pull-requests: write/);
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
      env: sandboxEnv({ OPEN: open, GH_REPO: "o/r" }, [bin]),
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

test("the workflows beside CI cancel only a pull request's superseded run: never a merge-queue, main or dispatched run", () => {
  const blocks = {
    "apple-release.yml": "  group: apple-release-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "conformance-exemptions.yml": "  group: conformance-exemptions-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}",
    "form-answer-proof.yml": "  group: form-answer-proof-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "flow-review.yml": "  group: flow-review-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "required-checks.yml": "  group: required-checks-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "main-green.yml": "  group: main-green-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}",
    "release-note.yml": "  group: release-note-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}",
    "stale-pages.yml": "  group: stale-pages-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "ax-xray.yml": "  group: ax-xray-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "first-run-windows.yml": "  group: first-run-windows-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "incumbent.yml": "  group: incumbent-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "first-run-sso.yml": "  group: first-run-sso-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
    "chromium-floor-smoke.yml": "  group: chromium-floor-smoke-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}",
  };
  for (const { file, text } of workflows) {
    const on = text.split(/^on:\n/m)[1].split(/\n(?=\S)/)[0];
    const events = [...on.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]);
    // A push to a pull request cancels the run it replaces, in every workflow a pull request starts.
    if (events.includes("pull_request")) assert.match(text, /^concurrency:$/m, `${file} runs on pull requests but cancels no superseded run`);
    if (file === "ci.yml" || !/^concurrency:$/m.test(text)) continue;
    const block = text.split(/^concurrency:\n/m)[1].split(/\n(?=\S)/)[0];
    assert.doesNotMatch(text.split(/^jobs:\n/m)[1], /^\s+concurrency:/m, `${file}: no job has a group of its own`);
    if (!events.includes("pull_request")) {
      assert.match(block, /^ {2}cancel-in-progress: false$/m, `${file} runs on no pull request, so it cancels nothing`);
    } else if (events.length > 1) {
      // A third run in a group replaces the one waiting there, cancel or not, so every run but a pull request's has its own group.
      assert.equal(block, [blocks[file], "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}"].join("\n"), file);
    } else {
      assert.match(block, /^ {2}group: [\w-]+\$\{\{ github\.event\.pull_request\.number \}\}\n {2}cancel-in-progress: true$/, file);
    }
  }
});

/** A workflow expression's value, `${{ … }}` and all, in a context: GitHub's operators are JavaScript's here. */
const evaluate = (expression, context) => {
  const inner = expression.match(/^\$\{\{ (.+) \}\}$/)?.[1];
  if (inner === undefined) return expression;
  return runInNewContext(inner.replace(/([!=])=/g, "$1=="), context, { timeout: 100 });
};
/** A workflow's top-level concurrency group and cancel-in-progress, evaluated for an event. */
const concurrencyFor = (text, github) => {
  const block = text.split(/^concurrency:\n/m)[1].split(/\n(?=\S)/)[0];
  const group = block.match(/^ {2}group: (.+)$/m)[1].replace(/\$\{\{ (.+?) \}\}/g, (whole) => String(evaluate(whole, { github })));
  return { group, cancel: String(evaluate(block.match(/^ {2}cancel-in-progress: (.+)$/m)[1], { github })) };
};
const pullRequest = (number, run) => ({ event_name: "pull_request", ref: `refs/pull/${number}/merge`, run_id: run, event: { pull_request: { number } } });

test("every workflow a pull request starts cancels that pull request's superseded run of it, and only that: its group is per pull request and per workflow", () => {
  const prWorkflows = workflows.filter(({ text }) => /^ {2}pull_request:/m.test(text.split(/^on:\n/m)[1].split(/\n(?=\S)/)[0]));
  assert.ok(["ci.yml", "claims.yml", "conformance-exemptions.yml", "form-answer-proof.yml"].every((file) => prWorkflows.some((workflow) => workflow.file === file)));
  const groups = new Map();
  for (const { file, text } of prWorkflows) {
    assert.match(text, /^concurrency:$/m, `${file} runs on pull requests but cancels no superseded run`);
    const first = concurrencyFor(text, pullRequest(12, 1));
    // A new push to the same pull request lands in the same group, and cancels the run there.
    assert.deepEqual(concurrencyFor(text, pullRequest(12, 2)), first, `${file}: a pull request's next run shares its group`);
    assert.equal(first.cancel, "true", `${file} cancels a pull request's superseded run`);
    // Another pull request's run is never in it.
    assert.notEqual(concurrencyFor(text, pullRequest(13, 3)).group, first.group, `${file}: two pull requests share a group`);
    // Nor is another workflow's run: a group shared across workflows would cancel one with the other.
    assert.ok(!groups.has(first.group), `${file} shares its group with ${groups.get(first.group)}`);
    groups.set(first.group, file);
    // A merge-queue entry, a push to main, a dispatch or a schedule is never cancelled, and never waits in another run's group.
    const events = [...text.split(/^on:\n/m)[1].split(/\n(?=\S)/)[0].matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]).filter((event) => event !== "pull_request");
    for (const event_name of events) {
      const github = (run) => ({ event_name, ref: event_name === "merge_group" ? "refs/heads/gh-readonly-queue/main/pr-12-abc" : "refs/heads/main", run_id: run, event: {} });
      const one = concurrencyFor(text, github(1));
      assert.equal(one.cancel, "false", `${file}: a ${event_name} run is never cancelled`);
      assert.notEqual(concurrencyFor(text, github(2)).group, one.group, `${file}: two ${event_name} runs share a group`);
    }
  }
});

test("a pull request that changes nothing the browser tests read skips the browser shards, and the checks that read them still pass", () => {
  const jobs = ciJobs();
  assert.match(jobs.plan, /^ {6}browser: \$\{\{ steps\.browser\.outputs\.run \}\}$/m);
  const decide = stepScript(jobs.plan, "Can the change reach the browser shards?");
  const pr = { EVENT: "pull_request", REF: "refs/pull/12/merge", HEAD_REF: "fix", BASE_REF: "main" };
  const asked = runStep(decide, pr);
  assert.match(asked.calls, /^CALL node scripts\/ci-relevance\.mjs browser HEAD\^1 HEAD$/m);
  // The stand-in node writes nothing: the decision is the script's. When it fails, the shards run.
  assert.deepEqual(runStep(decide, pr, { nodeStatus: 1 }).output, { run: "true" });
  for (const env of [{ EVENT: "merge_group", REF: "refs/heads/gh-readonly-queue/main/pr-12-abc" }, { EVENT: "push", REF: "refs/heads/main" }, { EVENT: "workflow_dispatch", REF: "refs/heads/release/v1.0.0" }, { ...pr, HEAD_REF: "release/v1.0.0" }, { ...pr, BASE_REF: "next" }]) {
    const result = runStep(decide, env);
    assert.doesNotMatch(result.calls, /ci-relevance/, JSON.stringify(env));
    assert.deepEqual(result.output, { run: "true" }, JSON.stringify(env));
  }
  // The shards skip only on browser=false: a plan that failed or never ran leaves it empty, and they run.
  const runs = (browser) => runInNewContext(browserRuns.slice(4, -3).replace("!cancelled()", "true").replace("needs.plan.outputs.tested", "''").replace("needs.plan.outputs.browser", "value"), { value: browser });
  assert.deepEqual(["", "true", "false"].map(runs), [true, true, false]);
  assert.equal(jobs.browser.match(/^ {4}if: (.+)$/m)?.[1], browserRuns);
  // The coverage job passes with nothing measured only when the plan skipped them and they did skip.
  assert.match(jobs.coverage, /^ {6}BROWSER_RUN: \$\{\{ needs\.plan\.outputs\.browser != 'false' \}\}$/m);
  assert.match(jobs.coverage, /^ {6}ran: \$\{\{ steps\.shards\.outputs\.ran \}\}$/m);
  const passed = stepScript(jobs.coverage, "Every browser shard passed");
  assert.deepEqual(runStep(passed, { BROWSER_RUN: "false", BROWSER: "skipped" }).output, { ran: "false" });
  assert.equal(runStep(passed, { BROWSER_RUN: "false", BROWSER: "skipped" }).status, 0);
  assert.deepEqual(runStep(passed, { BROWSER_RUN: "true", BROWSER: "success" }).output, { ran: "true" });
  for (const [run, result] of [["true", "skipped"], ["false", "success"], ["false", "failure"]]) assert.equal(runStep(passed, { BROWSER_RUN: run, BROWSER: result }).status, 1, `${run} ${result}`);
  // Every other coverage step waits for shards that ran.
  const steps = jobs.coverage.slice(jobs.coverage.indexOf("    steps:")).split(/\n {6}- /).slice(2);
  for (const step of steps) assert.match(step, /^(id: \w+\n {8})?if: env\.BROWSER_RUN == 'true'( && steps\.tests\.outputs\.fallback != 'true')?$/m, step);
  // The ci check counts a skip as a pass only when the plan asked for it.
  assert.match(jobs.ci, /^ {6}browser: \$\{\{ needs\.plan\.outputs\.browser != 'false' \}\}$/m);
  assert.match(jobs.ci, /^ {6}BROWSER_RUN: \$\{\{ needs\.plan\.outputs\.browser != 'false' \}\}$/m);
  const parts = stepScript(jobs.ci, "Every part passed");
  const ok = { CHECKS: "success", ATTRIBUTION: "success", DESIGN: "success", BROWSER: "skipped", SUBSETS: "skipped", SCRIPTS: "success", SCRIPTS_BROWSER: "success", CHECK_NODE: "success", CHECK_NODE_MERGE: "success", COVERAGE: "success", BROWSER_FALLBACK: "skipped", SCREEN_READER: "skipped", SCREEN_READER_RUN: "false", FALLBACK: "" };
  assert.equal(runStep(parts, { ...ok, BROWSER_RUN: "false" }).status, 0);
  assert.equal(runStep(parts, { ...ok, BROWSER_RUN: "true" }).status, 1);
  assert.equal(runStep(parts, { ...ok, BROWSER_RUN: "false", BROWSER: "failure" }).status, 1);
  assert.equal(runStep(parts, { ...ok, BROWSER_RUN: "false", COVERAGE: "failure" }).status, 1);
});

test("Screens checks main's screens daily and on demand, never a pull request's: CI's design shards gate a pull request", () => {
  const { text } = workflows.find(({ file }) => file === "screens.yml");
  const jobs = Object.fromEntries(text.split(/^jobs:\n/m)[1].split(/\n(?= {2}[\w-]+:\n)/).map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]));
  assert.deepEqual(Object.keys(jobs), ["screens-shard", "screens"]);
  // A pull request starts none of its runners: no pull_request or push trigger, only the daily run and a dispatch.
  assert.match(text, /^on:\n {2}schedule:\n {4}- cron: "[^"]+"\n {2}workflow_dispatch:\npermissions:/m);
  assert.doesNotMatch(text.split(/^permissions:/m)[0], /^ {2}(pull_request|pull_request_target|push|merge_group):/m);
  assert.match(jobs.screens, /^ {4}needs: \[screens-shard\]\n {4}if: \$\{\{ !cancelled\(\) \}\}$/m);
  // It reports and never fails: the gate is CI's design shards, which run on a pull request the site can reach.
  for (const job of Object.values(jobs)) assert.match(job, /^ {8}continue-on-error: true$/m);
  assert.match(ciJobs().design, /^ {4}if: .*needs\.plan\.outputs\.design != 'false'/m);
  // This workflow and the check it runs are among what the design shards' relevance reads.
  assert.equal(relevance("screens", [".github/workflows/screens.yml"]).run, true);
  assert.equal(relevance("screens", [".github/actions/check/action.yml"]).run, true);
});

test("CI's plan prints the repository's queued runs in its summary, and an API that does not answer stops nothing", () => {
  const script = stepScript(ciJobs().plan, "Queued runs");
  const dir = scratchDir("ouro-queued-");
  const summary = (ghStatus) => {
    const file = join(dir, `summary-${ghStatus}.md`);
    writeFileSync(file, "");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `gh() { echo "$*" > "${dir}/call"; [ "$GH_STATUS" = 0 ] || return "$GH_STATUS"; echo 39; }\n${script}`], {
      encoding: "utf8",
      env: sandboxEnv({ GH_STATUS: String(ghStatus), GITHUB_STEP_SUMMARY: file, REPO: "o/r" }),
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(file, "utf8");
  };
  assert.equal(summary(0), "**Queued runs** in o/r as this run planned: 39\n");
  assert.equal(readFileSync(join(dir, "call"), "utf8"), "api repos/o/r/actions/runs?status=queued&per_page=1 --jq .total_count\n");
  assert.equal(summary(1), "**Queued runs** in o/r as this run planned: unknown (the API did not answer)\n");
});

test("the conformance exemptions check runs on each pull request and its description's edits, and passes in the merge queue without checking", () => {
  const { text } = workflows.find(({ file }) => file === "conformance-exemptions.yml");
  assert.match(text, /^on:\n {2}pull_request:\n {4}types: \[opened, edited, synchronize, reopened\]\n {2}merge_group:\n(?: {2}#.*\n)? {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/m);
  assert.match(text, /^ {4}name: conformance exemptions$/m);
  const steps = text.slice(text.indexOf("    steps:")).split(/\n {6}- /).slice(1);
  const queue = steps.filter((step) => /^if: github\.event_name == 'merge_group'$/m.test(step));
  assert.equal(queue.length, 1);
  assert.doesNotMatch(queue[0], /uses:|node |pnpm /);
  // A dispatched run (Release's, on a pull request or queue entry GITHUB_TOKEN made) checks too, against main.
  for (const step of steps.filter((step) => !queue.includes(step))) assert.match(step, /^if: github\.event_name != 'merge_group'$/m, step);
  assert.match(text, /^ {10}BASE_REF: \$\{\{ github\.base_ref \|\| 'main' \}\}$/m);
  assert.match(text, /BASE_REF="origin\/\$BASE_REF" node scripts\/conformance-exemptions\.mjs/);
});

test("the release note check runs on each pull request and its description's edits, reads the description from the environment only, and installs nothing", () => {
  const { text } = workflows.find(({ file }) => file === "release-note.yml");
  assert.match(text, /^on:\n {2}pull_request:\n {4}types: \[opened, edited, synchronize, reopened\]\n {2}merge_group:\n(?: {2}#.*\n)? {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/m);
  assert.match(text, /^ {4}name: release note$/m);
  assert.match(text, /^ {10}PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}$/m);
  assert.equal(text.match(/pull_request\.body/g).length, 1);
  assert.doesNotMatch(text, /pnpm/);
  assert.match(text, /BASE_REF="origin\/\$BASE_REF" node scripts\/release-note\.mjs/);
});

test("CI rehearses the release commit on every run: release.yml's own edits, for a version with no tag yet, then the checks and the site build that read them", () => {
  // release.yml writes the release commit with the same script the rehearsal runs.
  const release = workflow("release.yml");
  const push = release.slice(release.indexOf("name: Push the release branch"));
  const pushStep = push.split(/\n {6}- /)[0];
  assert.match(pushStep, /^ {10}scripts\/release-commit\.sh "\$VERSION"$/m);
  assert.doesNotMatch(pushStep, /^ +node scripts\/(registry\.mts --release|latest-release\.mjs set)/m);
  const script = readFileSync(join(root, "scripts/release-commit.sh"), "utf8");
  for (const line of ['node scripts/latest-release.mjs set "v$version"', "pnpm run docs", 'node scripts/registry.mts --release "$version"', '  node scripts/changes.mjs assemble changes --since "$last" > CHANGES.md']) assert.ok(script.includes(`\n${line}\n`), line);
  // The rehearsal, in the checks job (part of the required ci check), after everything else there.
  const block = ciJobs().checks;
  const step = stepScript(block, "Release rehearsal");
  assert.ok(block.indexOf("name: Release rehearsal") > block.indexOf("pnpm build-storybook"));
  const run = (tagExists) => {
    const stubs = `pnpm() { printf 'CALL pnpm %s (%s, base %s)\\n' "$*" "$GITHUB_REF" "$GITHUB_BASE_REF"; }\nscripts/release-commit.sh() { printf 'CALL release-commit %s\\n' "$*"; }\ngit() { return ${tagExists ? 0 : 1}; }`;
    // As on a pull request into main, where registry --check fails a pinned registry.json.
    return spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${stubs}\n${step}`], { cwd: root, encoding: "utf8", env: sandboxEnv({ GITHUB_REF: "refs/pull/9/merge", GITHUB_BASE_REF: "main" }) });
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

test("every quarantined test names its test (project, file and title), an issue and an owner, and its file has that test", () => {
  const entries = JSON.parse(readFileSync(quarantineFile, "utf8"));
  assert.deepEqual(entryProblems(entries), []);
  for (const entry of entries) {
    assert.ok(existsSync(join(root, entry.file)), `${entry.file} does not exist`);
    assert.ok(readFileSync(join(root, entry.file), "utf8").includes(entry.title.split(" > ").at(-1)), `${entry.file} has no test "${entry.title}"`);
  }
  // Each part is required.
  const whole = { project: "ouro-webkit", file: "registry/ouro/components/ouro/calendar/calendar.test.tsx", title: "Calendar > range > previews", issue: "https://github.com/ourostack/ouro-ui/issues/1", owner: "someone" };
  assert.deepEqual(entryProblems([whole]), []);
  for (const key of ["project", "file", "title", "issue", "owner"]) {
    const without = { ...whole };
    delete without[key];
    assert.equal(entryProblems([without]).length, 1, key);
    assert.equal(entryProblems([{ ...whole, [key]: " " }]).length, 1, key);
  }
  assert.match(entryProblems([{ ...whole, issue: "#351" }])[0], /no issue URL/);
  assert.deepEqual(entryProblems({}), ["the quarantine must be a JSON array of entries"]);
});

// A job's log as `gh run view --job <id> --log` prints it (job, step, timestamp), from the two
// failures of the v1.2.15 rehearsals: CI runs 41270773113 (install (shadcn@latest, nova)) and
// 41256825697 (browser (5/6), with the ci gate after it).
const logLines = (job, lines) => lines.map((line) => `${job}\tUNKNOWN STEP\t2026-11-01T04:01:29.8723458Z ${line}`).join("\n");
const calendarTitle = "Calendar > range > picks a start and an end, in either order, and previews the range in between";
const calendarLog = logLines("install (shadcn@latest, nova)", [
  "\x1b[31m❯\x1b[39m  ouro-webkit (webkit)  src/components/ouro/calendar/calendar.test.tsx (38 tests | 1 failed) 7350ms",
  "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
  ` FAIL   ouro-webkit (webkit)  src/components/ouro/calendar/calendar.test.tsx > ${calendarTitle}`,
  "AssertionError: expected false to be true // Object.is equality",
  " Test Files  1 failed | 372 passed (373)",
  "      Tests  1 failed | 9828 passed | 1 expected fail | 29 skipped (9859)",
  "##[error]Process completed with exit code 1.",
]);
const diveTitle = "pressing Dive > ends early on a click, which reaches nothing under the water, or on the button under it";
const diveLog = logLines("browser (5/22)", [
  ` FAIL   site (chromium)  site/src/voyage/dive/dive.test.tsx > ${diveTitle}`,
  " Test Files  1 failed | 75 passed (76)",
  "      Tests  1 failed | 3284 passed | 4 skipped (3289)",
  "##[error]TimeoutError: locator.click: Timeout 12185ms exceeded.",
]);
const calendarEntry = { project: "ouro-webkit", file: "registry/ouro/components/ouro/calendar/calendar.test.tsx", title: calendarTitle, issue: "https://github.com/ourostack/ouro-ui/issues/351", owner: "arimendelow", open: true };
const diveEntry = { project: "site", file: "site/src/voyage/dive/dive.test.tsx", title: diveTitle, issue: "https://github.com/ourostack/ouro-ui/issues/2", owner: "someone", open: true };

test("the quarantine reads a job's failed Vitest tests from its log, and anything else that failed", () => {
  assert.deepEqual(failedTests(calendarLog), { tests: [{ project: "ouro-webkit", file: "src/components/ouro/calendar/calendar.test.tsx", title: calendarTitle }], failed: 1, unexplained: [] });
  assert.deepEqual(failedTests(diveLog).tests, [{ project: "site", file: "site/src/voyage/dive/dive.test.tsx", title: diveTitle }]);
  // gh's escaped colours too.
  assert.equal(failedTests(calendarLog.replaceAll("\x1b[", "^[[")).tests.length, 1);
  // A file that did not load, or an unhandled error, names no test.
  assert.deepEqual(failedTests(logLines("j", [" FAIL   site (chromium)  site/src/a.test.tsx [ site/src/a.test.tsx ]"])).unexplained, ["FAIL   site (chromium)  site/src/a.test.tsx [ site/src/a.test.tsx ]"]);
  assert.equal(failedTests(logLines("j", ["      Errors  1 error"])).unexplained.length, 1);
  assert.deepEqual(failedTests(logLines("j", ["Type error: nothing failed in a test"])), { tests: [], failed: 0, unexplained: [] });
  // The installed copy of a registry test is the same test; another project, file or title is not.
  const installed = failedTests(calendarLog).tests[0];
  assert.ok(names(calendarEntry, installed));
  assert.ok(names(calendarEntry, { ...installed, file: calendarEntry.file }));
  assert.ok(!names(calendarEntry, { ...installed, project: "ouro-chromium" }));
  assert.ok(!names(calendarEntry, { ...installed, file: "src/components/ouro/calendar/other.test.tsx" }));
  assert.ok(!names(calendarEntry, { ...installed, title: "Calendar > range > something else" }));
});

test("Release and its rehearsal retry once only a failure of quarantined tests with open issues, and any other failure stops them", () => {
  const ciYml = workflow("ci.yml");
  // The name GitHub gave install-latest's unnamed test step in run 41270773113.
  const latestStep = 'Run SHADCN_VERSION=latest scripts/install-test.sh shadcn "$RUNNER_TEMP/latest" b478a3226bf42656ed903307714b9f1d4280e26a';
  const contexts = ["ci", "motion-coverage", "install (shadcn, nova)", "install (shadcn@latest, nova)"];
  const job = (id, name, conclusion, extra = {}) => ({ id, name, conclusion, url: `https://github.com/o/r/actions/runs/5/job/${id}`, failedSteps: [], ...extra });
  const green = [job(1, "ci", "success"), job(2, "install (shadcn, nova)", "success"), job(3, "install (shadcn@latest, nova)", "success"), job(4, "browser (5/22)", "success"), job(5, "motion-coverage", "success")];
  const runWith = (jobs, attempt = 1) => [{ id: "5", attempt, workflow: ciYml, jobs: green.filter((base) => !jobs.some((other) => other.name === base.name)).concat(jobs) }];
  const calendar = job(3, "install (shadcn@latest, nova)", "failure", { failedSteps: [latestStep], log: calendarLog });
  const dive = [job(4, "browser (5/22)", "failure", { failedSteps: ["Browser tests"], log: diveLog }), job(1, "ci", "failure", { failedSteps: ["Every part passed"], log: logLines("ci", ["##[error]The browser jobs did not pass (failure): see them above this run's ci check."]) }), job(5, "motion-coverage", "skipped")];

  // Tonight's Calendar failure, quarantined: retried once, recorded with its issue and owner.
  const plan = retryPlan({ runs: runWith([calendar]), contexts, entries: [calendarEntry] });
  assert.equal(plan.retry, true, plan.problems.join("; "));
  assert.equal(plan.retried.length, 1);
  assert.equal(
    record(plan.retried[0], "https://github.com/o/r/actions/runs/9"),
    `Retried once, as quarantined: ouro-webkit src/components/ouro/calendar/calendar.test.tsx > ${calendarTitle} failed in install (shadcn@latest, nova) (https://github.com/o/r/actions/runs/5/job/3). Issue https://github.com/ourostack/ouro-ui/issues/351, owner @arimendelow. By https://github.com/o/r/actions/runs/9.`,
  );
  // A test that is not listed fails at once: tonight's Dive failure (fixed by #338, so not listed).
  const unlisted = retryPlan({ runs: runWith(dive), contexts, entries: [calendarEntry] });
  assert.equal(unlisted.retry, false);
  assert.match(unlisted.problems.join("\n"), /site site\/src\/voyage\/dive\/dive\.test\.tsx > pressing Dive > .* is not quarantined/);
  // Listed, it would be retried through the ci gate, whose failing step only read browser's result,
  // and motion-coverage, skipped because ci, which it needs, failed.
  const listed = retryPlan({ runs: runWith(dive), contexts, entries: [diveEntry] });
  assert.equal(listed.retry, true, listed.problems.join("; "));
  assert.equal(listed.retried.length, 1);
  // Skipped with nothing it needs failed is not retried.
  assert.equal(retryPlan({ runs: runWith([calendar, job(5, "motion-coverage", "skipped")]), contexts, entries: [calendarEntry] }).retry, false);
  // The gate failing a step of its own (merged coverage), not reading a result, is not retried.
  const coverage = [dive[0], { ...dive[1], failedSteps: ["Coverage of installed subsets"] }, dive[2]];
  assert.equal(retryPlan({ runs: runWith(coverage), contexts, entries: [diveEntry] }).retry, false);
  // The listed test's job must have failed in its test step alone: not also in another step, and
  // not in a step that runs no tests.
  const twoSteps = retryPlan({ runs: runWith([{ ...calendar, failedSteps: [latestStep, "Upload the report"] }]), contexts, entries: [calendarEntry] });
  assert.equal(twoSteps.retry, false);
  assert.match(twoSteps.problems.join("\n"), /failed in 2 steps \(.*\), not in its test step alone/);
  const setup = retryPlan({ runs: runWith([{ ...calendar, failedSteps: ["Run pnpm i --frozen-lockfile"] }]), contexts, entries: [calendarEntry] });
  assert.equal(setup.retry, false);
  assert.match(setup.problems.join("\n"), /failed in "Run pnpm i --frozen-lockfile", which is not a step that runs the tests/);
  assert.equal(retryPlan({ runs: runWith([{ ...dive[0], failedSteps: ["Browser tests", "Coverage of installed subsets"] }, dive[1], dive[2]]), contexts, entries: [diveEntry] }).retry, false);
  // A gate that read a skipped job failed on that, which no test explains.
  const skippedShard = retryPlan({ runs: runWith([...dive, job(6, "browser (6/22)", "skipped")]), contexts, entries: [diveEntry] });
  assert.equal(skippedShard.retry, false);
  assert.match(skippedShard.problems.join("\n"), /ci \(run 5\) read browser \(6\/22\), which was skipped/);
  // A quarantined failure beside any other failure: not retried.
  assert.equal(retryPlan({ runs: runWith([calendar, ...dive]), contexts, entries: [calendarEntry] }).retry, false);
  const build = job(2, "install (shadcn, nova)", "failure", { failedSteps: ["Every shard passed"], log: "" });
  assert.equal(retryPlan({ runs: runWith([calendar, build]), contexts, entries: [calendarEntry] }).retry, false);
  // A listed test whose issue is closed is no longer quarantined.
  assert.equal(retryPlan({ runs: runWith([calendar]), contexts, entries: [{ ...calendarEntry, open: false }] }).retry, false);
  // A listed test that fails twice still fails: the run's second attempt is never retried.
  const twice = retryPlan({ runs: runWith([calendar], 2), contexts, entries: [calendarEntry] });
  assert.equal(twice.retry, false);
  assert.match(twice.problems.join("\n"), /already on attempt 2: a quarantined test is retried only once/);
  // The log must account for every failed test it reports, and the job must have failed, not timed out.
  const more = { ...calendar, log: calendarLog.replace("Tests  1 failed", "Tests  2 failed") };
  assert.equal(retryPlan({ runs: runWith([more]), contexts, entries: [calendarEntry] }).retry, false);
  assert.equal(retryPlan({ runs: runWith([{ ...calendar, conclusion: "timed_out" }]), contexts, entries: [calendarEntry] }).retry, false);
  // Nothing failing, nothing to retry.
  assert.equal(retryPlan({ runs: runWith([]), contexts, entries: [calendarEntry] }).retry, false);
  // A judged check missing from the runs is not retried.
  assert.equal(retryPlan({ runs: runWith([calendar]), contexts: [...contexts, "lighthouse"], entries: [calendarEntry] }).retry, false);
});

test("quarantine.mjs retry records each retry in the step summary, the log and the issue, then reruns the run's failed jobs once", () => {
  const bin = scratchDir("ouro-quarantine-");
  const calls = join(bin, "calls.log");
  const summary = join(bin, "summary.md");
  const attempts = join(bin, "attempts");
  writeFileSync(join(bin, "calendar.log"), calendarLog);
  // The Calendar test, quarantined as it was before its fix.
  const list = join(bin, "quarantine.json");
  writeFileSync(list, JSON.stringify([{ project: "ouro-webkit", file: "registry/ouro/components/ouro/calendar/calendar.test.tsx", title: calendarTitle, issue: "https://github.com/ourostack/ouro-ui/issues/351", owner: "arimendelow" }]));
  // A stand-in gh: run 5 failed install (shadcn@latest, nova) on the Calendar test, its issue is
  // $STATE, and a rerun moves the run to attempt 2.
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${calls}"\ncase "$*" in\n  *"/rules/branches/main "*) printf '%s\\n' ci ;;\n  "api repos/o/r/actions/runs/5 --jq [.run_attempt, .path] | @tsv") printf '1\\t.github/workflows/ci.yml\\n' ;;\n  "api repos/o/r/actions/runs/5 --jq .run_attempt") cat "${attempts}" ;;\n  *"/actions/runs/5/jobs"*) printf '%s\\n' '{"id":1,"name":"ci","conclusion":"success","url":"u1","failedSteps":[]}' '{"id":3,"name":"install (shadcn@latest, nova)","conclusion":"failure","url":"https://github.com/o/r/actions/runs/5/job/3","failedSteps":["Run SHADCN_VERSION=latest scripts/install-test.sh shadcn \\"$RUNNER_TEMP/latest\\" abc"]}' ;;\n  "run view --repo o/r --job 3 --log") cat "${join(bin, "calendar.log")}" ;;\n  "issue view "*) echo "$STATE" ;;\n  "issue comment "*) ;;\n  "run rerun 5 --repo o/r --failed") [ -z "$REFUSE" ] || exit 1; echo 2 > "${attempts}" ;;\n  *) exit 99 ;;\nesac\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  const retry = (state, refuse = "") => {
    writeFileSync(calls, "");
    writeFileSync(summary, "");
    writeFileSync(attempts, "1");
    return spawnSync(process.execPath, [join(root, "scripts/quarantine.mjs"), "retry", "--also", "install (shadcn@latest, nova)", "5"], {
      cwd: root,
      encoding: "utf8",
      env: sandboxEnv({ GITHUB_REPOSITORY: "o/r", GITHUB_SERVER_URL: "https://github.com", GITHUB_RUN_ID: "9", GITHUB_STEP_SUMMARY: summary, POLL_SECONDS: "0", STATE: state, REFUSE: refuse, OURO_QUARANTINE_FILE: list }, [bin]),
    });
  };
  const open = retry("OPEN");
  assert.equal(open.status, 0, open.stdout + open.stderr);
  const line = `Retried once, as quarantined: ouro-webkit src/components/ouro/calendar/calendar.test.tsx > ${calendarTitle} failed in install (shadcn@latest, nova) (https://github.com/o/r/actions/runs/5/job/3). Issue https://github.com/ourostack/ouro-ui/issues/351, owner @arimendelow. By https://github.com/o/r/actions/runs/9.`;
  assert.match(open.stdout, new RegExp(`^::warning title=Quarantined test retried::${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.equal(readFileSync(summary, "utf8"), `- ${line}\n`);
  const made = readFileSync(calls, "utf8").split("\n");
  assert.ok(made.includes(`issue comment https://github.com/ourostack/ouro-ui/issues/351 --body ${line}`));
  assert.equal(made.filter((call) => call.startsWith("run rerun")).length, 1);
  // GitHub refuses the rerun: recorded as such, not as retried, nothing commented, and the caller fails.
  const refusedRun = retry("OPEN", "yes");
  assert.equal(refusedRun.status, 1);
  const refusal = line.replace("Retried once, as quarantined", "Retry requested but the rerun failed");
  assert.equal(readFileSync(summary, "utf8"), `- ${refusal}\n`);
  assert.ok(refusedRun.stdout.includes(`::error title=Quarantined test not retried::${refusal}`));
  assert.doesNotMatch(refusedRun.stdout, /Retried once/);
  assert.ok(!readFileSync(calls, "utf8").includes("issue comment"));
  // The issue closed: the test is no longer quarantined, nothing is rerun and the caller fails,
  // and a warning asks for the stale entry's removal.
  const closed = retry("CLOSED");
  assert.equal(closed.status, 1);
  assert.match(closed.stdout, /^Not retried: .*its issue is not open/m);
  assert.ok(closed.stdout.includes(staleWarning(calendarEntry)));
  assert.equal(readFileSync(summary, "utf8"), "");
  assert.ok(!readFileSync(calls, "utf8").includes("run rerun"));
});

test("Release tags a commit of main whose push CI passed, names the screen-reader lane that runs after, and runs no rehearsal", () => {
  const release = workflow("release.yml");
  assert.match(release, /\n {6}sha:\n/);
  assert.doesNotMatch(release, /rehearsal-evidence|release-rehearsal/);
  const check = releaseStep("Check the version, the tag and main's CI");
  assert.match(check, /compare/);
  assert.match(check, /screen-reader\.yml/);
  assert.match(check, /--event push/);
  assert.match(check, /proof\.md/);
  assert.ok(!existsSync(join(root, ".github/workflows/release-rehearsal.yml")));
});

test("Release auto releases a commit once main's push CI has ended, naming that commit and no other", () => {
  const auto = workflow("release-auto.yml");
  const on = auto.split("\non:\n")[1].split(/\n(?=\S)/)[0];
  assert.match(on, /workflows: \[CI\]/);
  assert.match(on, /branches: \[main\]/);
  assert.match(auto, /gh workflow run release\.yml --ref main -f version="\$version" -f sha="\$sha"/);
  assert.match(auto, /--workflow ci\.yml --commit "\$sha" --event push/);
  assert.match(auto, /\[ "\$RUN_EVENT" = push \]/);
});

test("Release auto starts nothing for a commit that only points the docs at a release, and releases any other", () => {
  const step = stepScript(workflow("release-auto.yml"), "Release the newest commit whose runs passed");
  const pkg = (tag) => `${JSON.stringify({ description: `Install #${tag}`, ouro: { latestRelease: tag } }, null, 2)}\n`;
  const releaseFor = (changes, fragment = "- New: a change\n") => {
    const dir = scratchDir("ouro-release-auto-");
    const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    git(["init", "-q"]);
    git(["config", "user.email", "maintainer@example.com"]);
    git(["config", "user.name", "Maintainer"]);
    // origin's main is the released commit, so its workflow files are main's (the check fetches main).
    const origin = join(scratchDir("ouro-release-auto-origin-"), "origin.git");
    execFileSync("git", ["init", "-q", "--bare", origin]);
    git(["remote", "add", "origin", pathToFileURL(origin).href]);
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "changes"));
    copyFileSync(join(root, "scripts/pin-only.mjs"), join(dir, "scripts/pin-only.mjs"));
    copyFileSync(join(root, "scripts/changes.mjs"), join(dir, "scripts/changes.mjs"));
    const commit = (files) => {
      for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
      git(["add", "-A"]);
      git(["commit", "-q", "--allow-empty", "-m", "change"]);
      return git(["rev-parse", "HEAD"]);
    };
    // The newest release, v1.3.56, published one change; a later commit adds `fragment`, then the commit released.
    commit({ "package.json": pkg("v1.3.17"), "README.md": "Install #v1.3.17.\n", "changes/released.md": "- Released: an earlier change\n" });
    git(["tag", "v1.3.56"]);
    commit({ "changes/fragment.md": fragment });
    const sha = commit(changes);
    git(["push", "-q", "origin", "HEAD:refs/heads/main"]);
    const log = join(dir, "gh.log");
    // Stands in for gh: the newest release v1.3.56, and no run in progress.
    const stub = `gh() {
  printf 'gh %s\\n' "$*" >> "$LOG"
  case "$*" in
    "release view"*) echo v1.3.56 ;;
    "run list --workflow release.yml --status"*) echo 0 ;;
    "run list"*) echo 1 ;;
    "api repos/"*"/releases/latest"*) echo v1.3.56 ;;
  esac
}`;
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${stub}\n${step}`], {
      cwd: dir,
      encoding: "utf8",
      env: sandboxEnv({ GITHUB_REPOSITORY: "ourostack/ouro-ui", EVENT: "workflow_run", RUN_EVENT: "push", RUN_SHA: sha, AFTER: "", LOG: log, GITHUB_STEP_SUMMARY: join(dir, "summary.md") }),
    });
    const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
    return { status: result.status, output: result.stdout + result.stderr, calls, sha };
  };
  const pin = releaseFor({ "package.json": pkg("v1.3.56"), "README.md": "Install #v1.3.56.\n" });
  assert.equal(pin.status, 0, pin.output);
  assert.match(pin.output, new RegExp(`::notice::${pin.sha} only points the docs at a release; nothing to release\\.`));
  assert.doesNotMatch(pin.calls, /workflow run release\.yml/);
  const other = releaseFor({ "package.json": pkg("v1.3.56"), "README.md": "Install #v1.3.56.\n", "app.ts": "export const x = 2;\n" });
  assert.equal(other.status, 0, other.output);
  assert.match(other.output, /app\.ts is not a file the docs pin changes/);
  assert.match(other.calls, /workflow run release\.yml --ref main -f version=1\.3\.57 -f sha=/);
  // A line the newest release's tag already held is not new, though that release's notes lack it: counting against the
  // notes alone released v1.3.160 with nothing in it but v1.3.158's changes (#1485).
  const stale = releaseFor({ "app.ts": "export const x = 3;\n" }, "- Released: an earlier change\n");
  assert.equal(stale.status, 0, stale.output);
  assert.match(stale.output, /::notice::changes\/ lists no change the newest release lacks, so there is nothing to release\./);
  assert.doesNotMatch(stale.calls, /workflow run release\.yml/);
});

test("Docs pin points main's docs at the newest release through one pull request, and turns auto-merge on", () => {
  const docsPin = workflow("docs-pin.yml");
  assert.match(docsPin, /^permissions: \{\}$/m);
  assert.match(docsPin, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n {4}inputs:\n {6}tag:\n/m);
  assert.match(docsPin, /^concurrency:\n {2}group: docs-pin\n {2}cancel-in-progress: false$/m);
  const pin = docsPin.split("\n  pin:\n")[1];
  assert.deepEqual(permissionsOf(pin), { actions: "write", contents: "write", "pull-requests": "write" });
  assert.doesNotMatch(docsPin, /required-producers/);
  const pushToken = "${{ steps.app.outputs.token || secrets.DOCS_PIN_TOKEN || github.token }}";
  assert.ok(pin.includes(`\n          token: ${pushToken}\n`), "the checkout pushes with the app's token, else DOCS_PIN_TOKEN");
  assert.ok(pin.includes(`\n          GH_TOKEN: ${pushToken}\n`), "the pull request is opened with the same token");
  assert.match(pin, /\n {6}BRANCH: docs\/point-at-release\n/);
  assert.deepEqual(
    stepScript(pin, "Point the docs at the release").split("\n").filter((line) => /^(node|pnpm) /.test(line)),
    ['node scripts/docs-pin-release-check.mjs "$TAG"', 'node scripts/latest-release.mjs set "$TAG"', "pnpm run docs"],
  );
  const push = stepScript(pin, "Commit the docs and push their branch");
  assert.match(push, /git push -q --force origin "\$BRANCH"/);
  assert.match(push, /41898282\+github-actions\[bot\]@users\.noreply\.github\.com/);
  const open = stepScript(pin, "Open or update the pull request, and turn auto-merge on");
  assert.match(open, /gh pr list --head "\$BRANCH" --base main --state open/);
  assert.match(open, /gh pr edit "\$number" --title "\$title"/);
  assert.match(open, /gh pr create --base main --head "\$BRANCH"/);
  assert.match(open, /gh pr merge "\$number" --auto --squash --subject "\$subject" --body "\$message"/);
});

test("Core pin points main's Platforms pages at core's newest release through its own pull request, never Docs pin's, and turns auto-merge on", () => {
  const corePin = workflow("core-pin.yml");
  assert.match(corePin, /^permissions: \{\}$/m);
  assert.match(corePin, /^on:\n {2}schedule:\n {4}- cron: "[^"]+"\n {2}push:\n {4}branches: \[main\]\n {4}paths:\n(?: {6}- \S+\n)+ {2}workflow_dispatch:$/m);
  assert.match(corePin, /^concurrency:\n {2}group: core-pin\n {2}cancel-in-progress: false$/m);
  const pin = corePin.split("\n  pin:\n")[1];
  assert.deepEqual(permissionsOf(pin), { actions: "write", contents: "write", "pull-requests": "write" });
  assert.match(pin, /\n {6}BRANCH: docs\/point-at-core\n/);
  assert.deepEqual(
    stepScript(pin, "Point the Platforms pages at core's newest release").split("\n").filter((line) => /^(node|pnpm) /.test(line.trim())).map((line) => line.trim()),
    ["node scripts/platform-versions.mjs --write || code=$?", "node scripts/parity-matrix.mjs --render"],
  );
  const open = stepScript(pin, "Open or update the pull request, and turn auto-merge on");
  assert.match(open, /gh pr merge "\$number" --auto --squash --subject "\$subject" --body "\$message"/);
  assert.doesNotMatch(workflow("docs-pin.yml"), /platform-versions/, "a core release that breaks a test must not hold up Docs pin's pull request");
});

test("Kit pin runs one job per sibling kit, each on its own branch and concurrency group, through its own pull request with auto-merge on, hourly and by hand", () => {
  const kitPin = workflow("kit-pin.yml");
  assert.match(kitPin, /^permissions: \{\}$/m);
  assert.match(kitPin, /^on:\n {2}schedule:\n {4}- cron: "\d+ \* \* \* \*"\n {2}workflow_dispatch:$/m);
  assert.doesNotMatch(kitPin, /^concurrency:/m, "each kit's job has its own concurrency group, so one kit's run never waits for another's");
  const pin = kitPin.split("\n  pin:\n")[1];
  assert.match(pin, /^ {4}strategy:\n {6}fail-fast: false\n {6}matrix:\n {8}include:\n {10}- kit: apple\n {12}name: Apple\n {10}- kit: windows\n {12}name: Windows\n {10}- kit: android\n {12}name: Android\n/m);
  assert.deepEqual([...kitPin.matchAll(/^ {10}- kit: (\w+)$/gm)].map((match) => match[1]), Object.keys(KITS), "the matrix names the kits the script knows");
  assert.deepEqual(permissionsOf(pin), { actions: "write", contents: "write", "pull-requests": "write" });
  assert.match(pin, /\n {4}concurrency:\n {6}group: kit-pin-\$\{\{ matrix\.kit \}\}\n {6}cancel-in-progress: false\n/);
  assert.match(pin, /\n {6}BRANCH: docs\/point-at-\$\{\{ matrix\.kit \}\}\n/);
  assert.match(pin, /\n {6}KIT: \$\{\{ matrix\.kit \}\}\n/);
  assert.match(stepScript(pin, "Compare main's pin with the kit's newest release"), /^node scripts\/kit-pin\.mjs --check "\$KIT" \|\| code=\$\?$/m);
  assert.deepEqual(
    stepScript(pin, "Pin the release and move the statements of the old one").match(/node scripts\/[^\n|;]+/g).map((command) => command.trim()),
    ["node scripts/platform-versions.mjs \"--$KIT\" \"$TAG\"", "node scripts/parity-matrix.mjs --write --kit \"$KIT\"", "node scripts/kit-pin.mjs --bump \"$KIT\" \"$FROM\" \"${TAG#v}\""],
  );
  // Every kit's pin records the kit in platforms.json, which the parity page cites: Windows's v0.12.0 pin without it failed
  // the parity page check (#2720).
  assert.match(stepScript(pin, "Pin the release and move the statements of the old one"), /^ *if \[ "\$code" = 0 \]; then node scripts\/parity-matrix\.mjs --write --kit "\$KIT" \|\| code=\$\?; fi$/m, "each kit's job records its own kit, and only it");
  const open = stepScript(pin, "Open or update the pull request, and turn auto-merge on");
  assert.match(open, /verify:urlOk\(https:\/\/github\.com\/ourostack\/ouro-ui-\$KIT\/releases\/tag\/\$TAG\) verify:equals\(scripts\/parity-data\/versions\.json#\$KIT\.tag\)=\$TAG/);
  assert.match(open, /gh pr merge "\$number" --auto --squash --subject "\$subject" --body "\$message"/);
});

test("Kit pin pushes a kit's branch only when main has moved since its last push, so an hourly run does not restart CI", () => {
  const script = stepScript(workflow("kit-pin.yml").split("\n  pin:\n")[1], "Commit the pages and push their branch, unless the branch already holds this pin");
  for (const [unchanged, pushed] of [[true, false], [false, true]]) {
    const dir = scratchDir("ouro-kit-pin-");
    const git = `git() {\n  printf 'git %s\\n' "$*" >> "$LOG"\n  case "$1" in\n    fetch) return 0 ;;\n    diff) return ${unchanged ? 0 : 1} ;;\n    rev-parse) echo abc123 ;;\n  esac\n}`;
    const result = runStep(`${git}\n${script}`, { TAG: "v0.11.0", KIT: "windows", NAME: "Windows", BRANCH: "docs/point-at-windows", LOG: join(dir, "git.log") });
    assert.equal(result.status, 0, result.stdout + result.calls);
    const calls = readFileSync(join(dir, "git.log"), "utf8");
    assert.equal(/^git push /m.test(calls), pushed, calls);
    assert.match(calls, /commit -q -m Point the Windows pages at ouro-ui-windows v0\.11\.0/);
    assert.equal(result.output.sha, "abc123");
  }
});

test("Docs pin pushes as the Ouro Current app when it is installed here, so CI starts with no approval (#1610), and goes on without it", () => {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  const app = pin.split("\n      - id: app\n")[1].split("\n      - ")[0];
  assert.match(app, /continue-on-error: true/);
  assert.match(app, /uses: actions\/create-github-app-token@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.match(app, /app-id: \$\{\{ vars\.OURO_CURRENT_APP_ID \}\}/);
  assert.match(app, /private-key: \$\{\{ secrets\.OURO_CURRENT_PRIVATE_KEY \}\}/);
  assert.match(app, /permission-contents: write\n {10}permission-pull-requests: write/);
  assert.ok(pin.indexOf("- id: app") < pin.indexOf("actions/checkout@"), "the token is made before the checkout that pushes with it");
});

test("Docs pin's pull request body asks no one for anything, since the workflow starts its CI itself", () => {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  const script = stepScript(pin, "Open or update the pull request, and turn auto-merge on");
  const dir = scratchDir("ouro-docs-pin-");
  const gh = `gh() {\n  printf 'gh %s\\n' "$*" >> "$LOG"\n  case "$*" in\n    "pr list"*) echo 7 ;;\n  esac\n}`;
  const result = runStep(`${gh}\n${script}`, { TAG: "v1.3.56", BRANCH: "docs/point-at-release", GITHUB_REPOSITORY: "ourostack/ouro-ui", LOG: join(dir, "gh.log"), GITHUB_STEP_SUMMARY: join(dir, "summary.md") });
  assert.equal(result.status, 0, result.stdout + result.calls);
  const calls = readFileSync(join(dir, "gh.log"), "utf8");
  assert.match(calls, /Release opened this pull request after it tagged v1\.3\.56/);
  assert.doesNotMatch(calls, /empty commit|DOCS_PIN_TOKEN/);
  assert.equal(result.output.number, "7");
});

test("Core pin re-renders the parity matrix on each push to main that changes its data, so Apple release holds only the pins on main and the whole page on a pull request", () => {
  const corePin = workflow("core-pin.yml");
  const paths = corePin.split("\n  push:\n")[1].split("\n  workflow_dispatch:")[0];
  for (const path of ["registry/ouro/components/ouro/*/component.json", "scripts/parity-data/**", "scripts/parity-matrix.mjs", "scripts/parity-rows.mjs", "docs/platforms/parity.md"]) {
    assert.ok(paths.includes(`\n      - ${path}`), path);
  }
  assert.ok(stepScript(corePin.split("\n  pin:\n")[1], "Point the Platforms pages at core's newest release").includes("node scripts/parity-matrix.mjs --render"));
  const step = stepScript(workflow("apple-release.yml"), "The parity matrix's pinned Apple components are GitHub's");
  for (const [event, args] of [["pull_request", "scripts/parity-matrix.mjs --live"], ["push", "scripts/parity-matrix.mjs --live --pins"], ["schedule", "scripts/parity-matrix.mjs --live --pins"]]) {
    const result = runStep(step, { EVENT: event });
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(result.calls.split("\n").filter((line) => line.startsWith("CALL node")), [`CALL node ${args}`], event);
  }
});

test("Docs pin and Core pin try again to turn auto-merge on after a server error, and pass once GitHub shows it on or merged", () => {
  for (const file of ["docs-pin.yml", "core-pin.yml"]) {
    const pin = workflow(file).split("\n  pin:\n")[1];
    const script = stepScript(pin, "Open or update the pull request, and turn auto-merge on");
    // merges: what each \`gh pr merge\` does in turn (the last repeats); views: what each look at the pull request finds.
    const run = (merges, views) => {
      const dir = scratchDir("ouro-pin-merge-");
      writeFileSync(join(dir, "m"), "0");
      writeFileSync(join(dir, "v"), "0");
      const gh = `gh() {
  printf 'gh %s\\n' "$*" >> "$LOG"
  case "$*" in
    "pr list"*) echo 7 ;;
    "pr merge"*) n=$(cat "${dir}/m"); echo $((n + 1)) > "${dir}/m"; set -- ${merges.join(" ")}; shift $(( n < $# ? n : $# - 1 )); [ "$1" = ok ] ;;
    "pr view"*autoMergeRequest*) n=$(cat "${dir}/v"); echo $((n + 1)) > "${dir}/v"; set -- ${views.join(" ") || "off"}; shift $(( n < $# ? n : $# - 1 )); echo "$1" ;;
  esac
}`;
      const result = runStep(`${gh}\n${script}`, { TAG: "v1.3.56", BRANCH: "docs/point-at-release", GITHUB_REPOSITORY: "ourostack/ouro-ui", LOG: join(dir, "gh.log"), GITHUB_STEP_SUMMARY: join(dir, "summary.md"), MERGE_RETRY_SECONDS: "0" });
      return { ...result, merges: (readFileSync(join(dir, "gh.log"), "utf8").match(/^gh pr merge /gm) ?? []).length };
    };
    const retried = run(["fail", "ok"], ["off"]);
    assert.equal(retried.status, 0, `${file}: ${retried.stdout}`);
    assert.equal(retried.merges, 2, file);
    const tookEffect = run(["fail"], ["on"]);
    assert.equal(tookEffect.status, 0, `${file}: ${tookEffect.stdout}`);
    assert.equal(tookEffect.merges, 1, file);
  }
});

/** Runs Docs pin's CI step with a stand-in gh whose run list for the pushed commit is `runs` on each read in turn (the last repeats). */
function startCi(...runs) {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  const script = stepScript(pin, "Start the pull request's CI, and fail when it has not started");
  const dir = scratchDir("ouro-docs-pin-");
  const reads = join(dir, "reads");
  writeFileSync(reads, "0");
  runs.forEach((list, index) => writeFileSync(join(dir, `runs-${index}`), list.map((run) => run.join("\t")).join("\n")));
  const gh = `gh() {
  printf 'gh %s\\n' "$*" >> "$LOG"
  case "$*" in
    "api repos/"*"/actions/runs?head_sha="*)
      n=$(cat "${reads}"); echo $((n + 1)) > "${reads}"
      [ "$n" -lt ${runs.length} ] || n=${runs.length - 1}
      cat "${dir}/runs-$n"; echo ;;
  esac
}`;
  const result = runStep(`${gh}\n${script}`, { SHA: "abc", NUMBER: "7", BRANCH: "docs/point-at-release", POLLS: "3", INTERVAL: "0", GITHUB_REPOSITORY: "ourostack/ouro-ui", LOG: join(dir, "gh.log"), GITHUB_STEP_SUMMARY: join(dir, "summary.md") });
  return { ...result, gh: readFileSync(join(dir, "gh.log"), "utf8") };
}

test("Docs pin approves its pull request's held runs, and passes once CI has started (#1757)", () => {
  const held = [["11", "CI", "action_required"], ["12", "Claims", "action_required"]];
  const started = startCi(held, [["11", "CI", ""], ["12", "Claims", ""]]);
  assert.equal(started.status, 0, started.stdout + started.gh);
  assert.match(started.gh, /^gh api -X POST repos\/ourostack\/ouro-ui\/actions\/runs\/11\/approve$/m);
  assert.match(started.gh, /^gh api -X POST repos\/ourostack\/ouro-ui\/actions\/runs\/12\/approve$/m);
  // A push that started CI itself, as the app's does, approves nothing.
  const app = startCi([["11", "CI", ""]]);
  assert.equal(app.status, 0, app.stdout + app.gh);
  assert.doesNotMatch(app.gh, /approve/);
});

test("Docs pin fails, and says so on the pull request, when CI has not started by its last look (#1757)", () => {
  const none = startCi([]);
  assert.equal(none.status, 1, none.stdout + none.gh);
  assert.match(none.stdout, /::error::CI has not started on #7 \(abc\)/);
  assert.match(none.gh, /^gh pr comment 7 --body CI has not started on #7/m);
  const stillHeld = startCi([["11", "CI", "action_required"]]);
  assert.equal(stillHeld.status, 1, stillHeld.stdout + stillHeld.gh);
  // The guard waits 15 minutes in Docs pin itself.
  const step = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  assert.match(step, /\n {10}POLLS: 90\n {10}INTERVAL: 10\n/);
});

test("Docs pin changes nothing for a tag that is not the newest release, and says whether main already names it", () => {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  const script = stepScript(pin, "Point the docs at the release");
  const env = { TAG: "v1.3.56", GITHUB_REPOSITORY: "ourostack/ouro-ui" };
  const newer = runStep(`gh() { case "$*" in "api repos/"*"/releases/latest"*) echo v1.3.57 ;; esac; }\n${script}`, env);
  assert.equal(newer.status, 0, newer.calls);
  assert.equal(newer.output.result, "stale");
  assert.match(newer.calls, /CALL node scripts\/docs-pin-release-check\.mjs v1\.3\.56/, "still checks the tag is published before comparing it with the newest release");
  assert.doesNotMatch(newer.calls, /CALL node scripts\/latest-release\.mjs set|CALL pnpm/);
  const latest = `gh() { case "$*" in "api repos/"*"/releases/latest"*) echo v1.3.56 ;; esac; }\n`;
  const current = runStep(`${latest}git() { :; }\n${script}`, env);
  assert.equal(current.output.result, "current");
  const changed = runStep(`${latest}git() { echo " M README.md"; }\n${script}`, env);
  assert.equal(changed.output.result, "changed");
  assert.match(changed.calls, /CALL node scripts\/latest-release\.mjs set/);
});

test("Docs pin leaves an open pull request alone only when it holds the same docs, merges cleanly and no check failed", () => {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  const script = stepScript(pin, "Leave the pull request alone when it already holds these docs");
  const env = { BRANCH: "docs/point-at-release" };
  const fns = (o) => `gh() { case "$*" in "pr list"*) echo ${o.number ?? ""} ;; "pr view"*mergeable*) echo ${o.mergeable ?? "MERGEABLE"} ;; "pr view"*) echo ${o.failing ?? 0} ;; "pr diff"*) printf '${o.theirs ?? "a.md\\nb.md"}\\n' ;; esac; }\ngit() { case "$*" in "diff --cached --name-only") printf 'a.md\\nb.md\\n' ;; "diff --cached --quiet"*) return ${o.differs ? 1 : 0} ;; esac; }\n`;
  const same = runStep(fns({ number: 7 }) + script, env);
  assert.equal(same.output.same, "true", same.calls);
  // A branch cut from main before the last pin merged holds the same docs as a pin from main now, but conflicts with
  // main on the lines that pin changed, and GitHub runs no CI on it, so it must be rebuilt (#2881). GitHub's answer can be
  // UNKNOWN while it works it out; that is rebuilt too.
  for (const o of [{}, { number: 7, failing: 1 }, { number: 7, theirs: "a.md" }, { number: 7, differs: true }, { number: 7, mergeable: "CONFLICTING" }, { number: 7, mergeable: "UNKNOWN" }]) {
    assert.notEqual(runStep(fns(o) + script, env).output.same, "true", JSON.stringify(o));
  }
  assert.equal(pin.split("steps.same.outputs.same != 'true'").length - 1, 3, "the push, the pull request and its CI start all wait on the check");
});

test("Docs pin reuses its open pull request and turns auto-merge on for it", () => {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  const script = stepScript(pin, "Open or update the pull request, and turn auto-merge on");
  const dir = scratchDir("ouro-docs-pin-");
  const gh = `gh() {
  printf 'gh %s\\n' "$*" >> "$LOG"
  case "$*" in
    "pr list"*) echo 7 ;;
  esac
}`;
  const result = runStep(`${gh}\n${script}`, { TAG: "v1.3.56", BRANCH: "docs/point-at-release", GITHUB_REPOSITORY: "ourostack/ouro-ui", LOG: join(dir, "gh.log"), GITHUB_STEP_SUMMARY: join(dir, "summary.md") });
  assert.equal(result.status, 0, result.stdout + result.calls);
  const calls = readFileSync(join(dir, "gh.log"), "utf8");
  assert.match(calls, /^gh pr edit 7 --title Point the docs at a release /m);
  assert.doesNotMatch(calls, /gh pr create/);
  assert.match(calls, /^gh pr merge 7 --auto --squash --subject {2}--body $/m);
  assert.match(readFileSync(join(dir, "summary.md"), "utf8"), /Auto-merge is on for #7/);
});

test("Docs pin fails, and names the pull request, when GitHub will not turn auto-merge on", () => {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  const script = stepScript(pin, "Open or update the pull request, and turn auto-merge on");
  const dir = scratchDir("ouro-docs-pin-");
  const gh = `gh() {
  printf 'gh %s\\n' "$*" >> "$LOG"
  case "$*" in
    "pr list"*) echo 7 ;;
    "pr merge"*) return 1 ;;
    "pr view"*) echo OPEN ;;
  esac
}`;
  const result = runStep(`${gh}\n${script}`, { TAG: "v1.3.56", BRANCH: "docs/point-at-release", GITHUB_REPOSITORY: "ourostack/ouro-ui", LOG: join(dir, "gh.log"), GITHUB_STEP_SUMMARY: join(dir, "summary.md"), MERGE_RETRY_SECONDS: "0" });
  assert.equal(result.status, 1, result.stdout + result.calls);
  assert.match(result.stdout, /::error::Could not turn auto-merge on for #7 after 5 tries\./);
  assert.equal((readFileSync(join(dir, "gh.log"), "utf8").match(/^gh pr merge /gm) ?? []).length, 5);
});

test("Main green posts its status after each CI run on main, when a pull request into main changes, and by hand, with the pull request's number passed through env", () => {
  const text = workflow("main-green.yml");
  assert.match(text, /^on:\n {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n {2}pull_request:\n {4}branches: \[main\]\n {4}types: \[opened, synchronize, reopened, labeled, unlabeled\]\n {2}workflow_dispatch:\npermissions:/m);
  assert.match(text, /^permissions:\n {2}contents: read\n {2}pull-requests: read\n {2}actions: read\n {2}statuses: write\n {2}issues: write.*\nconcurrency:/m);
  assert.match(text, /^ {10}PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}$/m);
  const statusRunStep = text.slice(text.indexOf("        run: |"), text.indexOf("\n  report-signatures:"));
  assert.doesNotMatch(statusRunStep, /\$\{\{/, "the run step names no expression: the number comes from PR_NUMBER");
  assert.match(text, /node scripts\/main-green\.mjs --pr "\$PR_NUMBER"/);
});

test("Main green is not a required check yet: the workflow lands, and posts its status, before the main ruleset asks for it", () => {
  assert.ok(!requiredChecks.includes("main green"));
});

test("Main green's report-signatures job logs the candidate main-red-signatures verdict only on a workflow_run or a hand dispatch, report-only", () => {
  const text = workflow("main-green.yml");
  assert.match(text, /report-signatures:\n {4}name: Log the candidate main-red-signatures verdict\n {4}if: \$\{\{ github\.event_name == 'workflow_run' \|\| github\.event_name == 'workflow_dispatch' \}\}/);
  assert.match(text, /continue-on-error: true\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/main-red-signatures\.mjs report/);
});

test("Main green's report-cascade-retrigger job logs the candidate cascade re-trigger plan only on a workflow_run or a hand dispatch, report-only", () => {
  const text = workflow("main-green.yml");
  assert.match(text, /report-cascade-retrigger:\n {4}name: Log the candidate cascade re-trigger plan\n {4}if: \$\{\{ github\.event_name == 'workflow_run' \|\| github\.event_name == 'workflow_dispatch' \}\}/);
  assert.match(text, /continue-on-error: true\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/cascade-retrigger\.mjs report/);
});

test("Main green's report-ceiling-fix-exempt job logs the candidate ceiling-fix-exempt verdict only on a workflow_run or a hand dispatch, report-only", () => {
  const text = workflow("main-green.yml");
  assert.match(text, /report-ceiling-fix-exempt:\n {4}name: Log the candidate ceiling-fix-exempt verdict\n {4}if: \$\{\{ github\.event_name == 'workflow_run' \|\| github\.event_name == 'workflow_dispatch' \}\}/);
  assert.match(text, /continue-on-error: true\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/ceiling-fix-exempt\.mjs report/);
});

test("Main green's report-fail-fast-fresh-main job logs the candidate fail-fast-fresh-main verdict only on a workflow_run or a hand dispatch, report-only", () => {
  const text = workflow("main-green.yml");
  assert.match(text, /report-fail-fast-fresh-main:\n {4}name: Log the candidate fail-fast-fresh-main verdict\n {4}if: \$\{\{ github\.event_name == 'workflow_run' \|\| github\.event_name == 'workflow_dispatch' \}\}/);
  assert.match(text, /continue-on-error: true\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/fail-fast-fresh-main\.mjs report/);
});

test("Docs pin's stale job reads the tags and whether the pin pull request is open, on each push to main, with pull-requests: read on that job only", () => {
  const text = workflow("docs-pin.yml");
  const blockOf = (job) => text.split(`\n  ${job}:\n`)[1].split(/\n(?= {2}[\w-]+:\n)/)[0];
  const stale = blockOf("stale");
  assert.match(stale, /^ {4}if: github\.event_name == 'push'$/m);
  assert.deepEqual(permissionsOf(stale), { contents: "read", "pull-requests": "read" });
  assert.deepEqual(permissionsOf(blockOf("pin")), { actions: "write", contents: "write", "pull-requests": "write" });
  assert.match(stale, /^ {4}outputs:\n {6}stale: \$\{\{ steps\.check\.outputs\.stale \}\}\n {6}refresh: \$\{\{ steps\.refresh\.outputs\.refresh \}\}\n {6}tag: \$\{\{ steps\.check\.outputs\.tag \}\}$/m);
  assert.match(stale, /tag=\$\(node scripts\/latest-release\.mjs\)\n/);
  assert.match(stale, /if node scripts\/latest-release\.mjs check; then\n\s+echo "stale=false"/);
  assert.match(stale, /gh pr list --head "\$BRANCH" --base main --state open --json number/);
  assert.match(stale, /echo "refresh=true" >> "\$GITHUB_OUTPUT"/);
});

test("Docs pin's stale job points a refresh at the open pull request's own tag, since main's package.json still names the old release", () => {
  const stale = workflow("docs-pin.yml").split("\n  stale:\n")[1].split(/\n(?= {2}[\w-]+:\n)/)[0];
  const refresh = stepScript(stale, "Is the pin pull request open, and which release does it point at?");
  const check = stepScript(stale, "Compare the docs' tags with the release to point them at");
  const dir = scratchDir("ouro-refresh-tag-");
  const gh = `gh() {
  case "$*" in
    "pr list"*) if [ -n "$PR_NUMBER" ]; then echo "$PR_NUMBER"; fi ;;
    "api repos/o/r/contents/package.json?ref=docs/point-at-release --jq .content") printf '%s' "$CONTENT" ;;
    *) echo "unexpected gh $*" >&2; return 1 ;;
  esac
}`;
  let made = 0;
  const step = (script, env) => {
    const output = join(dir, `output-${(made += 1)}.txt`);
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${gh}\n${script}`], {
      cwd: root,
      encoding: "utf8",
      env: sandboxEnv({ GITHUB_REPOSITORY: "o/r", BRANCH: "docs/point-at-release", GITHUB_OUTPUT: output, ...env }),
    });
    const outputs = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").filter(Boolean).map((line) => line.split(/=(.*)/).slice(0, 2)));
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, outputs };
  };
  const pinned = Buffer.from(JSON.stringify({ ouro: { latestRelease: "v9.9.9" } })).toString("base64");
  // An open pull request: the refresh reads its tag, and the check takes it over main's, even when main's docs are stale.
  const open = step(refresh, { PR_NUMBER: "7", CONTENT: pinned });
  assert.equal(open.status, 0, open.stderr);
  assert.deepEqual(open.outputs, { refresh: "true", tag: "v9.9.9" });
  const refreshed = step(check, { REFRESH: "true", PR_TAG: "v9.9.9" });
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.equal(refreshed.outputs.tag, "v9.9.9");
  // No open pull request: main's ouro.latestRelease is the release, as before.
  const none = step(refresh, { PR_NUMBER: "", CONTENT: pinned });
  assert.deepEqual(none.outputs, { refresh: "false" });
  const mainTag = execFileSync("node", ["scripts/latest-release.mjs"], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(step(check, { REFRESH: "false", PR_TAG: "" }).outputs.tag, mainTag);
  // A pull request whose ouro.latestRelease is not a release tag stops the job rather than falling back to main's.
  const malformed = step(refresh, { PR_NUMBER: "7", CONTENT: Buffer.from('{"ouro":{"latestRelease":"main"}}').toString("base64") });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stdout, /::error::The pin pull request's ouro\.latestRelease is not a release tag: 'main'\./);
});

test("Docs pin's pin job runs when dispatched, when main's docs name another tag, or when the pin pull request is open to refresh, and otherwise not", () => {
  const pin = workflow("docs-pin.yml").split("\n  pin:\n")[1];
  assert.match(pin, /^ {4}needs: \[stale\]$/m);
  assert.match(pin, /^ {6}TAG: \$\{\{ inputs\.tag \|\| needs\.stale\.outputs\.tag \}\}$/m);
  const condition = pin.match(/^ {4}if: \$\{\{ (.+) \}\}$/m)[1];
  const runs = (event, outputs = {}) => evaluate(`\${{ ${condition} }}`, { github: { event_name: event }, needs: { stale: { outputs } }, cancelled: () => false });
  // A dispatch runs it whatever the stale job said, and the stale job is skipped on a dispatch.
  assert.equal(runs("workflow_dispatch", {}), true);
  assert.equal(runs("workflow_dispatch", { stale: "false", refresh: "false" }), true);
  assert.equal(runs("push", { stale: "true", refresh: "false" }), true);
  assert.equal(runs("push", { stale: "false", refresh: "true" }), true);
  assert.equal(runs("push", { stale: "true", refresh: "true" }), true);
  assert.equal(runs("push", { stale: "false", refresh: "false" }), false);
  // A stale job that failed sets no output, so the pin job does not run.
  assert.equal(runs("push", {}), false);
});

test("Release starts Docs pin once it has tagged, and no job waits for it", () => {
  const jobs = releaseJobs();
  assert.match(jobs["docs-pin"], /^ {4}needs: release$/m);
  assert.match(jobs["docs-pin"], /if: \$\{\{ needs\.release\.result == 'success' \}\}/);
  assert.match(jobs["docs-pin"], /gh workflow run docs-pin\.yml --ref main -f tag="\$TAG"/);
  assert.ok(jobs["docs-pin"].indexOf("gh workflow run released.yml --ref main -f tag=\"$TAG\"") < jobs["docs-pin"].indexOf("gh workflow run docs-pin.yml"), "Released, the signal that a release is out, starts first");
  const released = workflow("released.yml");
  assert.match(released, /^on:\n {2}workflow_dispatch:\n {4}inputs:\n {6}tag:\n/m, "only Release starts it");
  assert.match(released, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(released, /actions\/checkout|secrets\./, "it runs no code and holds no secret");
  for (const id of ["pages", "publish", "finish", "next"]) assert.doesNotMatch(jobs[id], /docs-pin/, id);
});

test("Release starts Ouro Current once it has tagged, since a release its own token publishes starts no workflow", () => {
  // GITHUB_TOKEN's release event starts no other workflow, so ouro-current.yml's own release trigger never fired;
  // workflow_dispatch is the one event that token may start (https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow).
  const job = releaseJobs()["docs-pin"];
  assert.match(job, /gh workflow run ouro-current\.yml --ref main/);
  const current = workflow("ouro-current.yml");
  const on = current.split(/^on:\n/m)[1].split(/^\S/m)[0];
  assert.match(on, /^ {2}workflow_dispatch:$/m, "Release starts it");
  assert.match(on, /^ {2}schedule:$/m, "core and Apple releases happen elsewhere, so it still runs on a timer");
  assert.doesNotMatch(on, /^ {2}(release|repository_dispatch):/m, "no trigger that nothing sends");
});

test("install prep caches a base keyed on the runtime files, then adds the shipped tests over it", () => {
  const ciText = readFileSync(".github/workflows/ci.yml", "utf8");
  const prep = ciText.slice(ciText.indexOf("\n  install-prep:"), ciText.indexOf("\n  install-shard:"));
  const baseKey = prep.match(/key: install-base-[^\n]*/)[0];
  for (const left of ["!registry/**/*.test.tsx", "!registry/**/*.stories.tsx", "!registry/ouro/e2e/**"]) assert.ok(baseKey.includes(left), left);
  for (const out of ["'docs/**'", "'README.md'", "'UPGRADING.md'"]) assert.ok(!baseKey.includes(out), `the base does not read ${out}`);
  assert.ok(prep.includes("OURO_BASE_ONLY=1"));
  assert.ok(prep.includes("OURO_DELTA=1 OURO_PREPARE_ONLY=1 OURO_SKIP_CHECKS=1"));
  const script = readFileSync("scripts/install-test.sh", "utf8");
  assert.ok(script.includes("OURO_BASE_ONLY") && script.includes("OURO_DELTA"));
});

test("fresh-main starts with the run, waits on nothing but the plan, and runs on pull requests only", () => {
  const block = ciJobs()["fresh-main"];
  assert.match(block, /^ {4}needs: \[plan\]$/m);
  assert.match(block, /^ {4}if: \$\{\{ !cancelled\(\) && github\.event_name == 'pull_request' \}\}$/m);
});

test("the factory check runs the Ouro check of the release factory has installed, never main's", () => {
  const workflow = readFileSync(join(dir, "factory-ouro-check.yml"), "utf8");
  const check = workflow.split("\n  report:\n")[0];
  assert.match(check, /gh api "repos\/ourostack\/factory\/contents\/\.github\/ouro-hx-installed\.json\?ref=main" --jq \.content \| base64 -d \| jq -r \.tag/);
  assert.match(check, /\[\[ "\$tag" =~ \^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$ \]\]/);
  assert.match(check, /^ {10}ref: \$\{\{ steps\.installed\.outputs\.tag \}\}$/m);
  assert.doesNotMatch(check, /^ {10}ref: main$/m);
});

test("the nightly run calls the lane once more after it, strict, and opens or comments on one issue when that fails (#2085)", () => {
  const { strict, "strict-report": report } = callerJobs();
  // After the lane, so the nightly run never holds more than two macOS runners at once.
  assert.match(strict, /^ {4}needs: \[lane\]$/m);
  assert.match(strict, /^ {4}if: always\(\) && github\.event_name == 'schedule'$/m);
  assert.match(strict, /^ {4}uses: \.\/\.github\/workflows\/screen-reader-lane\.yml$/m);
  assert.match(strict, /^ {6}strict: true$/m);
  assert.match(strict, /^ {4}permissions:\n {6}contents: read$/m);
  assert.match(report, /^ {4}needs: \[strict\]$/m);
  assert.match(report, /^ {4}if: always\(\) && github\.event_name == 'schedule'$/m);
  assert.match(report, /select\(\.name \| test\("strict"\)\)/);
  assert.match(report, /scripts\/scheduled-failure\.sh "\$RUN_URL" "Screen-reader lane: VoiceOver on macOS 26 missed a step with the hint-only fallback off"/);
});

test("the nightly run opens or comments on one issue when its advisory VoiceOver on macos-15 fails, and no other run does", () => {
  const advisory = callerJobs().advisory;
  assert.match(advisory, /^ {4}needs: \[lane\]$/m);
  assert.match(advisory, /^ {4}if: always\(\) && github\.event_name == 'schedule'$/m);
  assert.match(advisory, /^ {6}actions: read\n {6}contents: read\n {6}issues: write$/m);
  assert.match(advisory, /select\(\(\.name \| test\("macos-15"\)\) and \(\.name \| test\("advisory"\)\)\)/);
  assert.match(advisory, /scripts\/scheduled-failure\.sh "\$RUN_URL" "Screen-reader lane: the advisory VoiceOver on macOS 15 failed"/);
});

test("browser and fallback shards upload a failed test's screenshots, so a timeout shows where its test stood", () => {
  const jobs = ciJobs();
  for (const [id, kind] of [["browser", "browser"], ["browser-fallback", "fallback"]]) {
    assert.match(
      jobs[id],
      new RegExp(`- if: failure\\(\\)\\n {8}uses: actions/upload-artifact@[0-9a-f]{40} # v[\\d.]+\\n {8}with:\\n {10}name: failures-${kind}-\\$\\{\\{ matrix\\.shard \\}\\}\\n {10}path: \\.vitest/attachments/\\n`),
      id,
    );
  }
});

test("the browser shards hold each test to half its timeout: vitest.config.ts adds the headroom reporter to a browser shard only, and the browser job runs a shard", () => {
  const config = readFileSync(join(root, "vitest.config.ts"), "utf8");
  assert.match(config, /\.\.\.\(browserShard \? \[new HeadroomReporter\(\)\] : \[\]\)/);
  assert.match(ciJobs().browser, /vitest run[^\n]*--shard=/);
  assert.ok(existsSync(join(root, ".github/headroom.json")));
  // A pull request judges only the tests in the files it changes: the plan lists them, the shards read them.
  assert.match(ciJobs().plan, /id: changed\n[\s\S]*git diff --name-only HEAD\^1 HEAD[\s\S]*files<<CHANGED_FILES_EOF/);
  assert.match(ciJobs().plan, /changed: \$\{\{ steps\.changed\.outputs\.files \}\}/);
  assert.match(ciJobs().browser, /HEADROOM_CHANGED: \$\{\{ needs\.plan\.outputs\.changed \}\}/);
  // The full-suite fallback shards scope the same way: without this, a test over half its timeout
  // in a file the pull request never touched failed the fallback run alone (ourostack/ouro-ui#2928).
  assert.match(ciJobs()["browser-fallback"], /HEADROOM_CHANGED: \$\{\{ needs\.plan\.outputs\.changed \}\}/);
  // Off a pull request a breach is reported, not failed: the shards upload the list and headroom-report.yml files it in one issue.
  assert.match(ciJobs().browser, /github\.event_name != 'pull_request' \}\}\n\s+uses: actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+name: headroom-browser-\$\{\{ matrix\.shard \}\}\n\s+path: \.tmp\/headroom\//);
  const report = workflow("headroom-report.yml");
  assert.match(report, /workflows: \[CI\]\n\s+types: \[completed\]/);
  assert.match(report, /if: \$\{\{ github\.event\.workflow_run\.event != 'pull_request' \}\}/);
  assert.match(report, /permissions:\n\s+contents: read\n\s+actions: read[^\n]*\n\s+issues: write/);
  assert.match(report, /scripts\/scheduled-failure\.sh "\$RUN" "Headroom breaches on main"/);
  // ci.yml itself writes no issues: rerun-guard.yml is the only caller of issues: write (checked on its own, above).
  assert.equal(workflow("ci.yml").match(/issues: write/g)?.length ?? 0, 0);
});

test("the changed-files step scopes to a stacked pull request's real base, not only main, and fails closed with a reason when it cannot diff", () => {
  const script = stepScript(ciJobs().plan, "Which files does the change touch?");
  // A pull request into any base (main or a stacked branch) gets its own real base diffed; only a
  // release branch's own pull request (which runs full-judge today) is excluded (ourostack/ouro-ui#3665).
  assert.doesNotMatch(script, /BASE_REF.? = main/);
  assert.match(script, /EVENT" = pull_request/);
  assert.match(script, /HEAD_REF" != release\//);
  // A diff that fails (the base ref unresolved, say) leaves files empty, as today, but now says why.
  assert.match(script, /::warning/);
});

test("rerun-guard.yml starts on CI going in_progress (requested never fires for a rerun), not needing plan or the run to finish, and comments only on main's own rerun", () => {
  const guard = workflow("rerun-guard.yml");
  // requested does not fire on a rerun (GitHub's events-that-trigger-workflows doc, workflow_run section);
  // in_progress is the type that still starts independently of the triggering run finishing or being
  // cancelled (ourostack/ouro-ui#3210's run 45339486025, cancelled before the in-run job's plan dependency ran).
  assert.match(guard, /workflows: \[CI\]\n\s+types: \[in_progress\]/);
  assert.match(guard, /^permissions:\n {2}contents: read\n {2}issues: write/m);
  assert.match(
    guard,
    /^ {4}if: \$\{\{ github\.event\.workflow_run\.event == 'push' && github\.event\.workflow_run\.head_branch == 'main' && github\.event\.workflow_run\.run_attempt > 1 \}\}$/m,
  );
  // No checkout of untrusted code: the script is fetched from the default branch and run, never built from the triggering ref.
  assert.doesNotMatch(guard, /actions\/checkout/);
  assert.match(guard, /curl[^\n]*raw\.githubusercontent\.com\/\$\{\{ github\.repository \}\}\/main\/scripts\/rerun-guard\.mjs/);
  assert.match(guard, /RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(guard, /RUN_ATTEMPT: \$\{\{ github\.event\.workflow_run\.run_attempt \}\}/);
  assert.match(guard, /RUN_URL: \$\{\{ github\.event\.workflow_run\.html_url \}\}/);
  assert.match(guard, /RUN_ACTOR: \$\{\{ github\.event\.workflow_run\.triggering_actor\.login \}\}/);
});
