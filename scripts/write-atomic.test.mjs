import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { scratchDir } from "./scratch.mjs";
import { writeAtomic } from "./write-atomic.mjs";

test("writeAtomic replaces the file and leaves nothing beside it", () => {
  const dir = scratchDir("ouro-write-atomic-");
  const path = join(dir, "registry.json");
  writeFileSync(path, "old");
  writeAtomic(path, "new");
  assert.equal(readFileSync(path, "utf8"), "new");
  assert.deepEqual(readdirSync(dir), ["registry.json"]);
});

test("a reader in another process never sees a file writeAtomic is rewriting cut short (#1615)", async () => {
  const dir = scratchDir("ouro-write-atomic-");
  const path = join(dir, "registry.json");
  const done = join(dir, "done");
  const text = `${JSON.stringify({ items: Array.from({ length: 20_000 }, (_, index) => ({ name: `item-${index}` })) })}\n`;
  writeFileSync(path, text);
  const helper = pathToFileURL(join(import.meta.dirname, "write-atomic.mjs")).href;
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import { readFileSync, writeFileSync } from "node:fs";
    import { writeAtomic } from ${JSON.stringify(helper)};
    const text = readFileSync(${JSON.stringify(path)}, "utf8");
    for (let round = 0; round < 60; round++) writeAtomic(${JSON.stringify(path)}, text);
    writeFileSync(${JSON.stringify(done)}, "");
  `]);
  const exited = new Promise((resolve) => writer.on("exit", resolve));
  let reads = 0;
  const started = Date.now();
  while (!existsSync(done) && Date.now() - started < 60_000) {
    assert.equal(readFileSync(path, "utf8").length, text.length, `read ${reads + 1} was cut short`);
    reads++;
  }
  assert.equal(await exited, 0);
  assert.ok(reads > 0);
});
