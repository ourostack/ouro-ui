export { bindAx, defineComponentAx, READ_CONSENTS };
export type { AxAction, AxAgentAction, AxBindings, AxPersonOnlyAction, AxRead, ComponentAx, ReadConsent, ReadTwin, UiEntry };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

import type { Effect } from "./effects.ts";

/**
 * A component's agent side: what an agent may read from it and which of its actions an agent may take, each bound to the
 * CLI command that does the same (its twin). `defineComponentAx` declares it once beside the component; the app binds
 * the twins with `bindAx`, because a component does not know the app's command names; the entries `bindAx` returns go
 * into the X-ray's inventory under `ui`, and the X-ray checks every twin from outside.
 *
 * @claim "each bound to the CLI command that does the same" registry/ouro/ax/component.test.mts verify:testExists(registry/ouro/ax/component.test.mts::bindAx needs a twin for every read and agent action, refuses one for a person-only action, and returns the inventory entries)
 * @claim "the X-ray checks every twin from outside" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow)
 */
const READ_CONSENTS = Object.freeze(["none", "listening"] as const);

/**
 * What a read needs before an agent gets its content: `none`, or `listening`, for what people say (captions, a
 * transcript), which an agent reads only once the person has asked it to follow that meeting. Until then the twin
 * answers `needs-human`, never the content.
 */
type ReadConsent = (typeof READ_CONSENTS)[number];

/** Something an agent may read from the component, with the fields its twin's `--json` carries. */
interface AxRead {
  name: string;
  summary?: string;
  fields: readonly string[];
  consent: ReadConsent;
  /**
   * The read also streams, and its stream delivers lines only on a words trigger (such as `--on mention`): asked for
   * every line, it refuses. Bind the untriggered request as the read's `push` twin and the trigger as its `trigger`.
   *
   * @claim "asked for every line, it refuses" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::the calling components' twins conform: each twin is listed with its effect, person-only words refuse, and listening reads wait for a follow)
   */
  push?: "filtered";
}

interface AxActionBase {
  id: string;
  summary: string;
  effect: Effect;
}

/** An action an agent may take; the app binds its CLI twin. */
interface AxAgentAction extends AxActionBase {
  agent: true;
  personOnly?: never;
}

/** An action only the person takes, with the one-line reason: `bindAx` refuses a twin for it, and its CLI words refuse. */
interface AxPersonOnlyAction extends AxActionBase {
  personOnly: string;
  agent?: never;
}

/** An action: either `agent: true` or `personOnly: "<why>"`, exactly one; a missing or doubled choice is a type error. */
type AxAction = AxAgentAction | AxPersonOnlyAction;

interface ComponentAx {
  readonly component: string;
  readonly reads: readonly AxRead[];
  readonly actions: readonly AxAction[];
}

/**
 * A read's twin: the read command, or, for a read with `push: "filtered"`, the read, the untriggered stream (`push`,
 * which must refuse) and the words trigger that makes it deliver (`trigger`, such as `--on mention`).
 */
type ReadTwin = string | { read: string; push: string; trigger: string };

/**
 * The app's commands for a component's twins, by read name and action id, written as an agent types them, with a
 * reference as a placeholder (`"call mute <meeting>"`). `refuseAs` names the words a person-only action's refusal
 * answers to (`"call unmute"`).
 */
interface AxBindings {
  reads?: Readonly<Record<string, ReadTwin>>;
  actions?: Readonly<Record<string, string>>;
  refuseAs?: Readonly<Record<string, string>>;
}

/** One line of the X-ray inventory's `ui` list: a bound read or action. */
interface UiEntry {
  component: string;
  kind: "read" | "action";
  id: string;
  effect?: Effect;
  twin?: string;
  personOnly?: string;
  consent?: ReadConsent;
  fields?: string[];
  push?: string;
  trigger?: string;
  refuseAs?: string;
}

const oneLine = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && !/[\r\n]/.test(v);

/**
 * Declares a component's agent side and checks it: unique read names and action ids, a field list on each read, a known
 * consent and effect, and each action either `agent: true` or `personOnly` with a one-line reason, never both or
 * neither. A problem throws one line with its fix.
 *
 * @example
 * const mediaTileAx = defineComponentAx({
 *   component: "MediaTile",
 *   reads: [{ name: "participant", summary: "Who is in the tile, and their state.", fields: ["name", "muted", "camera", "speaking", "handRaised", "connection"], consent: "none" }],
 *   actions: [{ id: "pin", summary: "Keep this tile in the person's main view.", effect: "private", agent: true }],
 * });
 * const theirs = "agents never turn on a person's microphone, camera or screen";
 * const toolbarAx = defineComponentAx({
 *   component: "Toolbar",
 *   reads: [],
 *   actions: [
 *     { id: "mute", summary: "Mute the person's microphone.", effect: "others", agent: true },
 *     { id: "leave", summary: "Leave the call.", effect: "others", agent: true },
 *     { id: "raise-hand", summary: "Raise the person's hand.", effect: "others", agent: true },
 *     { id: "unmute", summary: "Turn the person's microphone on.", effect: "others", personOnly: theirs },
 *     { id: "camera", summary: "Turn the person's camera on.", effect: "others", personOnly: theirs },
 *     { id: "share", summary: "Share the person's screen.", effect: "others", personOnly: theirs },
 *   ],
 * });
 *
 * @claim "never both or neither" registry/ouro/ax/component.test.mts verify:testExists(registry/ouro/ax/component.test.mts::an action is agent or person-only, exactly one, and every problem throws one line with its fix)
 */
function defineComponentAx(def: { component: string; reads: readonly AxRead[]; actions: readonly AxAction[] }): ComponentAx {
  const name = def.component;
  const fail = (thing: string, problem: string, fix: string) => new Error(`${name}${thing ? ` ${thing}` : ""}: ${problem}. Fix: ${fix}.`);
  if (!oneLine(name)) throw fail("", "the component has no name", 'component: "<the component\'s export name>"');
  const reads = new Set<string>();
  for (const r of def.reads) {
    if (!oneLine(r.name)) throw fail("read", "a read has no name", 'name: "<what the agent reads>"');
    if (reads.has(r.name)) throw fail(`read "${r.name}"`, "the name is used twice", "give each read its own name");
    reads.add(r.name);
    if (!Array.isArray(r.fields) || r.fields.length === 0 || !r.fields.every(oneLine)) throw fail(`read "${r.name}"`, "it lists no fields", 'fields: ["<a field its twin\'s --json carries>"]');
    if (!(READ_CONSENTS as readonly unknown[]).includes(r.consent)) throw fail(`read "${r.name}"`, `consent is ${JSON.stringify(r.consent)}`, 'consent: "none", or "listening" for what people say');
    if (r.push !== undefined && r.push !== "filtered") throw fail(`read "${r.name}"`, `push is ${JSON.stringify(r.push)}`, 'push: "filtered", or leave it out');
  }
  const ids = new Set<string>();
  for (const a of def.actions) {
    if (!oneLine(a.id)) throw fail("action", "an action has no id", 'id: "<the action, in a word>"');
    const thing = `action "${a.id}"`;
    if (ids.has(a.id)) throw fail(thing, "the id is used twice", "give each action its own id");
    ids.add(a.id);
    if (a.effect !== "private" && a.effect !== "others") throw fail(thing, `effect is ${JSON.stringify(a.effect)}`, 'effect: "private" or "others"');
    const raw = a as { agent?: unknown; personOnly?: unknown };
    if (raw.agent !== undefined && raw.personOnly !== undefined) throw fail(thing, "it says both agent and personOnly", "keep one: agent: true, or personOnly with its reason");
    if (raw.personOnly !== undefined && !oneLine(raw.personOnly)) throw fail(thing, "personOnly needs a one-line reason", 'personOnly: "<why only the person does it>"');
    if (raw.personOnly === undefined && raw.agent !== true) throw fail(thing, "it says neither agent: true nor personOnly", 'add agent: true, or personOnly: "<why only the person does it>"');
  }
  return Object.freeze({ component: name, reads: Object.freeze([...def.reads]), actions: Object.freeze([...def.actions]) });
}

/**
 * Binds a component's twins to the app's commands and returns its entries for the X-ray inventory (`ui`). It throws when
 * a read or an agent action has no twin, a read with `push: "filtered"` has no stream, a person-only action is given a
 * twin, `refuseAs` names an action that is not person-only, or a binding names nothing the component declares.
 *
 * @example
 * const ui = [
 *   ...bindAx(mediaTileAx, { reads: { participant: "call participants <meeting>" }, actions: { pin: "call pin <participant>" } }),
 *   ...bindAx(toolbarAx, {
 *     actions: { mute: "call mute <meeting>", leave: "call leave <meeting>", "raise-hand": "call raise-hand <meeting>" },
 *     refuseAs: { unmute: "call unmute", camera: "call camera", share: "call share" },
 *   }),
 * ];
 * writeFileSync("inventory.json", JSON.stringify({ cli: commandNames, ui }));
 *
 * @claim "a person-only action is given a twin" registry/ouro/ax/component.test.mts verify:testExists(registry/ouro/ax/component.test.mts::bindAx needs a twin for every read and agent action, refuses one for a person-only action, and returns the inventory entries)
 */
function bindAx(ax: ComponentAx, bindings: AxBindings): UiEntry[] {
  const fail = (thing: string, problem: string, fix: string) => new Error(`${ax.component} ${thing}: ${problem}. Fix: ${fix}.`);
  const reads = bindings.reads ?? {};
  const actions = bindings.actions ?? {};
  const refuseAs = bindings.refuseAs ?? {};
  for (const key of Object.keys(reads)) if (!ax.reads.some((r) => r.name === key)) throw fail(`read "${key}"`, "the component declares no such read", `bind one of ${ax.reads.map((r) => `"${r.name}"`).join(", ") || "none"}`);
  for (const key of [...Object.keys(actions), ...Object.keys(refuseAs)]) if (!ax.actions.some((a) => a.id === key)) throw fail(`action "${key}"`, "the component declares no such action", `bind one of ${ax.actions.map((a) => `"${a.id}"`).join(", ") || "none"}`);
  const entries: UiEntry[] = [];
  for (const r of ax.reads) {
    const thing = `read "${r.name}"`;
    const twin = reads[r.name];
    const read = typeof twin === "string" ? twin : twin?.read;
    if (!oneLine(read)) throw fail(thing, "it has no twin", `reads: { "${r.name}": "<the CLI read that gives ${r.fields.join(", ")}>" }`);
    const push = typeof twin === "object" ? twin.push : undefined;
    const trigger = typeof twin === "object" ? twin.trigger : undefined;
    if (r.push === "filtered" && (!oneLine(push) || !oneLine(trigger))) throw fail(thing, "it streams, but its stream or trigger is not bound", `reads: { "${r.name}": { read: "${read}", push: "<the stream asked for every line>", trigger: "<the words trigger, such as --on mention>" } }`);
    if (r.push === undefined && push !== undefined) throw fail(thing, "a stream is bound, but the read does not declare push", 'add push: "filtered" to the read');
    entries.push({ component: ax.component, kind: "read", id: r.name, twin: read, consent: r.consent, fields: [...r.fields], ...(push === undefined ? {} : { push, trigger: trigger! }) });
  }
  for (const a of ax.actions) {
    const thing = `action "${a.id}"`;
    const twin = actions[a.id];
    const words = refuseAs[a.id];
    if (a.agent) {
      if (!oneLine(twin)) throw fail(thing, "an agent action has no twin", `actions: { "${a.id}": "<the CLI command that does it>" }`);
      if (words !== undefined) throw fail(thing, "refuseAs is for a person-only action, and this one is the agent's", `bind it under actions, or make it personOnly`);
      entries.push({ component: ax.component, kind: "action", id: a.id, effect: a.effect, twin });
    } else {
      if (twin !== undefined) throw fail(thing, `only the person does it (${a.personOnly}), so it has no twin`, `move "${twin}" to refuseAs, where its words refuse`);
      if (words !== undefined && !oneLine(words)) throw fail(thing, "refuseAs is empty", `refuseAs: { "${a.id}": "<the CLI words an agent might try>" }`);
      entries.push({ component: ax.component, kind: "action", id: a.id, effect: a.effect, personOnly: a.personOnly, ...(words === undefined ? {} : { refuseAs: words }) });
    }
  }
  return entries;
}
