import { describe, expect, it } from "vitest";
import { WORK_EVENT_SCHEMA, WORK_KINDS, actorOf, checkWorkEvent, foldWork, type WorkEvent } from "@/registry/ouro/lib/ouro/ax-work-event";

const at = (min: number) => new Date(Date.UTC(2026, 9, 30, 9, min)).toISOString();
let n = 0;
const ev = (kind: WorkEvent["kind"], min: number, o: Partial<WorkEvent> = {}): WorkEvent => ({
  schema: WORK_EVENT_SCHEMA, id: String(++n), at: at(min), kind, actor: "agent:planner", onBehalfOf: "Ari", subject: { kind: "conversation", ref: "c1" }, why: null, effect: "private", ...o,
});

describe("actorOf", () => {
  it("reads a named agent, an unnamed agent and the person, and nothing else", () => {
    expect(actorOf("agent:planner")).toEqual({ kind: "agent", name: "planner" });
    expect(actorOf("agent")).toEqual({ kind: "agent", name: null });
    expect(actorOf("person")).toEqual({ kind: "person" });
    expect(actorOf("agent:")).toBeNull();
    expect(actorOf("bot:x")).toBeNull();
  });
});

describe("checkWorkEvent", () => {
  it("accepts every kind, and names the first problem with its fix otherwise", () => {
    expect(WORK_KINDS).toHaveLength(6);
    expect(checkWorkEvent(ev("touch", 0))).toMatchObject({ ok: true });
    expect(checkWorkEvent(ev("done", 0, { actor: "person", onBehalfOf: null }))).toMatchObject({ ok: true });
    const bad: [unknown, RegExp][] = [
      [null, /is an object/],
      [[], /is an object/],
      [{ ...ev("touch", 0), schema: "x" }, /schema is "x"/],
      [{ ...ev("touch", 0), id: "" }, /id is missing/],
      [{ ...ev("touch", 0), at: "soon" }, /at is "soon"/],
      [{ ...ev("touch", 0), kind: "poke" }, /kind is "poke"/],
      [{ ...ev("touch", 0), actor: 3 }, /actor is 3/],
      [{ ...ev("touch", 0), onBehalfOf: null }, /names no person/],
      [{ ...ev("touch", 0), onBehalfOf: "" }, /names no person/],
      [{ ...ev("touch", 0), actor: "person" }, /own behalf/],
      [{ ...ev("touch", 0), subject: "c1" }, /subject is not/],
      [{ ...ev("touch", 0), subject: { kind: 1, ref: null } }, /subject is not/],
      [{ ...ev("touch", 0), subject: { kind: "x", ref: 2 } }, /subject is not/],
      [{ ...ev("touch", 0), why: 4 }, /why is not/],
      [{ ...ev("touch", 0), effect: "public" }, /effect is "public"/],
      [ev("wait-on-human", 0), /has no phase/],
      [ev("wait-on-human", 0, { detail: { phase: "later" } }), /has no phase/],
    ];
    for (const [value, problem] of bad) {
      const r = checkWorkEvent(value);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.problem).toMatch(problem);
        expect(r.fix.length).toBeGreaterThan(0);
      }
    }
    expect(checkWorkEvent({ ...ev("touch", 0), subject: { kind: "x", ref: null } })).toMatchObject({ ok: true });
    expect(checkWorkEvent(ev("wait-on-human", 0, { detail: { phase: "end" } }))).toMatchObject({ ok: true });
  });
});

describe("foldWork", () => {
  it("folds a handoff, the person's edit, a wait and the send into one subject's figures", () => {
    const folds = foldWork([
      ev("done", 30, { actor: "person", onBehalfOf: null }),
      ev("handoff", 0),
      ev("return", 5, { actor: "person", onBehalfOf: null, detail: { cause: "edited" } }),
      ev("wait-on-human", 10, { detail: { phase: "start" } }),
      ev("wait-on-human", 25, { detail: { phase: "end", outcome: "replied" } }),
      ev("touch", 26, { actor: "agent:helper" }),
      ev("attention", 27),
    ]);
    expect(folds).toEqual([{
      subject: { kind: "conversation", ref: "c1" }, agents: ["agent:planner", "agent:helper"], touches: 1, handoffs: 1, openHandoff: false, returns: 1, done: true,
      waitedOnHumanMs: 15 * 60_000, waitingSince: null, attention: 1, firstAt: at(0), lastAt: at(30),
    }]);
  });

  it("keeps an open wait and an open handoff, and a discard closes the handoff", () => {
    const [open, discarded, unmatched] = foldWork([
      ev("handoff", 0),
      ev("wait-on-human", 1, { detail: { phase: "start" } }),
      ev("wait-on-human", 2, { actor: "agent:helper", detail: { phase: "start" } }),
      ev("handoff", 2, { subject: { kind: "plan-item", ref: null } }),
      ev("return", 3, { subject: { kind: "plan-item", ref: null }, actor: "person", onBehalfOf: null, detail: { cause: "discarded" } }),
      ev("wait-on-human", 4, { subject: { kind: "task", ref: "t" }, detail: { phase: "end" } }),
    ]);
    expect(open).toMatchObject({ openHandoff: true, done: false, waitedOnHumanMs: null, waitingSince: at(1) });
    expect(discarded).toMatchObject({ subject: { kind: "plan-item", ref: null }, openHandoff: false, returns: 1, agents: ["agent:planner"] });
    expect(unmatched).toMatchObject({ waitedOnHumanMs: null, waitingSince: null });
  });
});
