import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { scratchDir } from "../scratch.mjs";
import { sameCases } from "./table.mjs";

test("sameCases counts the case files a kit holds byte for byte, and names the ones that differ", () => {
  const dir = scratchDir("cross-kit");
  const core = join(dir, "core");
  const kit = join(dir, "kit");
  mkdirSync(core);
  mkdirSync(kit);
  writeFileSync(join(core, "a.json"), "{}");
  writeFileSync(join(core, "b.json"), "{}");
  writeFileSync(join(kit, "a.json"), "{}");
  writeFileSync(join(kit, "b.json"), '{"x":1}');
  assert.deepEqual(sameCases(core, kit), { cases: 2, same: 1, differing: ["b.json"] });
});
