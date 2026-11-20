import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { kitPins, median, stat } from "./measure.mjs";
import { scratchDir } from "../scratch.mjs";

const run = (dir, ...args) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" });

test("upkeep: median skips missing values and averages the middle pair", () => {
  assert.equal(median([3, null, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([null]), null);
});

test("upkeep: a kit's pins are the commits that change the core tag, with the files and lines each touched", () => {
  const dir = scratchDir("ouro-upkeep-");
  run(dir, "init", "-q", "-b", "main");
  const pin = (tag, extra) => {
    writeFileSync(join(dir, "core-provenance.json"), JSON.stringify({ coreTag: tag }));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.txt"), extra);
    run(dir, "add", "-A");
    run(dir, "commit", "-q", "-m", `pin ${tag}`);
  };
  pin("v0.1.0", "one\n");
  pin("v0.1.0", "two\n");
  pin("v0.2.0", "three\nfour\n");
  const pins = kitPins("kit", dir, "core-provenance.json");
  assert.deepEqual(pins.map((p) => p.tag), ["v0.1.0", "v0.2.0"]);
  assert.deepEqual(stat(dir, `${pins[1].sha}^..${pins[1].sha}`), { files: 2, lines: 5 });
});
