// first-run-uia-tree.cs runs only on a real Windows machine (it calls System.Windows.Automation), so nothing else in
// this file's test checks its UI Automation calls. LastLook, the helper the extra-menu case uses to look among the
// desktop's children before the full tree, takes no Windows-only type, so this file runs the method's own source,
// extracted verbatim from the production file, in a tiny portable harness with dotnet: a fixture proves the slow
// fallback is never called when the fast look already has a hit, and is called exactly once as a last look when it
// doesn't.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { scratchDir } from "../scratch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const csPath = path.join(root, "registry/ouro/check/first-run-uia-tree.cs");

/** The named method's full source, signature through its matching closing brace, read out of `source` so the harness
 * runs the production file's own code and can never drift from a pasted copy. */
function extractMethod(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `expected to find "${signature}" in ${csPath}`);
  const openBrace = source.indexOf("{", start);
  let depth = 0;
  let end = openBrace;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    else if (source[end] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0 && end > openBrace, `expected a balanced method body for "${signature}" in ${csPath}`);
  return source.slice(start, end + 1);
}

/** Runs LastLook<string>(fast, tries, delayMs, slow) in a standalone dotnet process, with `fast` and `slow` fixtures
 * written as C# in the harness, and returns its one line of stdout. */
function runLastLook(dir: string, lastLook: string, fastBody: string, slowBody: string, tries = 3): string {
  const harness = `#nullable disable
using System;
using System.Threading;
static class Harness {
  ${lastLook}
  static int slowCalls = 0;
  static string Fast() { ${fastBody} }
  static string Slow() { slowCalls++; ${slowBody} }
  static void Main() {
    var hit = LastLook<string>(Fast, ${tries}, 1, Slow);
    Console.WriteLine(hit + "|" + slowCalls);
  }
}
`;
  const file = path.join(dir, "harness.cs");
  fs.writeFileSync(file, harness);
  const out = execFileSync("dotnet", ["run", file], { encoding: "utf8", cwd: dir, env: { ...process.env, DOTNET_NOLOGO: "1" } });
  const lines = out.trim().split("\n");
  return lines.at(-1)!.trim();
}

describe("first-run-uia-tree.cs: LastLook, the children-first-then-descendants search order", () => {
  const lastLook = extractMethod(fs.readFileSync(csPath, "utf8"), "static T LastLook<T>(Func<T> fast, int tries, int delayMs, Func<T> slow) where T : class");

  test("a fast hit on the first try returns at once, without ever calling the slow fallback", () => {
    const dir = scratchDir("ouro-last-look-");
    const out = runLastLook(dir, lastLook, 'return "menu";', 'throw new Exception("slow must not run when fast already has the hit");');
    assert.equal(out, "menu|0");
  });

  test("a fast search that never hits falls back to the slow search, exactly once, as a last look", () => {
    const dir = scratchDir("ouro-last-look-");
    const out = runLastLook(dir, lastLook, "return null;", 'return "found-in-full-tree";');
    assert.equal(out, "found-in-full-tree|1");
  });
});
