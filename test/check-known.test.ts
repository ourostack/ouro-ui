import { describe, expect, it } from "vitest";
import { knownFindings, knownProblems, type KnownFinding } from "./check-known.ts";

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
});
