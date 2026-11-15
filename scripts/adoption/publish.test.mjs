import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

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

test("the hourly run publishes a ledger bigger than a command line can hold", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "adoption-publish-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
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
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir, REPO: "ourostack/ouro-ui", GH_TOKEN: "x" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const sent = JSON.parse(readFileSync(join(dir, "sent.json"), "utf8"));
  assert.equal(sent.branch, "adoption-data");
  assert.equal(sent.sha, "abc123", "it replaces the ledger that is there");
  assert.match(sent.message, /^Ledger \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/);
  assert.deepEqual(JSON.parse(Buffer.from(sent.content, "base64").toString("utf8")), ledger);
});
