export { WORK_EVENT_SCHEMA, WORK_KINDS, actorOf, checkWorkEvent, foldWork };
export type { WorkActor, WorkEvent, WorkFold, WorkKind, WorkSubject };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/**
 * The schema name every work event carries, so a reader can tell a draft of this shape from a later one.
 */
const WORK_EVENT_SCHEMA = "ouro-ax.work-event/0";

/**
 * The moments where an agent and a person meet over a piece of work: an agent touched it, handed it
 * to the person, waits on a person, asks for the person's attention, had it sent back, or it was finished.
 */
const WORK_KINDS = ["touch", "handoff", "wait-on-human", "attention", "return", "done"] as const;

type WorkKind = (typeof WORK_KINDS)[number];

/** What the work is about: a conversation, a meeting, a plan item, a task, or anything an app names. */
interface WorkSubject {
  kind: string;
  ref: string | null;
}

/**
 * One attributed work event. `actor` is `agent:<name>`, `agent` or `person`; `onBehalfOf` names the
 * person an agent acts for (null when the person acts). `why` is the agent's stated reason, or why the
 * work came back. `effect` says who sees the result: `private` (the person and their agents) or
 * `others`. `detail` carries a wait's `phase` (`start` or `end`), a return's `cause` or a done's
 * `evidence`.
 */
interface WorkEvent {
  schema: typeof WORK_EVENT_SCHEMA;
  id: string;
  at: string;
  kind: WorkKind;
  actor: string;
  onBehalfOf: string | null;
  subject: WorkSubject;
  why: string | null;
  effect: "private" | "others";
  verb?: string;
  detail?: Record<string, unknown>;
}

/** An actor string split into who acts: a named agent, an unnamed agent, or the person. */
type WorkActor = { kind: "agent"; name: string | null } | { kind: "person" };

/** The actor string read as who acts; anything else is null. */
function actorOf(actor: string): WorkActor | null {
  if (actor === "person") return { kind: "person" };
  if (actor === "agent") return { kind: "agent", name: null };
  const m = /^agent:([A-Za-z0-9._-]{1,64})$/.exec(actor);
  return m ? { kind: "agent", name: m[1]! } : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Whether a value is a work event; when it is not, the first problem and its fix, in one line, so an
 * agent that emits events can repair them from the message alone.
 */
function checkWorkEvent(v: unknown): { ok: true; event: WorkEvent } | { ok: false; problem: string; fix: string } {
  const no = (problem: string, fix: string) => ({ ok: false as const, problem, fix });
  if (!isRecord(v)) return no("a work event is an object", `{ schema: "${WORK_EVENT_SCHEMA}", id, at, kind, actor, onBehalfOf, subject, why, effect }`);
  if (v.schema !== WORK_EVENT_SCHEMA) return no(`schema is ${JSON.stringify(v.schema)}`, `schema: "${WORK_EVENT_SCHEMA}"`);
  if (typeof v.id !== "string" || !v.id) return no("id is missing", 'id: "<the source row\'s id, as a string>"');
  if (typeof v.at !== "string" || Number.isNaN(Date.parse(v.at))) return no(`at is ${JSON.stringify(v.at)}`, 'at: "<an ISO 8601 time>"');
  if (!(WORK_KINDS as readonly unknown[]).includes(v.kind)) return no(`kind is ${JSON.stringify(v.kind)}`, `kind: one of ${WORK_KINDS.join(", ")}`);
  const who = typeof v.actor === "string" ? actorOf(v.actor) : null;
  if (!who) return no(`actor is ${JSON.stringify(v.actor)}`, 'actor: "agent:<name>", "agent" or "person"');
  if (who.kind === "agent" && (typeof v.onBehalfOf !== "string" || !v.onBehalfOf)) return no("an agent's event names no person", 'onBehalfOf: "<the person the agent acts for>"');
  if (who.kind === "person" && v.onBehalfOf !== null) return no("the person acts on their own behalf", "onBehalfOf: null");
  if (!isRecord(v.subject) || typeof v.subject.kind !== "string" || !(typeof v.subject.ref === "string" || v.subject.ref === null)) return no("subject is not { kind, ref }", 'subject: { kind: "conversation", ref: "<id>" }');
  if (!(typeof v.why === "string" || v.why === null)) return no("why is not text or null", "why: \"<the agent's reason>\" or null");
  if (v.effect !== "private" && v.effect !== "others") return no(`effect is ${JSON.stringify(v.effect)}`, 'effect: "private" or "others"');
  if (v.kind === "wait-on-human" && !(isRecord(v.detail) && (v.detail.phase === "start" || v.detail.phase === "end"))) return no("a wait has no phase", 'detail: { phase: "start" } or { phase: "end", outcome }');
  return { ok: true, event: v as unknown as WorkEvent };
}

/** One subject's work, folded from its events. A figure nothing measured is null, never 0. */
interface WorkFold {
  subject: WorkSubject;
  agents: string[];
  touches: number;
  handoffs: number;
  /** Handed to the person and not yet done or sent back. */
  openHandoff: boolean;
  returns: number;
  done: boolean;
  /** Time agents spent waiting on a person, from paired wait events; null when no wait ended. */
  waitedOnHumanMs: number | null;
  /** A wait still open at the last event: when it started. */
  waitingSince: string | null;
  attention: number;
  firstAt: string;
  lastAt: string;
}

/**
 * Work events folded per subject, in the order each subject first appears: what touched it, what it
 * waits on, what came back, and whether it is finished. Apps fold their own events into the same
 * figures, so a person's view and an agent's view of the work agree.
 */
function foldWork(events: readonly WorkEvent[]): WorkFold[] {
  const folds = new Map<string, WorkFold & { open: Map<string, number> }>();
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const e of sorted) {
    const key = `${e.subject.kind}\u0000${e.subject.ref ?? ""}`;
    let f = folds.get(key);
    if (!f) {
      f = { subject: e.subject, agents: [], touches: 0, handoffs: 0, openHandoff: false, returns: 0, done: false, waitedOnHumanMs: null, waitingSince: null, attention: 0, firstAt: e.at, lastAt: e.at, open: new Map() };
      folds.set(key, f);
    }
    f.lastAt = e.at;
    if (e.actor !== "person" && !f.agents.includes(e.actor)) f.agents.push(e.actor);
    if (e.kind === "touch") f.touches++;
    else if (e.kind === "handoff") { f.handoffs++; f.openHandoff = true; f.done = false; }
    else if (e.kind === "return") { f.returns++; if (e.detail?.cause !== "edited") f.openHandoff = false; }
    else if (e.kind === "done") { f.done = true; f.openHandoff = false; }
    else if (e.kind === "attention") f.attention++;
    else if (e.detail?.phase === "start") f.open.set(e.actor, Date.parse(e.at));
    else {
      const since = f.open.get(e.actor);
      if (since !== undefined) {
        f.waitedOnHumanMs = (f.waitedOnHumanMs ?? 0) + Math.max(0, Date.parse(e.at) - since);
        f.open.delete(e.actor);
      }
    }
  }
  return [...folds.values()].map(({ open, ...f }) => {
    const earliest = [...open.values()].sort((a, b) => a - b)[0];
    return { ...f, waitingSince: earliest === undefined ? null : new Date(earliest).toISOString() };
  });
}
