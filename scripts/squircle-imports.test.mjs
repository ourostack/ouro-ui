import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const lib = "registry/ouro/lib/ouro";
const files = [
  `${lib}/squircle-polyfill.ts`,
  ...readdirSync(`${lib}/squircle`)
    .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
    .map((f) => `${lib}/squircle/${f}`),
];

test("the squircle sources import their relative files with the .ts extension", () => {
  const bare = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/(?:from|import\()\s*"(\.\.?\/[^"]*)"/g)) {
      if (!m[1].endsWith(".ts")) bare.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(bare, []);
});
