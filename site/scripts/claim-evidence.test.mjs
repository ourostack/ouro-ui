import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { stripClaimEvidence } from "./claim-evidence.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("a built page keeps each claim's words and drops its sources and checks, in TS and JSX alike", () => {
  const source = [
    'import { claim } from "@/registry/ouro/lib/ouro/claims";',
    'export const A = claim("It’s “quoted”, and it holds.", { source: { file: "a.ts" }, verify: [{ fileLine: "a.ts", pattern: "x" }] });',
    'export const B = <p>{claim("Nested", { source: { file: "b" }, verify: { fileLine: "b", pattern: "y" } })} after</p>;',
  ].join("\n");
  const out = stripClaimEvidence(source, "x.tsx");
  assert.match(out, /claim\("It’s “quoted”, and it holds\."\)/);
  assert.match(out, /\{claim\("Nested"\)\} after/);
  assert.doesNotMatch(out, /fileLine|verify|source:/);
});

test("a call named claim that is not the claims module's, or a module without one, is left alone", () => {
  const other = 'import { claim } from "./elsewhere";\nclaim("x", { keep: true });';
  assert.equal(stripClaimEvidence(other, "y.ts"), other);
  const renamed = 'import { claim as sourced } from "../lib/ouro/claims";\nconst claim = (a, b) => b;\nsourced("x", { a: 1 }); claim("y", { keep: 2 });';
  assert.equal(stripClaimEvidence(renamed, "z.ts"), 'import { claim as sourced } from "../lib/ouro/claims";\nconst claim = (a, b) => b;\nsourced("x"); claim("y", { keep: 2 });');
});

test("the home page's copy loses its evidence and keeps every sentence", () => {
  for (const file of ["site/src/copy.ts", "site/src/voyage/why-copy.ts", "site/src/voyage/story-copy.ts"]) {
    const source = readFileSync(join(root, file), "utf8");
    const out = stripClaimEvidence(source, file);
    assert.ok(out.length < source.length * 0.7, `${file} shrank only to ${out.length} of ${source.length}`);
    assert.doesNotMatch(out, /verify:/, file);
    for (const [, text] of source.matchAll(/claim\(\s*("(?:[^"\\]|\\.)*")/g)) assert.ok(out.includes(`claim(${text})`), `${file} kept ${text}`);
  }
});
