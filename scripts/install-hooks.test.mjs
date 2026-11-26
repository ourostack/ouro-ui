import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { installHooks } from "./install-hooks.mjs";
import { main, pullRequestText, pushedBranch, queuedPullRequest } from "./pre-push.mjs";
import { scratchDir } from "./scratch.mjs";
import { sandboxEnv } from "./sandbox.mjs";

const repo = () => {
  const dir = scratchDir("ouro-hooks-");
  spawnSync("git", ["init", "-q", dir]);
  return dir;
};

test("install-hooks puts the pre-push hook in the checkout's hooks folder, runnable, and updates its own", () => {
  const dir = repo();
  assert.deepEqual(installHooks(dir, {}), [{ name: "pre-push", done: "installed" }]);
  const hook = join(dir, ".git/hooks/pre-push");
  assert.match(readFileSync(hook, "utf8"), /exec node "\$root\/scripts\/pre-push\.mjs"/);
  assert.equal(statSync(hook).mode & 0o111, 0o111);
  writeFileSync(hook, "#!/bin/sh\n# ouro-ui pre-push hook, an older one\n");
  assert.deepEqual(installHooks(dir, {}), [{ name: "pre-push", done: "installed" }]);
  assert.match(readFileSync(hook, "utf8"), /scripts\/pre-push\.mjs/);
});

test("install-hooks leaves a pre-push hook it did not write alone, and installs nothing in CI", () => {
  const dir = repo();
  const hook = join(dir, ".git/hooks/pre-push");
  mkdirSync(join(dir, ".git/hooks"), { recursive: true });
  writeFileSync(hook, "#!/bin/sh\necho mine\n");
  chmodSync(hook, 0o755);
  assert.deepEqual(installHooks(dir, {}), [{ name: "pre-push", done: "kept" }]);
  assert.equal(readFileSync(hook, "utf8"), "#!/bin/sh\necho mine\n");
  assert.deepEqual(installHooks(repo(), { CI: "true" }), []);
});

test("pre-push takes the branch being pushed from git's lines, so a detached checkout still finds its pull request", () => {
  assert.equal(pushedBranch(`refs/heads/local ${"1".repeat(40)} refs/heads/fix-typo ${"0".repeat(40)}\n`), "fix-typo");
  assert.equal(pushedBranch(`refs/tags/v1 ${"1".repeat(40)} refs/tags/v1 ${"0".repeat(40)}\nrefs/heads/a ${"1".repeat(40)} refs/heads/b ${"0".repeat(40)}\n`), "b");
});

test("pre-push lints the open pull request's title and body, and nothing when gh can't say", () => {
  const gh = (stdout, status = 0) => () => ({ status, stdout });
  assert.deepEqual(pullRequestText("b", gh('{"title":"T","body":"B","state":"OPEN"}')), { title: "T", body: "B" });
  assert.deepEqual(pullRequestText("b", gh('{"title":"T","body":"B","state":"MERGED"}')), { title: "", body: "" });
  assert.deepEqual(pullRequestText("b", gh("", 1)), { title: "", body: "" });
  assert.deepEqual(pullRequestText("b", gh("not json")), { title: "", body: "" });
  assert.deepEqual(pullRequestText("", gh('{"title":"T","body":"B","state":"OPEN"}')), { title: "", body: "" });
  assert.equal(main({ CI: "true" }), 0);
});

test("the pre-push hook stops a push whose pull request the claims lint would fail, and lets a clean one through", () => {
  const bin = scratchDir("ouro-gh-");
  const fake = (body) => {
    writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s' '${JSON.stringify({ title: "Docs: fix a typo", body, state: "OPEN" })}'\n`);
    chmodSync(join(bin, "gh"), 0o755);
    const input = `refs/heads/docs-typo ${"1".repeat(40)} refs/heads/docs-typo ${"0".repeat(40)}\n`;
    return spawnSync(process.execPath, ["scripts/pre-push.mjs"], { input, encoding: "utf8", env: sandboxEnv({ CI: "" }, [bin]) });
  };
  const failing = fake("This pull request makes the site 40 percent faster.");
  assert.notEqual(failing.status, 0, failing.stdout + failing.stderr);
  assert.match(failing.stderr, /git push --no-verify skips this check once/);
  const clean = fake("Fixes a typo in the guide.");
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
});

test("the pre-push hook refuses a push to a pull request in the merge queue, names the fix, and fails open", () => {
  const gh = (stdout, status = 0) => () => ({ status, stdout });
  const answer = (isInMergeQueue) => JSON.stringify({ data: { repository: { pullRequests: { nodes: [{ number: 7, isInMergeQueue }] } } } });
  assert.deepEqual(queuedPullRequest("b", gh(answer(true))), { number: 7 });
  assert.equal(queuedPullRequest("b", gh(answer(false))), null);
  assert.equal(queuedPullRequest("b", gh(JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }))), null);
  assert.ok(queuedPullRequest("b", gh("", 1)).unknown);
  assert.ok(queuedPullRequest("b", gh("not json")).unknown);
  assert.ok(queuedPullRequest("b", gh("{}")).unknown);

  const bin = scratchDir("ouro-gh-queue-");
  const push = (script) => {
    writeFileSync(join(bin, "gh"), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, "gh"), 0o755);
    const input = `refs/heads/docs-typo ${"1".repeat(40)} refs/heads/docs-typo ${"0".repeat(40)}\n`;
    return spawnSync(process.execPath, ["scripts/pre-push.mjs"], { input, encoding: "utf8", env: sandboxEnv({ CI: "" }, [bin]) });
  };
  const view = JSON.stringify({ title: "Docs: fix a typo", body: "Fixes a typo in the guide.", state: "OPEN" });
  const fake = (queued) => `if [ "$1" = api ]; then printf '%s' '${answer(queued)}'; else printf '%s' '${view}'; fi`;
  const queued = push(fake(true));
  assert.notEqual(queued.status, 0, queued.stdout + queued.stderr);
  assert.match(queued.stderr, /#7 is in the merge queue/);
  assert.match(queued.stderr, /gh pr merge 7 --disable-auto/);
  assert.match(queued.stderr, /git push --no-verify skips this check once/);
  const out = push(fake(false));
  assert.equal(out.status, 0, out.stdout + out.stderr);
  const broken = push(`if [ "$1" = api ]; then exit 1; else printf '%s' '${view}'; fi`);
  assert.equal(broken.status, 0, broken.stdout + broken.stderr);
  assert.match(broken.stderr, /Merge queue check skipped: gh could not answer/);
});
