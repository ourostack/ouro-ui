import { describe, expect, it } from "vitest";
import { axError, axEvent, exitCodeOf, isOutcome, isWait, nextStep, OUTCOME_STATES, outcome, outcomeLine, validateOutcome, validateWait, wait } from "@/registry/ouro/lib/ouro/ax-outcome";
import type { Outcome } from "@/registry/ouro/lib/ouro/ax-outcome";

const AT = "2026-10-30T20:00:00.000Z";
const receipt = { id: "a1b2c3d4e5f6", at: AT, by: "agent:planner", why: "Sam asked me to tell Design sync" };
const look = nextStep("tandem look abc123 --json", "see whether the message is there");
const sent = (over: Partial<Outcome> = {}): Outcome => ({
  ...outcome({
    action: "message.send",
    effect: "others",
    audience: { only: false, who: "everyone in Design sync" },
    scope: { kind: "conversation", id: "19:abc", name: "Design sync" },
    state: "done",
    summary: "Sent to Design sync.",
    postcondition: { checked: true, holds: true, how: "the message is in tandem's copy of Design sync" },
    receipt,
    next: [look],
  }),
  ...over,
});

describe("outcome", () => {
  it("fills honest defaults: private, only you, nothing checked, no receipt", () => {
    const o = outcome({ action: "draft.edit", state: "done", summary: "Draft saved." });
    expect(o).toEqual({ ax: "ax.outcome/1", action: "draft.edit", effect: "private", audience: { only: true, who: "only you" }, scope: null, state: "done", summary: "Draft saved.", postcondition: { checked: false, holds: null, how: "not checked" }, receipt: null, next: [] });
    expect(isOutcome(o)).toBe(true);
  });

  it("keeps an error and a human step when given", () => {
    const o = outcome({ action: "x", state: "needs-human", summary: "s", error: axError("code", "m"), human: { reason: "2FA", resume: look } });
    expect(o.error).toEqual({ code: "code", message: "m" });
    expect(o.human?.reason).toBe("2FA");
  });

  it("does not share the default audience between outcomes", () => {
    const a = outcome({ action: "x", state: "done", summary: "s" });
    a.audience.who = "changed";
    expect(outcome({ action: "x", state: "done", summary: "s" }).audience.who).toBe("only you");
  });
});

describe("validateOutcome", () => {
  it("passes a checked, received send", () => {
    expect(validateOutcome(sent())).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("rejects what is not an envelope", () => {
    for (const v of [null, [], { ax: "other" }, { ax: "ax.outcome/1", state: "maybe" }, { ax: "ax.outcome/1", state: 3 }]) {
      const r = validateOutcome(v);
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toMatch(/^not an ax.outcome\/1 envelope/);
    }
  });

  it("names every broken field", () => {
    const bad = { ...sent(), action: "", effect: "public", audience: { only: "no", who: "" }, summary: " ", postcondition: { checked: true }, next: [{ command: "x" }], receipt: { id: "" }, error: { code: "" } } as unknown;
    expect(validateOutcome(bad).errors).toEqual([
      "action is empty",
      'effect is "private" or "others"',
      "audience needs only (boolean) and who (words)",
      "summary is empty",
      "postcondition needs checked, holds (true, false or null) and how",
      "every next step needs a command and a why",
      "receipt needs id, at, by and why (or null)",
      "error needs a code and a message",
    ]);
  });

  it("accepts a receipt without a why on a private effect", () => {
    expect(validateOutcome(outcome({ action: "draft.edit", state: "done", summary: "s", receipt: { ...receipt, why: null }, postcondition: { checked: true, holds: true, how: "read back" } })).ok).toBe(true);
  });

  it("refuses an audience of only you on an effect other people see", () => {
    expect(validateOutcome(sent({ audience: { only: true, who: "only you" } })).errors).toContain("an effect other people see cannot have an audience of only you");
  });

  it("never lets done rest on a failed postcondition, and warns when nothing was checked", () => {
    expect(validateOutcome(sent({ postcondition: { checked: true, holds: false, how: "not there" } })).errors).toContain("done, but the postcondition does not hold");
    const unchecked = validateOutcome(sent({ postcondition: { checked: false, holds: null, how: "the window's report" } }));
    expect(unchecked.ok).toBe(true);
    expect(unchecked.warnings).toEqual(["done without an independent check: say what it rests on in postcondition.how"]);
    expect(validateOutcome(sent({ error: axError("x", "y") })).errors).toContain("done carries an error");
  });

  it("makes queued and uncertain findable and followable", () => {
    for (const state of ["queued", "uncertain"] as const) {
      const r = validateOutcome(sent({ state, postcondition: { checked: false, holds: null, how: "not yet" }, receipt: null, next: [] }));
      expect(r.errors).toEqual([`${state} needs a receipt, so the request can be found again`, `${state} needs a next step`, "an effect other people see needs a receipt with a why"]);
    }
    expect(validateOutcome(sent({ state: "uncertain" })).errors).toEqual(["uncertain, but the postcondition claims to know"]);
  });

  it("makes refused and failed explain themselves", () => {
    for (const state of ["refused", "failed"] as const) {
      const r = validateOutcome(sent({ state, next: [] }));
      expect(r.errors).toEqual([`${state} needs an error with a code and a message`, `${state}, but the postcondition says the effect holds`]);
      expect(r.warnings).toEqual([`${state} without a next step: say what to do instead`]);
    }
    expect(validateOutcome(sent({ state: "refused", receipt: null, error: axError("why", "say why"), postcondition: { checked: true, holds: false, how: "nothing was queued" } })).ok).toBe(true);
  });

  it("asks needs-human for the reason and the resume step", () => {
    expect(validateOutcome(sent({ state: "needs-human" })).errors).toEqual(["needs-human needs human.reason and human.resume"]);
    expect(validateOutcome(sent({ state: "needs-human", human: { reason: "", resume: look } })).ok).toBe(false);
    expect(validateOutcome(sent({ state: "needs-human", human: { reason: "Only the person turns writes on.", resume: look } })).ok).toBe(true);
  });

  it("keeps a plan from claiming its effect", () => {
    expect(validateOutcome(sent({ state: "planned" })).errors).toEqual(["planned, but the postcondition says the effect holds"]);
    expect(validateOutcome(sent({ state: "planned", receipt: null, postcondition: { checked: false, holds: null, how: "a plan" } })).ok).toBe(true);
  });

  it("asks an effect other people see for a receipt with a why", () => {
    expect(validateOutcome(sent({ receipt: { ...receipt, why: " " } })).errors).toEqual(["an effect other people see needs a receipt with a why"]);
  });
});

describe("wait", () => {
  const timedOut = wait({ for: "a reply in Design sync", state: "timed-out", since: AT, cursor: "17", fresh: { state: "live", asOf: AT }, resume: nextStep("tandem watch abc123 --after 17", "wait again from here") });

  it("builds with defaults and validates", () => {
    const w = wait({ for: "x", state: "gone", since: AT });
    expect(w).toEqual({ ax: "ax.wait/1", for: "x", scope: null, state: "gone", since: AT, cursor: null, events: [], fresh: null, resume: null, callback: null, next: [] });
    expect(isWait(w)).toBe(true);
    expect(validateWait(w)).toEqual({ ok: true, errors: [], warnings: ["no freshness: nothing seen is not the same as nothing happened"] });
    expect(validateWait(timedOut)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("rejects what is not a wait", () => {
    for (const v of [null, { ax: "ax.wait/1", state: "done" }, { ax: "ax.wait/1", state: 1 }]) expect(validateWait(v).errors[0]).toMatch(/^not an ax.wait\/1 envelope/);
  });

  it("asks a wait that can go on how to resume, and a satisfied one what happened", () => {
    const r = validateWait({ ...timedOut, for: "", since: "", state: "waiting", resume: null, cursor: null, next: [{}] });
    expect(r.errors).toEqual(["for is empty: say what is awaited", "since is empty", "waiting needs resume: the exact command that waits again from the cursor", "every next step needs a command and a why"]);
    expect(r.warnings).toEqual(["no cursor: a resumed wait may miss or repeat events"]);
    expect(validateWait({ ...timedOut, state: "satisfied" }).errors).toEqual(["satisfied, but no event says what happened"]);
    expect(validateWait({ ...timedOut, events: "none" }).errors).toEqual(["events is a list"]);
    expect(validateWait({ ...timedOut, state: "gone", resume: { command: "x" } }).errors).toEqual(["resume needs a command and a why"]);
    const e = axEvent({ cursor: "18", type: "message", at: AT, by: "Sam Lee", summary: "Sam Lee replied" });
    expect(e.scope).toBeNull();
    expect(validateWait({ ...timedOut, state: "satisfied", events: [e] }).ok).toBe(true);
  });
});

describe("exitCodeOf and outcomeLine", () => {
  it("gives every state its exit code", () => {
    expect(OUTCOME_STATES.map(exitCodeOf)).toEqual([0, 7, 0, 8, 7, 2, 1]);
  });

  it("prints the summary, the error, the check, the person's step and the next steps", () => {
    expect(outcomeLine(sent())).toBe("Sent to Design sync.\nChecked: the message is in tandem's copy of Design sync.\nNext: tandem look abc123 --json  (see whether the message is there)");
    const human = outcome({ action: "x", state: "needs-human", summary: "Writes are off.", error: axError("writes-off", "Only the person turns writes on."), human: { reason: "Only the person turns writes on.", resume: look } });
    expect(outcomeLine(human)).toBe("Writes are off.\nOnly the person turns writes on.\nNeeds the person: Only the person turns writes on. Then: tandem look abc123 --json");
    expect(outcomeLine(outcome({ action: "x", state: "refused", summary: "refused: say why", error: axError("why", "say why"), postcondition: { checked: true, holds: false, how: "nothing was queued." } }))).toBe("refused: say why\nChecked: nothing was queued.");
  });
});
