import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { LATENCY_SHARDS, latencySpecs, shardPaths } from "./latency-shards.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("every latency spec file runs in exactly one shard, and no shard names a file that is gone", () => {
  const listed = LATENCY_SHARDS.flatMap((shard) => shard.files);
  assert.deepEqual([...listed].sort(), latencySpecs());
  assert.equal(new Set(listed).size, listed.length);
});

test("a shard past 300 seconds of measured work is no longer worth its runner: rebalance", () => {
  for (const shard of LATENCY_SHARDS) assert.ok(shard.seconds <= 300, shard.files.join(", "));
});

test("shardPaths gives the shard's files as paths, and refuses a shard that does not exist", () => {
  assert.deepEqual(shardPaths(2), ["site/e2e/chapter-two.latency.spec.ts", "site/e2e/site-menu.latency.spec.ts"]);
  assert.throws(() => shardPaths(0), /does not exist/);
  assert.throws(() => shardPaths(LATENCY_SHARDS.length + 1), /does not exist/);
});

test("ci.yml runs one latency shard per entry, each over its own spec files", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const shards = workflow.match(/^ {4}name: latency \(\$\{\{ matrix\.shard \}\}\/(\d+)\)\n[\s\S]*?^ {8}shard: \[([\d, ]+)\]$/m);
  assert.deepEqual(shards[2].split(",").map(Number), LATENCY_SHARDS.map((_, index) => index + 1));
  assert.equal(Number(shards[1]), LATENCY_SHARDS.length);
});
