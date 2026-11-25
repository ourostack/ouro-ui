import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { deadline, deadlineMs, entryProblems, isOverdue, quarantineFile, reportLines } from "./repeat-red-quarantine.mjs";
import { scratchDir } from "./scratch.mjs";

const entry = {
  project: "ouro-chromium",
  file: "registry/ouro/components/ouro/calendar/calendar.test.tsx",
  title: "keeps the selected day in view",
  issue: "https://github.com/ourostack/ouro-ui/issues/351",
  owner: "arimendelow",
  quarantinedAt: "2026-11-24T12:00:00.000Z",
  cause: "the agenda view's own scroll anchor drifts under load, a product bug in Calendar",
};

test("every repeat-red quarantine entry names its test, its issue, its owner, when it was quarantined and its cause", () => {
  const entries = JSON.parse(readFileSync(quarantineFile, "utf8"));
  assert.deepEqual(entryProblems(entries), []);
});

test("entryProblems requires a JSON array, and names every missing field of an entry", () => {
  assert.deepEqual(entryProblems({}), ["the repeat-red quarantine must be a JSON array of entries"]);
  const [problem, ...rest] = entryProblems([{ title: "a test" }]);
  assert.equal(rest.length, 5);
  assert.match(problem, /entry 1 \(a test\) has no project/);
});

test("entryProblems rejects an issue that is not a GitHub issue URL, and a quarantinedAt that does not parse", () => {
  assert.deepEqual(entryProblems([{ ...entry, issue: "not a url" }]), [`entry 1 (${entry.title}) has no issue URL (https://github.com/<owner>/<repo>/issues/<number>)`]);
  assert.deepEqual(entryProblems([{ ...entry, quarantinedAt: "not a date" }]), [`entry 1 (${entry.title}) has no quarantinedAt (an ISO timestamp of its second failure)`]);
});

test("deadline is 24 hours after quarantinedAt, and isOverdue flips exactly there", () => {
  assert.equal(deadline(entry).toISOString(), "2026-11-25T12:00:00.000Z");
  assert.equal(deadlineMs, 24 * 60 * 60 * 1000);
  assert.equal(isOverdue(entry, new Date("2026-11-25T11:59:59.999Z")), false);
  assert.equal(isOverdue(entry, new Date("2026-11-25T12:00:00.000Z")), true);
});

test("reportLines names each entry's test, issue, owner and cause, and whether its deadline has passed", () => {
  const [line] = reportLines([entry], new Date("2026-11-25T00:00:00.000Z"));
  assert.match(line, /^ouro-chromium registry\/ouro\/components\/ouro\/calendar\/calendar\.test\.tsx > keeps the selected day in view: issue https:\/\/github\.com\/ourostack\/ouro-ui\/issues\/351, owner @arimendelow, cause: the agenda view's own scroll anchor drifts under load, a product bug in Calendar \(due 2026-11-25T12:00:00\.000Z\)$/);
  const [overdueLine] = reportLines([entry], new Date("2026-12-01T00:00:00.000Z"));
  assert.match(overdueLine, /\(OVERDUE\)$/);
});

test("reportLines reports an empty quarantine, and a malformed one, instead of formatting bad entries", () => {
  assert.deepEqual(reportLines([], new Date()), ["The repeat-red quarantine is empty."]);
  const [line] = reportLines([{ title: "a test" }], new Date());
  assert.match(line, /^The repeat-red quarantine is malformed: entry 1 \(a test\) has no project; /);
});

test("repeat-red-quarantine.mjs report always exits 0, warns of an overdue entry and writes the step summary", async () => {
  const dir = scratchDir("ouro-repeat-red-quarantine-");
  const list = join(dir, "repeat-red-quarantine.json");
  writeFileSync(list, JSON.stringify([{ ...entry, quarantinedAt: "2020-01-01T00:00:00.000Z" }]));
  const summary = join(dir, "summary.md");
  writeFileSync(summary, "");
  const { spawnSync } = await import("node:child_process");
  const root = join(import.meta.dirname, "..");
  const result = spawnSync(process.execPath, [join(root, "scripts/repeat-red-quarantine.mjs"), "report"], {
    encoding: "utf8",
    env: { ...process.env, OURO_REPEAT_RED_QUARANTINE_FILE: list, GITHUB_STEP_SUMMARY: summary },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /::warning title=Repeat-red quarantine overdue::/);
  assert.match(readFileSync(summary, "utf8"), /## Repeat-red quarantine/);
});

test("repeat-red-quarantine.mjs check fails on a malformed list and passes on a clean one", async () => {
  const dir = scratchDir("ouro-repeat-red-quarantine-check-");
  const list = join(dir, "repeat-red-quarantine.json");
  const { spawnSync } = await import("node:child_process");
  const root = join(import.meta.dirname, "..");
  writeFileSync(list, JSON.stringify([{ title: "a test" }]));
  const bad = spawnSync(process.execPath, [join(root, "scripts/repeat-red-quarantine.mjs"), "check"], { encoding: "utf8", env: { ...process.env, OURO_REPEAT_RED_QUARANTINE_FILE: list } });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /::error::\.github\/repeat-red-quarantine\.json: entry 1 \(a test\) has no project/);
  writeFileSync(list, JSON.stringify([entry]));
  const good = spawnSync(process.execPath, [join(root, "scripts/repeat-red-quarantine.mjs"), "check"], { encoding: "utf8", env: { ...process.env, OURO_REPEAT_RED_QUARANTINE_FILE: list } });
  assert.equal(good.status, 0);
});
