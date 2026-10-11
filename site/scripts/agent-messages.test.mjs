import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(root, "site/scripts/agent-messages.mts");
const run = (...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8" });
const committed = join(root, "site/src/generated/agent-messages.json");

test("the committed compiler output for the landing page is up to date", () => {
  const result = run("--check");
  assert.equal(result.status, 0, result.stderr);
});

test("every example is a real type error, quoted as tsc prints it, with the prop's declaration from Button's source", () => {
  const output = JSON.parse(readFileSync(committed, "utf8"));
  for (const [id, entry] of Object.entries(output)) {
    assert.match(entry.error, /^error TS\d+: /, id);
    assert.equal(entry.source.file, "components/ouro/button/button.tsx", id);
    assert.ok(entry.source.doc.length > 0, id);
    assert.match(entry.source.code, new RegExp(`^${id}\\??:`), id);
  }
});

test("--check fails when the output is stale", () => {
  const out = join(mkdtempSync(join(tmpdir(), "ouro-agent-")), "agent-messages.json");
  writeFileSync(out, "{}\n");
  const result = run("--check", "--out", out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale/);
  assert.equal(run("--out", out).status, 0);
  assert.equal(run("--check", "--out", out).status, 0);
});
