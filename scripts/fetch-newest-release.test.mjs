import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { sandboxEnv } from "./sandbox.mjs";
import { scratchDir } from "./scratch.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function run(mode) {
  const dir = scratchDir("ouro-release-tag-");
  const bin = join(dir, "bin"), temp = join(dir, "temp"), calls = join(dir, "calls");
  mkdirSync(bin);
  mkdirSync(temp);
  writeFileSync(calls, "");
  writeFileSync(join(bin, "git"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CALLS"
attempt=$(grep -c "^$1 " "$CALLS")
case "$1" in
  ls-remote)
    if [[ "$MODE" == lookup-fails || ( "$MODE" == recover && "$attempt" == 1 ) ]]; then
      printf '1111111\\trefs/tags/v99.0.0\\n'
      echo "synthetic transport failure" >&2
      exit 73
    fi
    if [ "$MODE" != empty ]; then
      printf 'aaaaaaa\\trefs/heads/main\\n1111111\\trefs/tags/v1.9.0\\n2222222\\trefs/tags/v1.10.0\\n'
    fi
    ;;
  fetch)
    if [[ "$MODE" == fetch-fails || ( "$MODE" == recover && "$attempt" == 1 ) ]]; then exit 74; fi
    ;;
  *) exit 97 ;;
esac
`, { mode: 0o755 });
  const result = spawnSync("bash", ["scripts/fetch-newest-release.sh"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    env: sandboxEnv({ MODE: mode, CALLS: calls, TMPDIR: temp, RETRY_DELAYS: "0" }, [bin]),
  });
  assert.equal(result.error, undefined, JSON.stringify({ stdout: result.stdout, stderr: result.stderr, calls: readFileSync(calls, "utf8") }));
  assert.deepEqual(readdirSync(temp), [], "the lookup tempfile is removed on success and failure");
  return { ...result, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).map(line => line.split(" ")) };
}

const fetchArgs = ["fetch", "--quiet", "--no-tags", "--depth=1", "origin", "refs/tags/v1.10.0:refs/tags/v1.10.0"];

test("the release baseline fetches the newest version tag and names the fetched tag", () => {
  const result = run("normal");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.calls, [["ls-remote", "--tags", "--refs", "origin", "refs/tags/v*"], fetchArgs]);
  assert.equal(result.stdout, "Fetched newest release tag v1.10.0.\n");
});

test("the release baseline retries transport calls without parsing partial output or retry messages as tags", () => {
  const result = run("recover");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.calls.map(call => call[0]), ["ls-remote", "ls-remote", "fetch", "fetch"]);
  assert.deepEqual(result.calls.slice(2), [fetchArgs, fetchArgs]);
  assert.match(result.stdout, /trying again/);
  assert.match(result.stdout, /Fetched newest release tag v1\.10\.0\./);
});

test("the release baseline propagates an exhausted lookup failure and never fetches a partial tag", () => {
  const result = run("lookup-fails");
  assert.equal(result.status, 73);
  assert.deepEqual(result.calls.map(call => call[0]), ["ls-remote", "ls-remote"]);
  assert.match(result.stdout, /failed 2 times/);
});

test("the release baseline propagates an exhausted fetch failure without reporting success", () => {
  const result = run("fetch-fails");
  assert.equal(result.status, 74);
  assert.deepEqual(result.calls, [result.calls[0], fetchArgs, fetchArgs]);
  assert.doesNotMatch(result.stdout, /Fetched newest release tag/);
});

test("the release baseline refuses an empty successful lookup before making a fetch", () => {
  const result = run("empty");
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls.map(call => call[0]), ["ls-remote"]);
  assert.match(result.stderr, /lookup returned no version tags.*Run git ls-remote/);
});
