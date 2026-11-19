import { describe, expect, it } from "vitest";
import { judgedOn, knownFindings, knownFor, knownProblems, staleEntries, sweepVerdict, type KnownFinding } from "./check-known.ts";

// Every known finding names the open issue that tracks it, by a positive issue number, and says why it stays. A cast or
// a missing field must not get past the type, so the data itself is checked here, and the check is proved to fail.
describe("known findings name an issue and a reason", () => {
  it("gives every entry a positive issue number and a reason", () => {
    expect(knownProblems(knownFindings)).toEqual([]);
  });

  it("fails an entry a cast left without its issue", () => {
    const uncast = { story: "Button/Disabled", rule: "disabled-no-reason", reason: "A reason." } as KnownFinding;
    expect(knownProblems([uncast])).toEqual(["Button/Disabled (disabled-no-reason): issue must be a positive issue number, got undefined"]);
  });

  it.each([0, -1, 1.5, Number.NaN, "1953"])("fails an issue of %s", (issue) => {
    const entry = { story: "Button/Disabled", rule: "disabled-no-reason", issue, reason: "A reason." } as unknown as KnownFinding;
    expect(knownProblems([entry])).toHaveLength(1);
  });

  it("fails an entry with no reason", () => {
    expect(knownProblems([{ story: "Button/Disabled", rule: "disabled-no-reason", issue: 1953, reason: "  " }])).toEqual([
      "Button/Disabled (disabled-no-reason): no reason",
    ]);
  });

  it("judges the text-wrap rules on Linux only, and every other rule on every host", () => {
    expect(judgedOn("lone-word", "linux")).toBe(true);
    expect(judgedOn("lone-word", "darwin")).toBe(false);
    expect(judgedOn("disabled-no-reason", "darwin")).toBe(true);
  });

  it("gives a run the entries for its own theme: none for the Ouro theme, a fixture's for that fixture", () => {
    const ouro = { story: "Button/Disabled", rule: "disabled-no-reason", issue: 1953, reason: "A reason." };
    const nova = { ...ouro, rule: "nova-only-rule", theme: "nova" };
    expect(knownFor([ouro, nova], "Button/Disabled")).toEqual([ouro]);
    expect(knownFor([ouro, nova], "Button/Disabled", "nova")).toEqual([nova]);
    expect(knownFor([ouro, nova], "Button/Disabled", "vega")).toEqual([]);
  });

  it("waives a finding with the Ouro-theme run's entry in a fixture's run, without requiring that entry to show there", () => {
    const ouro = { story: "Button/Disabled", rule: "disabled-no-reason", issue: 1953, reason: "A reason." };
    const nova = { ...ouro, rule: "dark-miss", theme: "nova" };
    expect(sweepVerdict([{ rule: "disabled-no-reason" }, { rule: "dark-miss" }], [nova], [ouro])).toEqual({ unknown: [], stale: [] });
    expect(sweepVerdict([], [nova], [ouro])).toEqual({ unknown: [], stale: [nova] });
    expect(sweepVerdict([{ rule: "overlap" }], [nova], [ouro])).toEqual({ unknown: [{ rule: "overlap" }], stale: [nova] });
  });
});

// A finding that shows on some runs and not others must not fail a run where it didn't show, or unrelated pull requests
// go red (#1957); an ordinary entry still fails once its finding is gone, so the list still shrinks with each fix.
describe("known findings that show only sometimes", () => {
  const base = { story: "Message/Chat", rule: "overlap", issue: 1957, reason: "A reason." };

  it("keeps an entry marked sometimes when a run doesn't show its finding, and an ordinary entry goes stale", () => {
    expect(staleEntries([{ ...base, sometimes: true }], [])).toEqual([]);
    expect(staleEntries([base], [])).toEqual([base]);
    expect(staleEntries([base], [{ rule: "overlap" }])).toEqual([]);
  });

  it("marks Message/Chat's overlap as sometimes, since it comes and goes on CI with no change to Message", () => {
    expect(knownFindings.find((entry) => entry.story === "Message/Chat" && entry.rule === "overlap")?.sometimes).toBe(true);
  });
});
