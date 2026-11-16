// A synchronous read of a pipe that returns short reads overflows the heap on Node 24 and 26.8+ (nodejs/node#66341), so no tool reads stdin synchronously.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const run = async (script, args, chunks) => {
  const child = spawn(process.execPath, [join(root, script), ...args]);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const closed = new Promise((resolve) => child.on("close", resolve));
  for (const chunk of chunks) {
    child.stdin.write(chunk);
    await sleep(5);
  }
  child.stdin.end();
  return { status: await closed, stdout, stderr };
};

test("split-items reads every line of input that arrives in small, delayed chunks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-stdin-"));
  try {
    writeFileSync(join(dir, "alpha.json"), JSON.stringify({ files: [1] }));
    writeFileSync(join(dir, "beta.json"), JSON.stringify({ files: [1, 2] }));
    const text = "alpha.json\nbeta.json\n";
    const result = await run("scripts/split-items.mjs", [dir, "1", "0"], text.match(/.{1,3}/gs));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split("\n").sort(), ["alpha.json", "beta.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no tracked file reads stdin synchronously", () => {
  const pattern = /\b(?:readFileSync|readSync|openSync)\(\s*(?:0\b|process\.stdin\.fd|["']\/dev\/stdin["'])/;
  const files = execFileSync("git", ["ls-files", "*.js", "*.cjs", "*.mjs", "*.mts", "*.ts", "*.tsx", "*.sh", "*.yml", "*.md"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const offenders = files.filter((file) => pattern.test(readFileSync(join(root, file), "utf8")));
  assert.deepEqual(offenders, [], "read stdin asynchronously: collect chunks from process.stdin (nodejs/node#66341)");
});
