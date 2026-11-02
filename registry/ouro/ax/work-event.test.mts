import { test } from "node:test";
import assert from "node:assert/strict";
import { outcome } from "./outcome.ts";
import { actorOf, checkWorkEvent, foldWork, WORK_EVENT_VERSION, WORK_KINDS, workEventOf, type WorkEvent } from "./work-event.ts";

const at = (min: number) => new Date(Date.UTC(2026, 9, 30, 9, min)).toISOString();
let n = 0;
const ev = (kind: WorkEvent["kind"], min: number, o: Partial<WorkEvent> = {}): WorkEvent => ({
  ax: WORK_EVENT_VERSION, id: String(++n), at: at(min), kind, actor: "agent:planner", onBehalfOf: "Dana", target: { kind: "conversation", id: "c1" }, why: null, effect: "private", receipt: null, correlation: null, ...o,
});

test("actorOf reads a named agent, an unnamed agent and the person, and nothing else", () => {
  assert.deepEqual(actorOf("agent:planner"), { kind: "agent", name: "planner" });
  assert.deepEqual(actorOf("agent"), { kind: "agent", name: null });
  assert.deepEqual(actorOf("person"), { kind: "person" });
  assert.equal(actorOf("agent:"), null);
  assert.equal(actorOf("bot:x"), null);
});

test("checkWorkEvent accepts every kind, and names the first problem with its fix otherwise", () => {
  assert.equal(WORK_KINDS.length, 6);
  assert.ok(checkWorkEvent(ev("action", 0)).ok);
  assert.ok(checkWorkEvent(ev("done", 0, { actor: "person", onBehalfOf: null, target: null })).ok);
  assert.ok(checkWorkEvent(ev("wait", 0, { detail: { phase: "end" } })).ok);
  const bad: [unknown, RegExp][] = [
    [null, /is an object/],
    [[], /is an object/],
    [{ ...ev("action", 0), ax: "x" }, /ax is "x"/],
    [{ ...ev("action", 0), id: "" }, /id is missing/],
    [{ ...ev("action", 0), at: "soon" }, /at is "soon"/],
    [{ ...ev("action", 0), kind: "poke" }, /kind is "poke"/],
    [{ ...ev("action", 0), actor: 3 }, /actor is 3/],
    [{ ...ev("action", 0), onBehalfOf: null }, /names no person/],
    [{ ...ev("action", 0), onBehalfOf: "" }, /names no person/],
    [{ ...ev("action", 0), actor: "person" }, /own behalf/],
    [{ ...ev("action", 0), target: "c1" }, /target is not/],
    [{ ...ev("action", 0), target: { kind: 1, id: "x" } }, /target is not/],
    [{ ...ev("action", 0), target: { kind: "x", id: 2 } }, /target is not/],
    [{ ...ev("action", 0), why: 4 }, /why is not/],
    [{ ...ev("action", 0), effect: "public" }, /effect is "public"/],
    [{ ...ev("action", 0), receipt: 5 }, /receipt is not/],
    [{ ...ev("action", 0), correlation: 6 }, /correlation is not/],
    [ev("wait", 0), /has no phase/],
    [ev("wait", 0, { detail: { phase: "later" } }), /has no phase/],
  ];
  for (const [value, problem] of bad) {
    const r = checkWorkEvent(value);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.problem, problem);
      assert.ok(r.fix.length > 0);
    }
  }
});

test("workEventOf: an action or handoff from an outcome, attributed; nothing for a plan or a refusal", () => {
  const done = outcome({ action: "message.send", effect: "others", audience: { only: false, who: "everyone" }, target: { kind: "conversation", id: "c1" }, state: "done", summary: "Sent.", receipt: { id: "r1", at: at(3), by: "agent:planner", why: "Riley asked" } });
  assert.deepEqual(workEventOf(done, { id: "e1", actor: "agent:planner", onBehalfOf: "Dana", correlation: "plan#7" }), {
    ax: WORK_EVENT_VERSION, id: "e1", at: at(3), kind: "action", actor: "agent:planner", onBehalfOf: "Dana", target: { kind: "conversation", id: "c1" }, why: "Riley asked", effect: "others", receipt: "r1", correlation: "plan#7", verb: "message.send", detail: { state: "done" },
  });
  const handed = workEventOf(outcome({ action: "draft", state: "needs-human", summary: "Left for you.", human: { reason: "you send it", resume: { command: "x", why: "y" } } }), { id: "e2", actor: "agent", onBehalfOf: "Dana", at: at(4) });
  assert.equal(handed?.kind, "handoff");
  assert.equal(handed?.why, null);
  assert.equal(handed?.correlation, null);
  assert.ok(checkWorkEvent(handed).ok);
  assert.match(workEventOf(outcome({ action: "x", state: "done", summary: "s" }), { id: "e3", actor: "agent", onBehalfOf: "Dana" })!.at, /^\d{4}-/);
  assert.equal(workEventOf(outcome({ action: "x", state: "planned", summary: "s" }), { id: "e4", actor: "agent", onBehalfOf: "Dana" }), null);
  assert.equal(workEventOf(outcome({ action: "x", state: "refused", summary: "s" }), { id: "e5", actor: "agent", onBehalfOf: "Dana" }), null);
});

test("foldWork counts a handoff, the person's return, a wait and an action into one target's figures", () => {
  const folds = foldWork([
    ev("done", 30, { actor: "person", onBehalfOf: null }),
    ev("handoff", 0),
    ev("return", 5, { actor: "person", onBehalfOf: null, detail: { cause: "edited" } }),
    ev("wait", 10, { detail: { phase: "start" } }),
    ev("wait", 25, { detail: { phase: "end" } }),
    ev("action", 26, { actor: "agent:helper" }),
    ev("attention", 27),
  ]);
  assert.deepEqual(folds, [{ target: { kind: "conversation", id: "c1" }, agents: ["agent:planner", "agent:helper"], actions: 1, handoffs: 1, openHandoff: false, returns: 1, attention: 1, waits: 1, waitedMs: 15 * 60_000, waitingSince: null, done: true, firstAt: at(0), lastAt: at(30) }]);
});

test("foldWork keeps an open wait and an open handoff apart per target; a wait end with no start counts nothing", () => {
  const [open, untargeted, unmatched] = foldWork([
    ev("handoff", 0),
    ev("wait", 1, { detail: { phase: "start" } }),
    ev("wait", 2, { actor: "agent:helper", detail: { phase: "start" } }),
    ev("handoff", 2, { target: null }),
    ev("return", 3, { target: null, actor: "person", onBehalfOf: null }),
    ev("wait", 4, { target: { kind: "task", id: "t" }, detail: { phase: "end" } }),
  ]);
  assert.equal(open!.openHandoff, true);
  assert.equal(open!.done, false);
  assert.equal(open!.waits, 2);
  assert.equal(open!.waitedMs, null);
  assert.equal(open!.waitingSince, at(1));
  assert.equal(untargeted!.target, null);
  assert.equal(untargeted!.openHandoff, false);
  assert.deepEqual(untargeted!.agents, ["agent:planner"]);
  assert.equal(unmatched!.waitedMs, null);
  assert.equal(unmatched!.waitingSince, null);
});
