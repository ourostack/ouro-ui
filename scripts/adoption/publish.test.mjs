import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { scratchDir } from "../scratch.mjs";
import { sandboxEnv } from "../sandbox.mjs";

const workflow = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../.github/workflows/adoption-ledger.yml"), "utf8");

/** The shell of one step, as the workflow file has it. */
function stepScript(name) {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  assert.ok(start >= 0, `the workflow has a step named ${name}`);
  const run = lines.findIndex((line, index) => index > start && line.trim() === "run: |");
  const indent = lines[run + 1].match(/^ */)[0];
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && !line.startsWith(indent)) break;
    body.push(line.slice(indent.length));
  }
  return body.join("\n");
}

test("the hourly run publishes a ledger bigger than a command line can hold", () => {
  const dir = scratchDir("adoption-publish-");
  // A ledger past the 1 MiB that argument lists are commonly limited to (ARG_MAX), as base64 grows it by a third.
  const ledger = { summary: { confirmed: 1, total: 2 }, padding: "x".repeat(1_200_000) };
  writeFileSync(join(dir, "ledger.json"), JSON.stringify(ledger));
  // A fake gh: the branch exists, the ledger has a sha, and the PUT's body is kept for the test to read.
  writeFileSync(
    join(dir, "gh"),
    `#!/usr/bin/env bash
case "$*" in
  *"branches/adoption-data"*) echo '{}' ;;
  *"contents/ledger.json?ref=adoption-data"*) echo abc123 ;;
  *"-X PUT"*) while [ $# -gt 0 ]; do [ "$1" = --input ] && cp "$2" "${dir}/sent.json"; shift; done ;;
  *) echo "unexpected: $*" >&2; exit 1 ;;
esac
`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  execFileSync("bash", ["-c", stepScript("Publish to the adoption-data branch")], {
    env: sandboxEnv({ RUNNER_TEMP: dir, REPO: "ourostack/ouro-ui" }, [dir]),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const sent = JSON.parse(readFileSync(join(dir, "sent.json"), "utf8"));
  assert.equal(sent.branch, "adoption-data");
  assert.equal(sent.sha, "abc123", "it replaces the ledger that is there");
  assert.match(sent.message, /^Ledger \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/);
  assert.deepEqual(JSON.parse(Buffer.from(sent.content, "base64").toString("utf8")), ledger);
});

test("the hourly run starts each measurement from the previous search cache on the adoption-data branch", () => {
  const dir = scratchDir("adoption-measure-");
  const cache = { "o/r": { q: { commit: "abc123", at: "2026-11-13T00:00:00Z", total: 1, paths: ["a"] } } };
  writeFileSync(
    join(dir, "gh"),
    `#!/usr/bin/env bash
case "$*" in
  *"contents/search-cache.json?ref=adoption-data"*"--jq .content"*) echo '${Buffer.from(JSON.stringify(cache)).toString("base64")}' ;;
  *) echo "unexpected: $*" >&2; exit 1 ;;
esac
`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  writeFileSync(
    join(dir, "node"),
    `#!/usr/bin/env bash
echo "$*" >> "$RUNNER_TEMP/node-calls"
cp "$RUNNER_TEMP/search-cache.json" "$RUNNER_TEMP/was-fed.json"
echo '{"summary":{"confirmed":0,"total":0,"unmeasuredCells":0}}' > "$RUNNER_TEMP/ledger.json"
echo '{"done":true}' > "$RUNNER_TEMP/search-cache.json"
`,
  );
  chmodSync(join(dir, "node"), 0o755);
  execFileSync("bash", ["-c", stepScript("Measure")], { env: sandboxEnv({ RUNNER_TEMP: dir, REPO: "ourostack/ouro-ui" }, [dir]), stdio: ["ignore", "pipe", "pipe"] });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "was-fed.json"), "utf8")), cache, "the previous cache reached ledger.mjs unchanged");
  const call = readFileSync(join(dir, "node-calls"), "utf8").trim();
  assert.match(call, /--search-cache-in \S*search-cache\.json/);
  assert.match(call, /--search-cache-out \S*search-cache\.json/);
});

test("the hourly run starts from an empty search cache the first time, before adoption-data has one", () => {
  const dir = scratchDir("adoption-measure-");
  writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\nexit 1\n`);
  chmodSync(join(dir, "gh"), 0o755);
  writeFileSync(
    join(dir, "node"),
    `#!/usr/bin/env bash
cp "$RUNNER_TEMP/search-cache.json" "$RUNNER_TEMP/was-fed.json"
echo '{"summary":{"confirmed":0,"total":0,"unmeasuredCells":0}}' > "$RUNNER_TEMP/ledger.json"
echo '{}' > "$RUNNER_TEMP/search-cache.json"
`,
  );
  chmodSync(join(dir, "node"), 0o755);
  execFileSync("bash", ["-c", stepScript("Measure")], { env: sandboxEnv({ RUNNER_TEMP: dir, REPO: "ourostack/ouro-ui" }, [dir]), stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(readFileSync(join(dir, "was-fed.json"), "utf8").trim(), "{}", "with no cache file on adoption-data, the run starts from an empty one");
});

test("the hourly run publishes the updated search cache, keyed to the repositories it searched", () => {
  const dir = scratchDir("adoption-publish-cache-");
  const cache = { "o/r": { q: { commit: "abc123", at: "2026-11-13T00:00:00Z", total: 1, paths: ["a"] } } };
  writeFileSync(join(dir, "search-cache.json"), JSON.stringify(cache));
  writeFileSync(
    join(dir, "gh"),
    `#!/usr/bin/env bash
case "$*" in
  *"contents/search-cache.json?ref=adoption-data"*) echo abc123 ;;
  *"-X PUT"*) while [ $# -gt 0 ]; do [ "$1" = --input ] && cp "$2" "${dir}/sent.json"; shift; done ;;
  *) echo "unexpected: $*" >&2; exit 1 ;;
esac
`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  execFileSync("bash", ["-c", stepScript("Publish the code search cache to the adoption-data branch")], {
    env: sandboxEnv({ RUNNER_TEMP: dir, REPO: "ourostack/ouro-ui" }, [dir]),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const sent = JSON.parse(readFileSync(join(dir, "sent.json"), "utf8"));
  assert.equal(sent.branch, "adoption-data");
  assert.equal(sent.sha, "abc123", "it replaces the search cache that is there");
  assert.deepEqual(JSON.parse(Buffer.from(sent.content, "base64").toString("utf8")), cache);
  const steps = [...workflow.matchAll(/- name: (.+)/g)].map((match) => match[1]);
  assert.ok(
    steps.indexOf("Publish the code search cache to the adoption-data branch") > steps.indexOf("Publish to the adoption-data branch"),
    "it publishes the search cache after the ledger",
  );
});

test("the hourly run rebuilds the site after it publishes, so /adoption/ opens on that hour's ledger", () => {
  const dir = scratchDir("adoption-pages-");
  writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\necho "$*" >> "${dir}/calls"\n`);
  chmodSync(join(dir, "gh"), 0o755);
  execFileSync("bash", ["-c", stepScript("Rebuild the site with this hour's ledger")], {
    env: sandboxEnv({ REPO: "ourostack/ouro-ui" }, [dir]),
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(readFileSync(join(dir, "calls"), "utf8").trim(), "workflow run pages.yml --repo ourostack/ouro-ui --ref main");
  const steps = [...workflow.matchAll(/- name: (.+)/g)].map((match) => match[1]);
  assert.ok(steps.indexOf("Rebuild the site with this hour's ledger") > steps.indexOf("Publish to the adoption-data branch"), "it rebuilds after it publishes");
  assert.match(workflow, /actions: write # to rebuild the site/);
});
