import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { walkArgvEntries } from "./argv-entries.mts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "entries");
// The real-harness tests run against an ourostack/ouroboros checkout named by OURO_CENSUS_HARNESS, built with npm run build.
const repo = resolve(process.env.OURO_CENSUS_HARNESS ?? join(here, "no-harness"));
const CLAIM = { entry: "src/ouro-entry.mts", parser: "src/parse.ts" };

function walk(claims = [CLAIM]) {
  return walkArgvEntries({ product: "harness", module: "dist", source: "src", root: fixtures, claims });
}

function lineOf(file: string, text: string): number {
  return readFileSync(join(fixtures, file), "utf8").split("\n").findIndex((l) => l.includes(text)) + 1;
}

test("every module that reads process.argv and runs on load is a door, named as an agent runs it", async () => {
  const { doors, errors } = await walk();
  deepEqual(errors, []);
  deepEqual(
    doors.map((d) => [d.id, d.file, d.line]),
    [
      ["cli:node dist/alias-entry.js", "src/alias-entry.ts", lineOf("src/alias-entry.ts", "= process")],
      ["cli:node dist/bracket-entry.js", "src/bracket-entry.ts", lineOf("src/bracket-entry.ts", 'process["argv"]')],
      ["cli:node dist/daemon-entry.js", "src/daemon-entry.ts", lineOf("src/daemon-entry.ts", "= process.argv")],
      ["cli:node dist/global-entry.js", "src/global-entry.ts", lineOf("src/global-entry.ts", "(globalThis")],
      ["cli:node dist/lone-entry.js", "src/lone-entry.ts", lineOf("src/lone-entry.ts", "(process.argv")],
      ["cli:node dist/ouro-entry.mjs rescue", "src/ouro-entry.mts", lineOf("src/ouro-entry.mts", '=== "rescue"')],
      ["cli:node dist/stats-main.js", "src/stats-main.ts", lineOf("src/stats-main.ts", "(process.argv")],
      ["cli:node dist/stats-main.js summary", "src/stats.ts", lineOf("src/stats.ts", '"summary"')],
      ["cli:node dist/stats-main.js export", "src/stats.ts", lineOf("src/stats.ts", '"export"')],
    ],
  );
  for (const door of doors) {
    equal(door.kind, "cli");
    equal(door.card, null);
    deepEqual(door.evidence, { confirmed: false, kinds: [] });
  }
});

test("a claimed entry that reaches its parser is left to that parser's walker, except words the parser never mentions", async () => {
  const { doors } = await walk();
  deepEqual(
    doors.filter((d) => d.id.includes("ouro-entry")).map((d) => [d.id, d.file, d.line]),
    [["cli:node dist/ouro-entry.mjs rescue", "src/ouro-entry.mts", lineOf("src/ouro-entry.mts", '=== "rescue"')]],
  );
  const unclaimed = await walk([]);
  ok(unclaimed.doors.some((d) => d.id === "cli:node dist/ouro-entry.mjs"));
});

test("a claim on a module that isn't an entry, or one that doesn't import its parser, is a census error", async () => {
  const { errors } = await walk([CLAIM, { entry: "src/helper.ts", parser: "src/parse.ts" }, { entry: "src/lone-entry.ts", parser: "src/parse.ts" }]);
  deepEqual(errors, [
    "argv-entries: src/helper.ts is claimed, but it isn't an argv entry point under src",
    "argv-entries: src/lone-entry.ts is claimed by src/parse.ts, but never imports it",
  ]);
});

test("an entry point's card and evidence come from its declaration, and a stale declaration is a census error", async () => {
  const { doors, errors } = await walkArgvEntries({ product: "harness", module: "dist", source: "src", root: fixtures, claims: [CLAIM], cards: "entry-points.cjs#ENTRY_POINTS" });
  deepEqual(errors, []);
  const summary = doors.find((d) => d.id === "cli:node dist/stats-main.js summary")!;
  equal(summary.card!.effect, "read");
  equal(summary.description, "Summarise the stats.");
  // no-stats is a literal in stats.ts, the file the summary word is compared in.
  deepEqual(summary.evidence, { confirmed: false, kinds: [], readOnly: true, raises: ["no-stats"] });
  equal(doors.find((d) => d.id === "cli:node dist/lone-entry.js")!.card, null);
  const stale = await walkArgvEntries({ product: "harness", module: "dist", source: "src", root: fixtures, claims: [CLAIM], cards: "entry-points.cjs#STALE" });
  deepEqual(stale.errors, ["cli:node dist/gone.js: declared in entry-points.cjs#STALE, but no walked path reaches it. Fix: remove the declaration, or make the parser accept its words."]);
  const bad = await walkArgvEntries({ product: "harness", module: "dist", source: "src", root: fixtures, claims: [CLAIM], cards: "entry-points.cjs" });
  deepEqual(bad.errors, ["cards entry-points.cjs: give it as <module>#<export>."]);
});

test("the real harness: the four hand-written CLIs are doors and the ouro entry points are claimed", { skip: existsSync(join(repo, "src")) ? false : "no harness source" }, async () => {
  const { doors, errors } = await walkArgvEntries({
    product: "harness",
    module: "dist",
    source: "src",
    root: repo,
    claims: [
      { entry: "src/heart/daemon/ouro-entry.ts", parser: "src/heart/daemon/cli-parse.ts" },
      { entry: "src/heart/daemon/ouro-bot-entry.ts", parser: "src/heart/daemon/cli-parse.ts" },
    ],
  });
  deepEqual(errors, []);
  for (const main of ["heart/session-stats-cli-main", "heart/session-playback-cli-main", "heart/session-redaction-repair-cli-main", "nerves/review/cli-main"]) {
    ok(doors.some((d) => d.id === `cli:node dist/${main}.js`), main);
  }
  ok(!doors.some((d) => d.id.includes("ouro-entry") || d.id.includes("ouro-bot-entry")));
  ok(!doors.some((d) => d.file.includes("__tests__")));
});

test("a skipped folder's entry points are another product's doors: left out, and reported as excluded", async () => {
  const at = join(here, "fixtures", "entries-vendored");
  const walkAt = (skip?: string[]) => walkArgvEntries({ product: "harness", module: "dist", source: "src", root: at, ...(skip ? { skip } : {}) });
  const all = await walkAt();
  deepEqual(all.doors.map((d) => d.id), ["cli:node dist/own-entry.js", "cli:node dist/vendor/kit/kit-entry.js", "cli:node dist/vendor/own/own-tool.js"]);
  const skipped = await walkAt(["src/vendor/kit/", "src/vendor/kit"]);
  deepEqual(skipped.errors, []);
  deepEqual(skipped.doors.map((d) => d.id), ["cli:node dist/own-entry.js", "cli:node dist/vendor/own/own-tool.js"]);
  deepEqual(skipped.excluded, [{ hit: "src/vendor/kit", category: "vendored" }]);
});

test("a skip proves itself: a folder holding a file the lock doesn't pin at its sha256 stays counted", async () => {
  const unpinned = (folder: string, file: string) => `argv-entries: skip ${folder} holds ${file}, which upstream-sources.lock.json doesn't pin at its current sha256. Fix: vendor the folder through upstream-sources.lock.json, or drop the skip so its doors count.`;
  const vendored = join(here, "fixtures", "entries-vendored");
  for (const folder of ["src/vendor/own", "src/vendor"]) {
    const { errors, excluded, doors } = await walkArgvEntries({ product: "harness", module: "dist", source: "src", root: vendored, skip: [folder] });
    deepEqual(errors, [unpinned(folder, "src/vendor/own/own-tool.ts")]);
    deepEqual(excluded, []);
    equal(doors.length, 3);
  }
  const unlocked = await walkArgvEntries({ product: "harness", module: "dist", source: "src", root: join(here, "fixtures", "entries-unlocked"), skip: ["src/kit"] });
  deepEqual(unlocked.errors, [unpinned("src/kit", "src/kit/k.ts")]);
});

test("a skip that names no folder under the source is an error that says how to fix the config", async () => {
  const at = join(here, "fixtures", "entries-vendored");
  for (const folder of ["src/no-such", "src", "elsewhere", "src/own-entry.ts"]) {
    const { errors, excluded } = await walkArgvEntries({ product: "harness", module: "dist", source: "src", root: at, skip: [folder] });
    deepEqual(errors, [`argv-entries: skip ${folder} isn't a folder under src. Fix: remove it from the config, or name the folder the vendored code is in.`]);
    deepEqual(excluded, []);
  }
});
