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

test("a kit's log becomes per-case results, and the table shows - where a kit names no case", async () => {
  const { parseCases, caseTable } = await import("./table.mjs");
  const win = parseCases("windows", 'Passed Ouro.Tests.A2UITests.Each_case_resolves_to_its_expect(name: "a.json") [1 ms]\nFailed Ouro.Tests.A2UITests.Each_case_resolves_to_its_expect(name: "b.json")');
  const web = parseCases("web", "✔ core case a.json resolves to its expect (2ms)");
  const apple = parseCases("apple", "2026Z | a.json | pass |\n2026Z | b.json | FAIL |");
  assert.deepEqual([...win], [["a.json", true], ["b.json", false]]);
  assert.deepEqual([...apple], [["a.json", true], ["b.json", false]]);
  assert.equal(caseTable(["a.json", "b.json"], { web, windows: win }), "| Case | web | windows |\n|---|---|---|\n| a.json | pass | pass |\n| b.json | - | FAIL |");
});
