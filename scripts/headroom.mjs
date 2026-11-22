// The headroom rule for Vitest browser shards: a test that takes more than half its own timeout
// fails the run, so a test near its budget shows on the pull request that adds it, not later on a
// loaded shard (a home headline test took about 17 s against a 15 s budget, passed on a quiet
// runner and timed out on main's shards). The tests that already exceed it are named in
// .github/headroom.json, each with a reason and an owner; the run fails a test over half that
// is not named there, and a name whose test ran under two fifths of its budget (the gap keeps a
// test that hovers at half from failing a quiet run for being listed).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const exemptionsPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "headroom.json");

/** The named exemptions, `[{ test, reason, owner }]`, where `test` is `<project> <file> > <full name>`. */
export const readExemptions = (path = exemptionsPath) => JSON.parse(readFileSync(path, "utf8"));

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** Whether an exemption names its test, a reason and an owner. */
export const exemptionProblems = (exemptions) =>
  exemptions.flatMap((entry) =>
    ["test", "reason", "owner"].filter((field) => typeof entry[field] !== "string" || entry[field].trim() === "").map((field) => `${entry.test ?? "An exemption"} in .github/headroom.json has no ${field}.`),
  );

/**
 * The problems of one run. `tests` are `{ name, durationMs, timeoutMs }`; a test over half its timeout
 * fails unless exempt, and an exemption whose test ran under two fifths of its timeout fails as stale. An exemption whose
 * test did not run in this shard is left alone: another shard runs it.
 */
export function headroomProblems(tests, exemptions) {
  const named = new Map(exemptions.map((entry) => [entry.test, entry]));
  const problems = exemptionProblems(exemptions);
  for (const { name, durationMs, timeoutMs } of tests) {
    const over = durationMs > timeoutMs / 2;
    if (over && !named.has(name)) {
      problems.push(`[ouro-ui] Headroom: ${name} took ${seconds(durationMs)} against a budget of ${seconds(timeoutMs)}; a test over half its budget can time out on a loaded shard. Fix: make it faster or give it a bigger timeout, or name it in .github/headroom.json with a reason and an owner.`);
    }
    if (durationMs < timeoutMs * 0.4 && named.has(name)) {
      problems.push(`[ouro-ui] Headroom: ${name} took ${seconds(durationMs)} against a budget of ${seconds(timeoutMs)}, under two fifths. Fix: remove its exemption from .github/headroom.json.`);
    }
  }
  return problems;
}
