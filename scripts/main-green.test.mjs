import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { exempt, mainState, postStatuses, statusFor } from "./main-green.mjs";
import { scratchDir } from "./scratch.mjs";
import { sandboxEnv } from "./sandbox.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const same = { full_name: "o/r" };
const run = (id, conclusion, extra = {}) => ({ id, head_sha: `sha${id}`, status: "completed", conclusion, html_url: `https://github.com/o/r/actions/runs/${id}`, ...extra });
const pr = (overrides = {}) => {
  const number = overrides.number ?? 12;
  return { number, title: "Add a thing", labels: [], head: { ref: "feature", sha: `sha${number}`, repo: same }, base: { repo: same }, ...overrides };
};

test("mainState is green when the newest decisive CI run on main succeeded, and red when it failed, with its sha and run", () => {
  assert.deepEqual(mainState([run(2, "success"), run(1, "failure")]), { green: true, sha: "sha2", url: "https://github.com/o/r/actions/runs/2" });
  assert.deepEqual(mainState([run(3, "failure"), run(2, "success")]), { green: false, sha: "sha3", url: "https://github.com/o/r/actions/runs/3" });
});

test("mainState passes over runs still in progress, cancelled or skipped, and with no run to judge it is green", () => {
  assert.equal(mainState([run(4, null, { status: "in_progress" }), run(3, "failure")]).green, false);
  assert.equal(mainState([run(4, null, { status: "queued" }), run(3, "success")]).green, true);
  assert.equal(mainState([run(4, "cancelled"), run(3, "success")]).sha, "sha3");
  assert.equal(mainState([run(4, "skipped"), run(3, "failure")]).green, false);
  assert.deepEqual(mainState([]), { green: true, sha: null, url: null });
  assert.deepEqual(mainState([run(4, "cancelled")]), { green: true, sha: null, url: null });
});

test("exempt lets a fix through a red main: a red-main-fix label on any pull request, or this repository's docs pin or revert", () => {
  assert.equal(exempt(pr({ labels: [{ name: "red-main-fix" }] })), true);
  assert.equal(exempt(pr({ labels: ["red-main-fix"], head: { ref: "f", repo: { full_name: "fork/r" } } })), true);
  assert.equal(exempt(pr({ head: { ref: "docs/point-at-release", sha: "s", repo: same } })), true);
  assert.equal(exempt(pr({ title: 'Revert "Add a thing"' })), true);
});

test("exempt holds a normal pull request, and a fork's docs branch or revert title, to a red main", () => {
  assert.equal(exempt(pr()), false);
  assert.equal(exempt(pr({ head: { ref: "docs/point-at-release", sha: "s", repo: { full_name: "fork/r" } } })), false);
  assert.equal(exempt(pr({ title: 'Revert "x"', head: { ref: "f", sha: "s", repo: null } })), false);
});

test("statusFor posts success while main is green, a failure naming the sha while it is red, and success for an exempt pull request", () => {
  const green = { green: true, sha: "sha3", url: "https://x/run/3" };
  const red = { green: false, sha: "abc1234def", url: "https://x/run/9" };
  assert.deepEqual(statusFor(green, pr()), { state: "success", description: "Main is green.", target_url: "https://x/run/3" });
  const failure = statusFor(red, pr());
  assert.deepEqual(failure, { state: "failure", description: "Main is red at abc1234: fix main first, or label this red-main-fix if it is the fix.", target_url: "https://x/run/9" });
  assert.ok(failure.description.length <= 140, failure.description);
  assert.deepEqual(statusFor(red, pr({ labels: [{ name: "red-main-fix" }] })), { state: "success", description: "Main is red; this pull request may merge as its fix.", target_url: "https://x/run/9" });
});

/** An in-process stand-in for gh api: the CI runs, the open pull requests (100 to a page), and the requests it records. */
function fakeGitHub({ runs = [], pulls = [], failRuns = false, failPost = null } = {}) {
  const posts = [];
  const reads = [];
  const api = (path, { method = "GET", body } = {}) => {
    const url = new URL(path, "https://api.github.com/");
    const last = url.pathname.split("/").at(-1);
    if (method === "POST") {
      if (last === failPost) throw new Error("HTTP 422");
      posts.push({ sha: last, ...body });
      return {};
    }
    reads.push(path);
    if (url.pathname.endsWith("/ci.yml/runs")) {
      if (failRuns) throw new Error("HTTP 500");
      return { workflow_runs: runs };
    }
    if (url.pathname.endsWith("/pulls")) {
      const page = Number(url.searchParams.get("page"));
      return pulls.slice((page - 1) * 100, page * 100);
    }
    const number = url.pathname.match(/\/pulls\/(\d+)$/)?.[1];
    if (number) return pulls.find((candidate) => candidate.number === Number(number));
    throw new Error(`no route for ${path}`);
  };
  return { api, posts, reads };
}

test("postStatuses posts one status per open pull request, paging through them, and only the named one with --pr", () => {
  const pulls = Array.from({ length: 101 }, (_, index) => pr({ number: index + 1 }));
  const env = { GITHUB_REPOSITORY: "o/r" };
  const red = fakeGitHub({ runs: [run(5, "failure")], pulls });
  const logged = [];
  assert.equal(postStatuses({ env, api: red.api, log: (line) => logged.push(line) }), 101);
  assert.equal(red.posts.length, 101);
  assert.deepEqual(red.posts[0], {
    sha: "sha1",
    context: "main green",
    state: "failure",
    description: "Main is red at sha5: fix main first, or label this red-main-fix if it is the fix.",
    target_url: "https://github.com/o/r/actions/runs/5",
  });
  assert.equal(logged.length, 101);
  const single = fakeGitHub({ runs: [run(5, "success")], pulls });
  assert.equal(postStatuses({ args: ["--pr", "7"], env, api: single.api, log() {} }), 1);
  assert.deepEqual(single.posts, [{ sha: "sha7", context: "main green", state: "success", description: "Main is green.", target_url: "https://github.com/o/r/actions/runs/5" }]);
  assert.ok(single.reads.includes("repos/o/r/pulls/7"));
  assert.ok(!single.reads.some((path) => path.includes("pulls?")));
});

test("postStatuses throws when GitHub cannot be read, and when a status cannot be posted it posts the rest and names the pull request", () => {
  const env = { GITHUB_REPOSITORY: "o/r" };
  assert.throws(() => postStatuses({ env, api: fakeGitHub({ failRuns: true }).api, log() {} }), /HTTP 500/);
  assert.throws(() => postStatuses({ args: ["--pr", "x"], env, api: fakeGitHub().api, log() {} }), /usage: main-green\.mjs/);
  const gh = fakeGitHub({ runs: [run(5, "success")], pulls: [pr({ number: 1 }), pr({ number: 2 })], failPost: "sha1" });
  const logged = [];
  assert.throws(() => postStatuses({ env, api: gh.api, log: (line) => logged.push(line) }), /could not post the main green status on #1$/);
  assert.deepEqual(gh.posts.map(({ sha }) => sha), ["sha2"]);
  assert.match(logged[0], /^::error::#1: could not post the main green status: HTTP 422$/);
});

const FAKE_GH = `import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const method = args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET";
const path = args.find((arg) => arg.startsWith("repos/"));
let body = "";
if (args.includes("--input")) for await (const chunk of process.stdin) body += chunk;
appendFileSync(process.env.CALLS, \`\${method} \${path}\${body ? \` \${body}\` : ""}\\n\`);
const route = JSON.parse(readFileSync(process.env.ROUTES, "utf8"))[\`\${method} \${path}\`];
if (route === undefined || route === "fail") {
  process.stderr.write(\`HTTP 500 for \${method} \${path}\\n\`);
  process.exit(1);
}
process.stdout.write(JSON.stringify(route));
`;

test("the main-green CLI posts each pull request's status through gh, and exits 1 when GitHub cannot be read", () => {
  const dir = scratchDir("ouro-main-green-");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const fake = join(dir, "fake-gh.mjs");
  writeFileSync(fake, FAKE_GH);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  chmodSync(join(bin, "gh"), 0o755);
  const script = join(root, "scripts/main-green.mjs");
  const cli = (name, runs, args) => {
    const routes = join(dir, `${name}.routes.json`);
    const calls = join(dir, `${name}.calls`);
    const open = [pr({ number: 1 }), pr({ number: 2, labels: [{ name: "red-main-fix" }] })];
    writeFileSync(routes, JSON.stringify({
      "GET repos/o/r/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=20": runs === "fail" ? runs : { workflow_runs: runs },
      "GET repos/o/r/pulls?state=open&base=main&per_page=100&page=1": open,
      "GET repos/o/r/pulls/2": open[1],
      "POST repos/o/r/statuses/sha1": {},
      "POST repos/o/r/statuses/sha2": {},
    }));
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: sandboxEnv({ GITHUB_REPOSITORY: "o/r", ROUTES: routes, CALLS: calls }, [bin]) });
    return { ...result, calls: existsSync(calls) ? readFileSync(calls, "utf8") : "" };
  };
  const all = cli("all", [run(5, "failure")], []);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /^#1 main green: failure \(Main is red at sha5: fix main first/m);
  assert.match(all.stdout, /^#2 main green: success \(Main is red; this pull request may merge as its fix\.\)$/m);
  assert.match(all.calls, /^POST repos\/o\/r\/statuses\/sha1 \{"context":"main green","state":"failure"/m);
  assert.match(all.calls, /^POST repos\/o\/r\/statuses\/sha2 \{"context":"main green","state":"success"/m);
  const one = cli("one", [run(5, "failure")], ["--pr", "2"]);
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /^#2 main green: success/m);
  assert.doesNotMatch(one.stdout, /^#1 /m);
  assert.doesNotMatch(one.calls, /pulls\?state/);
  assert.doesNotMatch(one.calls, /statuses\/sha1/);
  const unread = cli("unread", "fail", []);
  assert.equal(unread.status, 1);
  assert.match(unread.stderr, /::error::Command failed: gh api repos\/o\/r\/actions\/workflows\/ci\.yml\/runs/);
});
