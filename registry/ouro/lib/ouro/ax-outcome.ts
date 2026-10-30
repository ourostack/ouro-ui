export { axError, axEvent, exitCodeOf, isOutcome, isWait, nextStep, OUTCOME_STATES, OUTCOME_VERSION, outcome, outcomeLine, validateOutcome, validateWait, wait, WAIT_STATES, WAIT_VERSION };
export type { AxEvent, Effect, NextStep, Outcome, OutcomeAudience, OutcomeError, OutcomeHuman, OutcomeScope, OutcomeState, Postcondition, Receipt, Validation, Wait, WaitState };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/**
 * Ouro AX outcomes: what an action of an agent interface returns, the same over a CLI's
 * `--json`, an HTTP route and an MCP tool. An agent reads one shape to learn what happened, who
 * can see it, whether that was checked, how to prove it later and what to do next. Framework
 * neutral: it imports nothing.
 */
const OUTCOME_VERSION = "ax.outcome/1";
const WAIT_VERSION = "ax.wait/1";

/**
 * What became of an action.
 * - `done`: it happened; the postcondition says how that is known.
 * - `queued`: accepted, not yet performed; `receipt.id` and `next` follow it.
 * - `planned`: a dry run (`--plan`); nothing happened.
 * - `needs-human`: only a person can take the next step; `human` says why and how to resume.
 * - `uncertain`: it may or may not have happened; reconcile before any retry.
 * - `refused`: checked and not done, with the reason; nothing happened.
 * - `failed`: tried and proven not done.
 */
const OUTCOME_STATES = Object.freeze(["done", "queued", "planned", "needs-human", "uncertain", "refused", "failed"] as const);
type OutcomeState = (typeof OUTCOME_STATES)[number];

/** Who is affected: only the person (and their agents), or other people. */
type Effect = "private" | "others";

/** Who can see the effect, in words a person reads: a name, or the people of a conversation. */
interface OutcomeAudience {
  only: boolean;
  who: string;
}

/** The exact resource the action targets, so an agent can tell one from another. */
interface OutcomeScope {
  kind: string;
  id: string;
  name?: string;
}

/**
 * The semantic check that the effect holds, made separately from the transport's answer: a
 * transport success is not evidence. `holds` is `null` while the effect cannot be
 * observed yet; `how` names what was read.
 */
interface Postcondition {
  checked: boolean;
  holds: boolean | null;
  how: string;
}

/** A durable record of the request: the id that finds it again, when, by whom and why. */
interface Receipt {
  id: string;
  at: string;
  by: string;
  why: string | null;
}

/** One next valid action: an exact command an agent can run, and why it would. */
interface NextStep {
  command: string;
  why: string;
}

/** A stable machine code and one line that says what to do instead. */
interface OutcomeError {
  code: string;
  message: string;
}

/** Why only a person can go on, and the step that resumes once they have. */
interface OutcomeHuman {
  reason: string;
  resume: NextStep;
}

/** The envelope an action returns. */
interface Outcome {
  ax: typeof OUTCOME_VERSION;
  action: string;
  effect: Effect;
  audience: OutcomeAudience;
  scope: OutcomeScope | null;
  state: OutcomeState;
  summary: string;
  postcondition: Postcondition;
  receipt: Receipt | null;
  next: NextStep[];
  error?: OutcomeError;
  human?: OutcomeHuman;
}

/** One thing that happened, with the cursor that resumes after it. */
interface AxEvent {
  cursor: string;
  type: string;
  at: string;
  by: string;
  scope: OutcomeScope | null;
  summary: string;
  data?: Record<string, unknown>;
}

/**
 * What a wait returns.
 * - `satisfied`: it happened; `events` holds what happened.
 * - `waiting`: still waiting (a stream's first line); keep reading or resume.
 * - `timed-out`: nothing happened in time; `resume` waits again from the same cursor.
 * - `gone`: the thing waited on cannot happen any more (deleted, left, closed).
 */
const WAIT_STATES = Object.freeze(["satisfied", "waiting", "timed-out", "gone"] as const);
type WaitState = (typeof WAIT_STATES)[number];

/**
 * A wait for a person or for freshness: typed, resumable from a cursor, and with a callback an
 * agent can subscribe to instead of polling. `fresh` says how current the source is, so an agent can
 * tell "nothing happened" from "nothing was seen".
 */
interface Wait {
  ax: typeof WAIT_VERSION;
  for: string;
  scope: OutcomeScope | null;
  state: WaitState;
  since: string;
  cursor: string | null;
  events: AxEvent[];
  fresh: { state: string; asOf: string | null } | null;
  resume: NextStep | null;
  callback: string | null;
  next: NextStep[];
}

/** Errors are problems that make the envelope untrustworthy; warnings are honest gaps. */
interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const ONLY_YOU: OutcomeAudience = Object.freeze({ only: true, who: "only you" });

/** An exact next step. */
function nextStep(command: string, why: string): NextStep {
  return { command, why };
}

/** A stable error code with its one-line fix. */
function axError(code: string, message: string): OutcomeError {
  return { code, message };
}

/** An event with a cursor. */
function axEvent(fields: Omit<AxEvent, "scope"> & { scope?: OutcomeScope | null }): AxEvent {
  return { scope: null, ...fields };
}

type OutcomeFields = Pick<Outcome, "action" | "state" | "summary"> & Partial<Omit<Outcome, "ax" | "action" | "state" | "summary">>;

/**
 * Builds an outcome with honest defaults: private, only you, nothing checked, without a receipt
 * or next steps. Pass what is known; {@link validateOutcome} says what is missing.
 *
 * @example
 * outcome({ action: "message.send", effect: "others", state: "queued", summary: "Queued for Design sync.",
 *   receipt: { id: "a1b2c3", at: new Date().toISOString(), by: "agent:planner", why: "Sam asked" },
 *   next: [nextStep("tandem outcome a1b2c3 --wait 60s", "see whether it was sent")] });
 */
function outcome(fields: OutcomeFields): Outcome {
  const { action, state, summary, effect = "private", audience = ONLY_YOU, scope = null, postcondition, receipt = null, next = [], error, human } = fields;
  return {
    ax: OUTCOME_VERSION,
    action,
    effect,
    audience: { ...audience },
    scope,
    state,
    summary,
    postcondition: postcondition ?? { checked: false, holds: null, how: "not checked" },
    receipt,
    next,
    ...(error ? { error } : {}),
    ...(human ? { human } : {}),
  };
}

type WaitFields = Pick<Wait, "for" | "state" | "since"> & Partial<Omit<Wait, "ax" | "for" | "state" | "since">>;

/** Builds a wait; a `timed-out` or `waiting` wait needs `resume`, which {@link validateWait} checks. */
function wait(fields: WaitFields): Wait {
  const { for: what, state, since, scope = null, cursor = null, events = [], fresh = null, resume = null, callback = null, next = [] } = fields;
  return { ax: WAIT_VERSION, for: what, scope, state, since, cursor, events, fresh, resume, callback, next };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStep = (v: unknown): v is NextStep => isRecord(v) && isText(v.command) && isText(v.why);

/** Whether a value is an outcome envelope of this version (shape only; {@link validateOutcome} checks its meaning). */
function isOutcome(v: unknown): v is Outcome {
  return isRecord(v) && v.ax === OUTCOME_VERSION && typeof v.state === "string" && (OUTCOME_STATES as readonly string[]).includes(v.state);
}

/** Whether a value is a wait envelope of this version. */
function isWait(v: unknown): v is Wait {
  return isRecord(v) && v.ax === WAIT_VERSION && typeof v.state === "string" && (WAIT_STATES as readonly string[]).includes(v.state);
}

/**
 * Checks an outcome's meaning, not only its shape. The rules:
 * - `done` never rests on a postcondition that failed; one not checked is a warning.
 * - `refused` and `failed` carry an error, and `failed` says whether anyone saw anything through its postcondition.
 * - `queued` and `uncertain` carry a receipt and a next step, and `uncertain` cannot claim to know.
 * - an effect other people see carries a receipt with a why, unless nothing happened (`planned`, `refused`).
 * - `needs-human` carries the reason and the step that resumes.
 * - a next step is an exact command with its why.
 */
function validateOutcome(v: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isOutcome(v)) return { ok: false, errors: [`not an ${OUTCOME_VERSION} envelope: ax must be "${OUTCOME_VERSION}" and state one of ${OUTCOME_STATES.join(", ")}`], warnings };
  if (!isText(v.action)) errors.push("action is empty");
  if (v.effect !== "private" && v.effect !== "others") errors.push('effect is "private" or "others"');
  if (!isRecord(v.audience) || typeof v.audience.only !== "boolean" || !isText(v.audience.who)) errors.push("audience needs only (boolean) and who (words)");
  else if (v.effect === "others" && v.audience.only) errors.push("an effect other people see cannot have an audience of only you");
  if (!isText(v.summary)) errors.push("summary is empty");
  const p = v.postcondition;
  const pOk = isRecord(p) && typeof p.checked === "boolean" && (p.holds === null || typeof p.holds === "boolean") && isText(p.how);
  if (!pOk) errors.push("postcondition needs checked, holds (true, false or null) and how");
  if (!Array.isArray(v.next) || !v.next.every(isStep)) errors.push("every next step needs a command and a why");
  const r = v.receipt;
  const rOk = r === null || (isRecord(r) && isText(r.id) && isText(r.at) && isText(r.by) && (r.why === null || typeof r.why === "string"));
  if (!rOk) errors.push("receipt needs id, at, by and why (or null)");
  const receipt = rOk ? r : null;
  const hasReceipt = receipt !== null;
  const hasNext = Array.isArray(v.next) && v.next.length > 0;
  const e = v.error;
  const hasError = isRecord(e) && isText(e.code) && isText(e.message);
  if (e !== undefined && !hasError) errors.push("error needs a code and a message");
  switch (v.state) {
    case "done":
      if (pOk && p.holds === false) errors.push("done, but the postcondition does not hold");
      if (pOk && !p.checked) warnings.push("done without an independent check: say what it rests on in postcondition.how");
      if (hasError) errors.push("done carries an error");
      break;
    case "queued":
    case "uncertain":
      if (!hasReceipt) errors.push(`${v.state} needs a receipt, so the request can be found again`);
      if (!hasNext) errors.push(`${v.state} needs a next step`);
      if (v.state === "uncertain" && pOk && p.holds !== null) errors.push("uncertain, but the postcondition claims to know");
      break;
    case "refused":
    case "failed":
      if (!hasError) errors.push(`${v.state} needs an error with a code and a message`);
      if (pOk && p.holds === true) errors.push(`${v.state}, but the postcondition says the effect holds`);
      if (!hasNext) warnings.push(`${v.state} without a next step: say what to do instead`);
      break;
    case "needs-human":
      if (!isRecord(v.human) || !isText(v.human.reason) || !isStep(v.human.resume)) errors.push("needs-human needs human.reason and human.resume");
      break;
    case "planned":
      if (pOk && p.holds === true) errors.push("planned, but the postcondition says the effect holds");
      break;
  }
  if (v.effect === "others" && ["done", "queued", "uncertain"].includes(v.state) && !isText(receipt?.why)) errors.push("an effect other people see needs a receipt with a why");
  return { ok: errors.length === 0, errors, warnings };
}

/** Checks a wait: a wait that can go on names how to resume it, and a satisfied one carries what happened. */
function validateWait(v: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isWait(v)) return { ok: false, errors: [`not an ${WAIT_VERSION} envelope: ax must be "${WAIT_VERSION}" and state one of ${WAIT_STATES.join(", ")}`], warnings };
  if (!isText(v.for)) errors.push("for is empty: say what is awaited");
  if (!isText(v.since)) errors.push("since is empty");
  if (!Array.isArray(v.events)) errors.push("events is a list");
  else if (v.state === "satisfied" && v.events.length === 0) errors.push("satisfied, but no event says what happened");
  if ((v.state === "waiting" || v.state === "timed-out") && !isStep(v.resume)) errors.push(`${v.state} needs resume: the exact command that waits again from the cursor`);
  if (v.resume !== null && !isStep(v.resume)) errors.push("resume needs a command and a why");
  if (v.state !== "gone" && v.cursor === null) warnings.push("no cursor: a resumed wait may miss or repeat events");
  if (v.fresh === null) warnings.push("no freshness: nothing seen is not the same as nothing happened");
  if (!Array.isArray(v.next) || !v.next.every(isStep)) errors.push("every next step needs a command and a why");
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * The exit code a CLI gives a state, from the table below.
 *
 * @claim "The exit code a CLI gives a state" registry/ouro/lib/ouro/ax-outcome.test.ts verify:testExists(registry/ouro/lib/ouro/ax-outcome.test.ts::exitCodeOf and outcomeLine > gives every state its exit code)
 */
function exitCodeOf(state: OutcomeState): number {
  return { done: 0, planned: 0, failed: 1, refused: 2, queued: 7, uncertain: 7, "needs-human": 8 }[state];
}

/** The outcome as one line for a person, followed by its next steps. */
function outcomeLine(o: Outcome): string {
  const lines = [o.summary];
  if (o.error && !o.summary.includes(o.error.message)) lines.push(o.error.message);
  if (o.postcondition.checked) lines.push(`Checked: ${o.postcondition.how}.`.replace(/\.\.$/, "."));
  if (o.human) lines.push(`Needs the person: ${o.human.reason} Then: ${o.human.resume.command}`);
  for (const n of o.next) lines.push(`Next: ${n.command}  (${n.why})`);
  return lines.join("\n");
}
