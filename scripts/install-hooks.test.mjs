import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { installHooks } from "./install-hooks.mjs";
import { main, pullRequestText, pushedBranch } from "./pre-push.mjs";
import { scratchDir } from "./scratch.mjs";

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
    return spawnSync(process.execPath, ["scripts/pre-push.mjs"], { input, encoding: "utf8", env: { ...process.env, CI: "", PATH: `${bin}:${process.env.PATH}` } });
  };
  const failing = fake("This pull request makes the site 40 percent faster.");
  assert.notEqual(failing.status, 0, failing.stdout + failing.stderr);
  assert.match(failing.stderr, /git push --no-verify skips this check once/);
  const clean = fake("Fixes a typo in the guide.");
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
});
