// The headroom rule for Vitest browser shards: a test that takes more than half its own timeout
// fails the run, so a test near its budget shows on the pull request that adds it, not later on a
// loaded shard (a home headline test took about 17 s against a 15 s budget, passed on a quiet
// runner and timed out on main's shards). The tests that already exceed it are named in
// .github/headroom.json, each with a reason and an owner; the run fails a test over half that
// is not named there, and a name whose test file or title is gone from the source is stale.
// Run times are too noisy to judge staleness from, so staleness is read from the source.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const exemptionsPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "headroom.json");

/** The named exemptions, `[{ test, reason, owner }]`, where `test` is `<project> <file> > <full name>`. */
export const readExemptions = (path = exemptionsPath) => JSON.parse(readFileSync(path, "utf8"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The exemptions whose test file is gone, or whose title no longer appears in it. */
export function staleExemptions(exemptions, base = root) {
  return exemptions.flatMap(({ test }) => {
    const file = test.match(/(\S+\.test\.(?:tsx?|mjs))/)?.[1];
    const title = test.split(" > ").at(-1).split("*").sort((a, b) => b.length - a.length)[0];
    const parts = [title.slice(0, 20), title.slice(-20)];
    const source = file && existsSync(join(base, file)) ? readFileSync(join(base, file), "utf8") : null;
    return source && parts.some((part) => source.includes(part)) ? [] : [`[ouro-ui] Headroom: ${test} names a test that is gone. Fix: remove its exemption from .github/headroom.json.`];
  });
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** Whether an exemption names its test, a reason and an owner. */
export const exemptionProblems = (exemptions) =>
  exemptions.flatMap((entry) =>
    ["test", "reason", "owner"].filter((field) => typeof entry[field] !== "string" || entry[field].trim() === "").map((field) => `${entry.test ?? "An exemption"} in .github/headroom.json has no ${field}.`),
  );

/**
 * The problems of one run. `tests` are `{ name, durationMs, timeoutMs }`; a test over half its timeout
 * fails unless exempt. A stale exemption is found by `staleExemptions`.
 */
export function headroomProblems(tests, exemptions) {
  const patterns = exemptions.map(({ test }) => new RegExp(`^${test.split("*").map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`));
  const named = { has: (name) => patterns.some((pattern) => pattern.test(name)) };
  const problems = exemptionProblems(exemptions);
  for (const { name, durationMs, timeoutMs } of tests) {
    const over = durationMs > timeoutMs / 2;
    if (over && !named.has(name)) {
      problems.push(`[ouro-ui] Headroom: ${name} took ${seconds(durationMs)} against a budget of ${seconds(timeoutMs)}; a test over half its budget can time out on a loaded shard. Fix: make it faster or give it a bigger timeout, or name it in .github/headroom.json with a reason and an owner.`);
    }
  }
  return problems;
}

/** The reason on a `headroom: <reason>` line of the description, or null when there is none or it is under ten characters. */
export function headroomReason(body) {
  for (const [, reason] of body.matchAll(/^[ \t]*headroom:[ \t]*(.*?)[ \t]*$/gim)) if (reason.length >= 10) return reason;
  return null;
}

/**
 * The exemption count only goes down: a head file with more entries than the base's (a wildcard entry counts once)
 * fails unless the pull request's description has a `headroom: <reason>` line.
 */
export function ratchetProblems({ base, head, body }) {
  if (head.length <= base.length || headroomReason(body) !== null) return [];
  return [`[ouro-ui] Headroom: .github/headroom.json grows from ${base.length} to ${head.length} exemptions. Fix: make the test faster instead, or put "headroom: <why it cannot be>" on its own line in the pull request's description.`];
}

/** The files a pull request changes, from `HEADROOM_CHANGED` (one path per line), or null where the run judges every test. */
export function changedFiles(value) {
  const files = (value ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  return files.length === 0 ? null : new Set(files);
}

/** The events whose runs only report a breach: a pull request fails it, and the others (main, the merge queue, a schedule) file it. */
export const reportOnly = (event) => event !== undefined && event !== "" && event !== "pull_request";

/**
 * Judges one run. `tests` are `{ name, file, durationMs, timeoutMs }`; on a pull request (`changed` set) only tests in
 * its changed files count. `failures` fail the run; on a report-only `event` a breach is a `warnings` annotation
 * (and one `breaches` line) instead, while a malformed or stale exemption fails everywhere.
 */
export function judge({ tests, exemptions, event, changed }) {
  const judged = changed ? tests.filter(({ file }) => changed.has(file)) : tests;
  const breaches = headroomProblems(judged, exemptions).filter((problem) => !exemptionProblems(exemptions).includes(problem));
  const failures = [...exemptionProblems(exemptions), ...staleExemptions(exemptions)];
  if (!reportOnly(event)) return { failures: [...failures, ...breaches], warnings: [], breaches: [] };
  return { failures, warnings: breaches.map((breach) => `::warning title=Headroom::${breach}`), breaches };
}
