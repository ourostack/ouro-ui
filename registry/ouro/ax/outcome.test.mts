import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_EXIT_CODES, defineExitCodes } from "./exit-codes.ts";
import { DEFAULT_OUTCOME_EXITS, isOutcome, nextStep, OUTCOME_STATES, outcome, outcomeExit, outcomeText, validateOutcome, type Outcome } from "./outcome.ts";

const AT = "2026-10-30T20:00:00.000Z";
const receipt = { id: "a1b2c3d4e5f6", at: AT, by: "agent:planner", why: "Sam asked me to tell Design sync" };
const look = nextStep("tool look abc123 --json", "see whether the message is there");
const err = { code: "why", exit: 2, thing: "send", problem: "say why", fix: null };
const sent = (over: Partial<Outcome> = {}): Outcome => ({
  ...outcome({
    action: "message.send",
    effect: "others",
    audience: { only: false, who: "everyone in Design sync" },
    target: { kind: "conversation", id: "19:abc", name: "Design sync" },
    state: "done",
    summary: "Sent to Design sync.",
    postcondition: { checked: true, holds: true, how: "the message is in the tool's copy of Design sync" },
    receipt,
    next: [look],
  }),
  ...over,
});

test("outcome fills honest defaults: private, only you, nothing checked, no receipt; an error gets its message", () => {
  const o = outcome({ action: "draft.edit", state: "done", summary: "Draft saved." });
  assert.deepEqual(o, { ax: "outcome/1", action: "draft.edit", effect: "private", audience: { only: true, who: "only you" }, target: null, state: "done", summary: "Draft saved.", postcondition: { checked: false, holds: null, how: "not checked" }, receipt: null, next: [] });
  assert.ok(isOutcome(o));
  o.audience.who = "changed";
  assert.equal(outcome({ action: "x", state: "done", summary: "s" }).audience.who, "only you");
  const h = outcome({ action: "x", state: "needs-human", summary: "s", error: err, human: { reason: "2FA", resume: look } });
  assert.deepEqual(h.error, { ...err, message: "send: say why." });
  assert.equal(h.human?.reason, "2FA");
});

test("validateOutcome passes a checked, received send and rejects what is not an envelope", () => {
  assert.deepEqual(validateOutcome(sent()), { ok: true, errors: [], warnings: [] });
  for (const v of [null, [], { ax: "other" }, { ax: "outcome/1", state: "maybe" }]) assert.match(validateOutcome(v).errors[0]!, /^not an outcome\/1 envelope/);
});

test("validateOutcome names every broken field", () => {
  const bad = { ...sent(), action: "", effect: "public", audience: { only: "no", who: "" }, target: { kind: "x" }, summary: " ", postcondition: { checked: true }, next: [{ command: "x" }], receipt: { id: "" }, error: { code: "" } } as unknown;
  assert.deepEqual(validateOutcome(bad).errors, [
    "action is empty",
    'effect is "private" or "others"',
    "audience needs only (true or false) and who (words)",
    "target is null or { kind, id }",
    "summary is empty",
    "postcondition needs checked, holds (true, false or null) and how",
    "every next step needs a command and a why",
    "receipt needs id, at, by and why (or null)",
    "error needs a code and a message",
  ]);
  assert.equal(validateOutcome({ ...sent(), audience: null }).errors[0], "audience needs only (true or false) and who (words)");
  assert.deepEqual(validateOutcome({ ...sent(), next: "x", postcondition: null }).errors, ["postcondition needs checked, holds (true, false or null) and how", "every next step needs a command and a why"]);
});

test("the rules: done, queued, uncertain, refused, failed, needs-human, planned and effects other people see", () => {
  assert.ok(validateOutcome(outcome({ action: "draft.edit", state: "done", summary: "s", receipt: { ...receipt, why: null }, postcondition: { checked: true, holds: true, how: "read back" } })).ok);
  assert.ok(validateOutcome(sent({ audience: { only: true, who: "only you" } })).errors.includes("an effect other people see cannot have an audience of only you"));
  assert.ok(validateOutcome(sent({ postcondition: { checked: true, holds: false, how: "not there" } })).errors.includes("done, but the postcondition does not hold"));
  const unchecked = validateOutcome(sent({ postcondition: { checked: false, holds: null, how: "the window's report" } }));
  assert.equal(unchecked.ok, true);
  assert.deepEqual(unchecked.warnings, ["done without an independent check: say what it rests on in postcondition.how"]);
  assert.ok(validateOutcome(sent({ error: { ...err, message: "m" } })).errors.includes("done carries an error"));
  for (const state of ["queued", "uncertain"] as const) {
    assert.deepEqual(validateOutcome(sent({ state, postcondition: { checked: false, holds: null, how: "not yet" }, receipt: null, next: [] })).errors, [`${state} needs a receipt, so the request can be found again`, `${state} needs a next step`, "an effect other people see needs a receipt with a why"]);
  }
  assert.deepEqual(validateOutcome(sent({ state: "uncertain" })).errors, ["uncertain, but the postcondition claims to know"]);
  for (const state of ["refused", "failed"] as const) {
    const r = validateOutcome(sent({ state, next: [] }));
    assert.deepEqual(r.errors, [`${state} needs an error with a code and a message`, `${state}, but the postcondition says the effect holds`]);
    assert.deepEqual(r.warnings, [`${state} without a next step or a fix: say what to do instead`]);
  }
  assert.ok(validateOutcome(sent({ state: "refused", receipt: null, next: [], error: { ...err, fix: "tool send --why x", message: "m" }, postcondition: { checked: true, holds: false, how: "nothing was queued" } })).ok);
  assert.deepEqual(validateOutcome(sent({ state: "needs-human" })).errors, ["needs-human needs human.reason and human.resume"]);
  assert.equal(validateOutcome(sent({ state: "needs-human", human: { reason: "", resume: look } })).ok, false);
  assert.ok(validateOutcome(sent({ state: "needs-human", human: { reason: "Only the person turns writes on.", resume: look } })).ok);
  assert.deepEqual(validateOutcome(sent({ state: "planned" })).errors, ["planned, but the postcondition says the effect holds"]);
  assert.ok(validateOutcome(sent({ state: "planned", receipt: null, postcondition: { checked: false, holds: null, how: "a plan" } })).ok);
  assert.deepEqual(validateOutcome(sent({ receipt: { ...receipt, why: " " } })).errors, ["an effect other people see needs a receipt with a why"]);
});

test("outcomeExit: a refusal's own exit, else the state's name in the tool's table", () => {
  const exits = defineExitCodes([...BASE_EXIT_CODES, { code: 3, name: "possibly done", short: "possibly done", meaning: "maybe" }]);
  assert.deepEqual(
    OUTCOME_STATES.map((state) => outcomeExit(sent({ state }), exits)),
    [0, 0, 0, 0, 1, 2, 1],
  );
  assert.equal(outcomeExit(sent({ state: "refused", error: { ...err, exit: 3, message: "m" } }), exits), 3);
  assert.equal(outcomeExit(sent({ state: "uncertain" }), exits, { ...DEFAULT_OUTCOME_EXITS, uncertain: "possibly done" }), 3);
});

test("outcomeText: the summary, the check, the receipt, the person's step and the next steps; a refusal is its error line", () => {
  assert.equal(outcomeText(sent(), "tool"), "Sent to Design sync.\nChecked: the message is in the tool's copy of Design sync.\nReceipt: a1b2c3d4e5f6\nNext: tool look abc123 --json  (see whether the message is there)");
  const human = outcome({ action: "x", state: "needs-human", summary: "Writes are off.", human: { reason: "Only the person turns writes on.", resume: look } });
  assert.equal(outcomeText(human, "tool"), "Writes are off.\nNeeds the person: Only the person turns writes on. Then: tool look abc123 --json");
  assert.equal(outcomeText(outcome({ action: "x", state: "refused", summary: "No.", error: { ...err, fix: "tool send --why x" } }), "tool"), "tool: send: say why. Fix: tool send --why x.");
  assert.equal(outcomeText(sent({ state: "failed", postcondition: { checked: true, holds: false, how: "not there." } }), "tool").split("\n")[1], "Checked: not there (it does not hold).");
});
