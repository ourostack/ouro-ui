import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decide, jumpIntervalMs, jumpLabel, lagOf } from "./docs-pin-jump.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-11-27T20:00:00Z");
const hour = 3_600_000;
const ready = {
  pr: { number: 3828, labels: [], isInMergeQueue: false, mergeStateStatus: "CLEAN" },
  problems: [],
  lag: { releases: 7, hours: 1 },
  queueLabels: [[], ["red-main"]],
  lastJumpAt: null,
  now,
};

test("a green pin of only version literals jumps when main's docs are more than 5 releases behind, even if they are fresh", () => {
  assert.equal(decide(ready).jump, true);
  assert.equal(decide({ ...ready, lag: { releases: 5, hours: 1 } }).jump, false);
  assert.equal(decide({ ...ready, lag: { releases: 6, hours: 1 } }).jump, true);
});

test("a green pin jumps when main's docs are more than 3 hours behind, even by one release", () => {
  assert.equal(decide({ ...ready, lag: { releases: 1, hours: 3.1 } }).jump, true);
  assert.equal(decide({ ...ready, lag: { releases: 1, hours: 3 } }).jump, false);
});

test("a pin whose checks have not passed, that is queued, or that already jumped, stays where it is", () => {
  assert.match(decide({ ...ready, pr: { ...ready.pr, mergeStateStatus: "BLOCKED" } }).reason, /checks have not passed/);
  assert.match(decide({ ...ready, pr: { ...ready.pr, isInMergeQueue: true } }).reason, /already in the queue/);
  assert.match(decide({ ...ready, pr: { ...ready.pr, labels: [jumpLabel] } }).reason, /already has pin-jumped/);
  assert.match(decide({ ...ready, pr: null }).reason, /no docs pin/);
});

test("a pull request that changes more than the version literals never jumps", () => {
  const verdict = decide({ ...ready, problems: ["registry/ouro/x.tsx is not a file the docs pin changes"] });
  assert.equal(verdict.jump, false);
  assert.match(verdict.reason, /more than the pin's version literals/);
});

test("it never jumps while a red-main-fix pull request is in the queue", () => {
  const verdict = decide({ ...ready, queueLabels: [["red-main-fix"], []] });
  assert.equal(verdict.jump, false);
  assert.match(verdict.reason, /red-main-fix/);
});

test("it jumps at most once an hour across the repository", () => {
  assert.equal(decide({ ...ready, lastJumpAt: now - jumpIntervalMs + 1000 }).jump, false);
  assert.equal(decide({ ...ready, lastJumpAt: now - jumpIntervalMs }).jump, true);
});

test("lagOf counts the releases newer than main's tag and the hours since the oldest was published", () => {
  const releases = [
    { tag: "v1.0.3", publishedAt: now - hour },
    { tag: "v1.0.2", publishedAt: now - 4 * hour },
    { tag: "v1.0.1", publishedAt: now - 9 * hour },
  ];
  assert.deepEqual(lagOf("v1.0.1", releases, now), { releases: 2, hours: 4 });
  assert.deepEqual(lagOf("v1.0.3", releases, now), { releases: 0, hours: 0 });
});

test("the Docs pin jump workflow runs the script on a schedule and when CI ends on the pin's branch, with the app's token", () => {
  const text = readFileSync(join(root, ".github/workflows/docs-pin-jump.yml"), "utf8");
  assert.match(text, /^permissions: \{\}$/m);
  assert.match(text, /workflow_run:\n {4}workflows: \[CI\]/);
  assert.match(text, /head_branch == 'docs\/point-at-release'/);
  assert.match(text, /GH_TOKEN: \$\{\{ steps\.app\.outputs\.token \|\| secrets\.DOCS_PIN_TOKEN \|\| github\.token \}\}\n {8}run: node scripts\/docs-pin-jump\.mjs/);
  assert.match(readFileSync(join(root, ".github/workflows/docs-pin.yml"), "utf8"), /--remove-label pin-jumped/);
});

test("every pin workflow authors its commit as the app that opens the pull request, falling back to github-actions[bot]", () => {
  for (const file of ["docs-pin.yml", "core-pin.yml", "kit-pin.yml"]) {
    const text = readFileSync(join(root, ".github/workflows", file), "utf8");
    assert.match(text, /APP_SLUG: \$\{\{ steps\.app\.outputs\.app-slug \}\}/, file);
    assert.match(text, /email="\$\{uid\}\+\$\{APP_SLUG\}\[bot\]@users\.noreply\.github\.com"/, file);
    assert.match(text, /41898282\+github-actions\[bot\]@users\.noreply\.github\.com/, file);
  }
});
