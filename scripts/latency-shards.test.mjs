import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { LATENCY_SHARDS, latencySpecs, shardArgs, shardPaths } from "./latency-shards.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("every latency spec file runs in exactly one shard, or is split by title between two, and no shard names a file that is gone", () => {
  const listed = LATENCY_SHARDS.filter((shard) => !shard.grep && !shard.grepInvert).flatMap((shard) => shard.files);
  const split = LATENCY_SHARDS.filter((shard) => shard.grep || shard.grepInvert).flatMap((shard) => shard.files);
  assert.deepEqual([...new Set([...listed, ...split])].sort(), latencySpecs());
  assert.equal(new Set(listed).size, listed.length);
  assert.ok(!listed.some((file) => split.includes(file)));
  for (const file of new Set(split)) {
    const shards = LATENCY_SHARDS.filter((shard) => shard.files.includes(file));
    assert.equal(shards.length, 2, file);
    assert.equal(shards.filter((shard) => shard.grep).length, 1, file);
    assert.equal(shards.filter((shard) => shard.grepInvert).length, 1, file);
    assert.equal(shards[0].grep ?? shards[0].grepInvert, shards[1].grep ?? shards[1].grepInvert, file);
  }
});

test("Chapter III's first shard runs exactly the controls it names, and its second every other test in the file", () => {
  const source = readFileSync(join(root, "site/e2e/chapter-three.latency.spec.ts"), "utf8");
  const copy = readFileSync(join(root, "site/src/voyage/chapters/chapter-three-copy.ts"), "utf8");
  const controls = copy.match(/CHAPTER_THREE_CONTROLS = \[([^\]]+)\]/)[1].split(",").map((name) => name.trim().replaceAll('"', ""));
  const orders = [...source.matchAll(/^ {2}"([^"]+)": \{$/gm)].map((match) => match[1]).filter((name) => /,/.test(name));
  const titles = [...controls, ...orders].map((id) => `${id} answers within 100 ms`);
  const first = LATENCY_SHARDS.find((shard) => shard.grep).grep;
  const matched = titles.filter((title) => new RegExp(first).test(title));
  assert.deepEqual(matched.map((title) => title.split(" ")[0]), ["encounter-code", "alarm", "orders", "palette", "feathers", "surface", "saloon-code"]);
  assert.ok(orders.length > 0 && matched.every((title) => !orders.some((order) => title.startsWith(order))));
});

test("a shard past 300 seconds of measured work is no longer worth its runner: rebalance", () => {
  for (const shard of LATENCY_SHARDS) assert.ok(shard.seconds <= 300, shard.files.join(", "));
});

test("shardPaths gives the shard's files as paths, shardArgs adds its title filter, and both refuse a shard that does not exist", () => {
  assert.deepEqual(shardPaths(5), ["site/e2e/stage.latency.spec.ts", "site/e2e/stage-switch.latency.spec.ts"]);
  assert.deepEqual(shardArgs(5), shardPaths(5));
  assert.equal(shardArgs(1)[1], `--grep=${LATENCY_SHARDS[0].grep}`);
  assert.equal(shardArgs(2)[1], `--grep-invert=${LATENCY_SHARDS[1].grepInvert}`);
  assert.throws(() => shardArgs(0), /does not exist/);
  assert.throws(() => shardPaths(0), /does not exist/);
  assert.throws(() => shardPaths(LATENCY_SHARDS.length + 1), /does not exist/);
});

test("ci.yml runs one latency shard per entry, each over its own spec files", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const shards = workflow.match(/^ {4}name: latency \(\$\{\{ matrix\.shard \}\}\/(\d+)\)\n[\s\S]*?^ {8}shard: \[([\d, ]+)\]$/m);
  assert.deepEqual(shards[2].split(",").map(Number), LATENCY_SHARDS.map((_, index) => index + 1));
  assert.equal(Number(shards[1]), LATENCY_SHARDS.length);
});
