export const COMPOSED_VERSION = "1";

// Vendored from ourostack/ouro-ui-core v0.21.0: src/composed.mts, src/mcp-app.mts, src/a2ui.mts, joined into one file by scripts/core-bundle.mts
// with the imports between them taken out. Never edit it: run `node scripts/core-bundle.mts --update <tag>`.

// COMPOSED_VERSION above is the version of Ouro's composed-UI tree. (No comment goes before the first statement:
// shadcn's CLI drops it when web's registry installs this file.)
//
// Ouro's own composed UI: what an agent may put on a person's screen, independent of the format it arrived in. It holds
// the component specs, the action and consent rules for a composed button, the tree every renderer draws, the
// validator for that tree, and what a press sends. Decision: docs/decisions/2026-11-14-composed-ui-own-tree.md.
//
// Formats are adapters at the edge. A2UI (src/a2ui.mts) turns a message stream into this tree, and MCP Apps
// (src/mcp-app.mts) carries a tree, or an A2UI stream, to a host. A renderer draws the tree and nothing else, so adding or
// dropping a format costs one adapter, never a renderer or a catalog.
//
// It imports nothing, so it runs in a browser, a server or a test as it is. Apps vendor it from a release as
// `ouro-composed.mts`, beside each adapter they use.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Obj = { [k: string]: Json };

// ---------------------------------------------------------------------------------------------------------------
// The components
// ---------------------------------------------------------------------------------------------------------------

/** A prop's kind: what the validator checks and what the resolver produces. */
export type PropKind =
  | { kind: "string" } // DynamicString
  | { kind: "strings" } // DynamicStringList
  | { kind: "children" } // ChildList
  | { kind: "enum"; values: readonly string[]; default: string }
  | { kind: "boolean"; default: boolean } // DynamicBoolean
  | { kind: "level"; default: number } // integer 1 to 3
  | { kind: "terms" } // [{ term, detail }] or a binding to one
  | { kind: "action" } // ActionButton.action
  | { kind: "input" } // ActionButton.input
  | { kind: "path" }; // DataBinding: where a field writes the person's answer, a JSON pointer

export interface Prop {
  description: string;
  required?: boolean;
  type: PropKind;
}

export interface ComponentSpec {
  /** For an agent: what it is and when to use it. One line. */
  description: string;
  props: Readonly<Record<string, Prop>>;
}

const TONES = ["neutral", "info", "success", "warning", "danger"] as const;

/**
 * Ouro HX's catalog components, named as on web. A component joins only when web and Apple both render it and a
 * conformance case covers it. `ActionButton` joins an app's catalog, with the app's actions.
 */
export const COMPONENTS: Readonly<Record<string, ComponentSpec>> = Object.freeze({
  Card: {
    description: "A raised surface that groups one thing's content; its children stack vertically.",
    props: { children: { description: "What the card holds, top to bottom.", required: true, type: { kind: "children" } } },
  },
  Stack: {
    description: "Lays children out in a column or a row with HX spacing.",
    props: {
      children: { description: "What the stack holds, in order.", required: true, type: { kind: "children" } },
      direction: { description: "vertical stacks top to bottom; horizontal lays out a row that wraps.", type: { kind: "enum", values: ["vertical", "horizontal"], default: "vertical" } },
      gap: { description: "Space between children, from HX's spacing scale.", type: { kind: "enum", values: ["none", "small", "medium", "large"], default: "medium" } },
    },
  },
  Heading: {
    description: "A title. Level 1 is a card's or page's title, 2 a section, 3 a subsection.",
    props: {
      text: { description: "The heading's words.", required: true, type: { kind: "string" } },
      level: { description: "1, 2 or 3.", type: { kind: "level", default: 2 } },
    },
  },
  Text: {
    description: "A paragraph of plain text.",
    props: {
      text: { description: "The words, plain text without Markdown.", required: true, type: { kind: "string" } },
      tone: { description: "muted for secondary text such as a byline or a note.", type: { kind: "enum", values: ["default", "muted"], default: "default" } },
    },
  },
  Image: {
    description: "A picture with a description for people who can't see it.",
    props: {
      url: { description: "The image's https URL.", required: true, type: { kind: "string" } },
      description: { description: "What the picture shows, for a screen reader; never \"image of\".", required: true, type: { kind: "string" } },
      aspect: { description: "The frame's shape; the picture fills it.", type: { kind: "enum", values: ["landscape", "square", "portrait", "wide"], default: "landscape" } },
    },
  },
  Badge: {
    description: "A short label for a status or a category, such as \"Vegetarian\".",
    props: {
      text: { description: "One to three words.", required: true, type: { kind: "string" } },
      tone: { description: "neutral unless the label is a status.", type: { kind: "enum", values: TONES, default: "neutral" } },
    },
  },
  List: {
    description: "A list of short plain-text items, such as ingredients or steps.",
    props: {
      items: { description: "The items, in order.", required: true, type: { kind: "strings" } },
      ordered: { description: "true numbers the items, for steps that happen in order.", type: { kind: "boolean", default: false } },
    },
  },
  DescriptionList: {
    description: "Pairs of a term and its detail, such as \"Time\" and \"25 min\".",
    props: { items: { description: "The pairs, each { term, detail }.", required: true, type: { kind: "terms" } } },
  },
  Separator: {
    description: "A hairline between groups of content.",
    props: {},
  },
  Alert: {
    description: "A message the person should notice: a warning, an error, a success or information.",
    props: {
      title: { description: "One line saying what happened.", required: true, type: { kind: "string" } },
      text: { description: "What to do about it, if anything.", type: { kind: "string" } },
      tone: { description: "How serious it is.", type: { kind: "enum", values: ["info", "success", "warning", "danger"], default: "info" } },
    },
  },
  TextField: {
    description: "A field the person types an answer into. It starts with what the data model holds at value and writes their answer there; bind an ActionButton's input to the same path, and pressing it sends what they typed.",
    props: {
      label: { description: "What the field asks for, in a few words, such as \"Servings\".", required: true, type: { kind: "string" } },
      value: { description: "Where the answer goes, as a JSON pointer into the data model, such as /servings.", required: true, type: { kind: "path" } },
      hint: { description: "One line under the field saying what to enter, when the label isn't enough.", type: { kind: "string" } },
      type: { description: "text for words; number when the answer is a number, which the field writes as one.", type: { kind: "enum", values: ["text", "number"], default: "text" } },
      multiline: { description: "true for a longer answer over several lines, such as a note.", type: { kind: "boolean", default: false } },
    },
  },
  Checkbox: {
    description: "A yes-or-no choice the person ticks. It starts with what the data model holds at value and writes true or false there.",
    props: {
      label: { description: "The choice, said so that ticking it means yes, such as \"Make it vegetarian\".", required: true, type: { kind: "string" } },
      value: { description: "Where the answer goes, as a JSON pointer into the data model, such as /vegetarian.", required: true, type: { kind: "path" } },
      hint: { description: "One line under the choice, when the label isn't enough.", type: { kind: "string" } },
    },
  },
  Select: {
    description: "One choice from a short list. It starts with what the data model holds at value and writes the chosen option there, as text.",
    props: {
      label: { description: "What the person is choosing, in a few words, such as \"Oven\".", required: true, type: { kind: "string" } },
      value: { description: "Where the choice goes, as a JSON pointer into the data model, such as /oven.", required: true, type: { kind: "path" } },
      options: { description: "The choices, in order, as the person reads them.", required: true, type: { kind: "strings" } },
      hint: { description: "One line under the list, when the label isn't enough.", type: { kind: "string" } },
    },
  },
});

/** The components a person answers with: each writes to the data model at its `value`. */
export const INPUT_COMPONENTS: readonly string[] = Object.freeze(["TextField", "Checkbox", "Select"]);

export const ACTION_BUTTON: ComponentSpec = {
  description: "A button for one of the app's declared actions. Its label and what pressing it does come from the action, so you choose only the action, the input you prepared and its emphasis.",
  props: {
    action: { description: "The action's id.", required: true, type: { kind: "action" } },
    input: { description: "The input you prepared, by field name; a value may bind to the data model with {\"@path\"}, and one bound to a field the person fills in is read when they press. Never give input to a person-only action.", type: { kind: "input" } },
    emphasis: { description: "primary for the one main action on a surface; secondary for the rest.", type: { kind: "enum", values: ["primary", "secondary"], default: "secondary" } },
  },
};

// ---------------------------------------------------------------------------------------------------------------
// The action and consent rules for a composed button
// ---------------------------------------------------------------------------------------------------------------

/** An action's consent class (src/actions.mts). */
export type Consent = "read" | "write" | "consequential" | "person-only";
/** What pressing an action's button does: run it, confirm then run it, or hand the person to the app's own screen. */
export type Press = "run" | "confirm" | "handoff";

export const pressOf = (consent: Consent): Press => (consent === "person-only" ? "handoff" : consent === "consequential" ? "confirm" : "run");

/** The typed refusal every agent door answers a person-only action with (src/actions.mts `refusal`), as JSON. */
export interface Refusal {
  ax: "outcome/1";
  action: string;
  state: "refused";
  summary: string;
  error: { code: "person-only"; exit: number; thing: string; problem: string; fix: null; message: string };
  [k: string]: unknown;
}

/** An action as the catalog carries it, for renderers that have only the catalog. */
export interface CatalogAction {
  consent: Consent;
  press: Press;
  label: string;
  description: string;
  input: Record<string, { label: string; kind: "string" | "number" | "integer" | "boolean" | "enum"; optional: boolean; values?: string[]; shownAs?: string }>;
  /** For a person-only action: where the person does it, and the refusal every agent door answers. */
  personOnly?: { how: string; refusal: Refusal };
}

/** What a renderer needs from a catalog, in any format: its id, its components and what each action's button does. */
export interface Catalog {
  catalogId: string;
  components: Record<string, ComponentSpec>;
  actions: Record<string, CatalogAction>;
}

/** HX's components, plus ActionButton when the catalog has actions. A catalog can't widen HX's specs. */
export const componentsFor = (actions: Readonly<Record<string, CatalogAction>>): Record<string, ComponentSpec> =>
  Object.keys(actions).length ? { ...COMPONENTS, ActionButton: ACTION_BUTTON } : { ...COMPONENTS };

/** Why an agent can't press a button through the screen, whatever the format asked: agents use their own doors. */
export function agentPressProblem(cat: Catalog, name: unknown): { message: string; refusal?: Refusal } {
  const a = typeof name === "string" ? own(cat.actions, name) : undefined;
  if (a?.personOnly) return { message: a.personOnly.refusal.summary, refusal: a.personOnly.refusal };
  if (a) return { message: `${name} is an action, and agents run actions through their own tool (MCP ${name}), not through the person's screen.` };
  return { message: `This catalog has no functions an agent may call${typeof name === "string" ? `, so ${name} is not one` : ""}.` };
}

// ---------------------------------------------------------------------------------------------------------------
// The tree every renderer draws
// ---------------------------------------------------------------------------------------------------------------

/** A value bound to the data model: `{ "@path": "/servings" }`. In a tree, the path is absolute. */
export const isBinding = (v: unknown): v is { "@path": string } => isObj(v) && typeof v["@path"] === "string" && Object.keys(v).length === 1;

/** A pointer segment that would reach an object's prototype instead of the data: never followed or written. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const segments = (pointer: string) => pointer.replace(/^\//, "").split("/").map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));

/** Whether no segment of a pointer, absolute or relative, names an object's prototype (ouro-ui-core#91). */
export const isSafePointer = (pointer: string): boolean => !segments(pointer).some((k) => UNSAFE_KEYS.has(k));

/** Whether a pointer stays in the data: absolute, and safe. */
export const isDataPointer = (pointer: string): boolean => pointer.startsWith("/") && isSafePointer(pointer);

/** Reads a JSON pointer (RFC 6901). A missing value is undefined, and so is anything the data doesn't itself hold. */
export function getPointer(data: Json, pointer: string): Json | undefined {
  if (pointer === "" || pointer === "/") return data;
  let cur: Json | undefined = data;
  for (const raw of pointer.replace(/^\//, "").split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(cur)) cur = /^\d+$/.test(key) ? cur[Number(key)] : undefined;
    else if (cur && typeof cur === "object") cur = Object.hasOwn(cur, key) ? (cur as Obj)[key] : undefined;
    else return undefined;
    if (cur === undefined) return undefined;
  }
  return cur;
}

/**
 * Writes a JSON pointer, creating objects on the way; null deletes. It returns a copy and leaves `data` as it was. A
 * pointer with a segment that names an object's prototype writes nothing.
 */
export function setPointer(data: Json, pointer: string, value: Json): Json {
  if (pointer === "" || pointer === "/") return value === null ? {} : value;
  const keys = segments(pointer);
  if (keys.some((k) => UNSAFE_KEYS.has(k))) return data;
  const root: Json = data && typeof data === "object" ? structuredClone(data) : {};
  let cur = root as Obj | Json[];
  keys.forEach((k, i) => {
    const last = i === keys.length - 1;
    const container = cur as Obj & Json[];
    const index = Array.isArray(cur) && /^\d+$/.test(k) ? Number(k) : k;
    if (last) {
      if (value === null) {
        if (Array.isArray(cur) && typeof index === "number") cur.splice(index, 1);
        else delete (cur as Obj)[k];
      } else (container as unknown as Record<string | number, Json>)[index] = value;
      return;
    }
    const next = Object.hasOwn(container, index) ? (container as unknown as Record<string | number, Json>)[index] : undefined;
    if (!next || typeof next !== "object") (container as unknown as Record<string | number, Json>)[index] = {};
    cur = (container as unknown as Record<string | number, Json>)[index] as Obj;
  });
  return root;
}

/** A value as text: numbers and booleans as written, null and missing as "", others as JSON (A2UI's conversion too). */
export function asText(v: Json | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** The input fields a confirm sheet has a row for, in order: each prepared one, less a name that stands in for an id. */
function confirmKeys(a: CatalogAction, input: Obj): string[] {
  const names = new Set(Object.entries(a.input).filter(([k, f]) => Object.hasOwn(input, k) && f.shownAs !== undefined && Object.hasOwn(a.input, f.shownAs)).map(([, f]) => f.shownAs!));
  return Object.keys(a.input).filter((k) => Object.hasOwn(input, k) && !names.has(k));
}

/**
 * The rows of a confirm sheet: each prepared input with the person's label. An id shows its name (the app's resolver,
 * else the sibling `shownAs` names, else the value itself), with the id as `raw` when the name replaced it; a name
 * field that stands in for an id has no row of its own. Only an id field (one with `shownAs`) shows a name; every
 * other row shows exactly what will be sent.
 */
function confirmFields(action: string, a: CatalogAction, input: Obj, options: ResolveOptions): { label: string; value: string; raw?: string; bind?: string }[] {
  return confirmKeys(a, input)
    .map((k) => [k, a.input[k]!] as const)
    .map(([k, f]) => {
      // The person's own answer, read when they press (resolveButton): it shows as they wrote it.
      const bound = input[k];
      if (isBinding(bound)) return { label: f.label, value: "", bind: bound["@path"] };
      const raw = asText(input[k]);
      const sibling = f.shownAs !== undefined ? input[f.shownAs] : undefined;
      const prepared = typeof sibling === "string" && sibling.trim() !== "" ? sibling.trim() : undefined;
      // Only an id field (one with shownAs) shows a name; every other row shows exactly what will be sent.
      const value = (f.shownAs !== undefined ? (options.label?.({ action, field: k, value: raw, input }) ?? prepared) : undefined) ?? raw;
      return value === raw ? { label: f.label, value } : { label: f.label, value, raw };
    });
}

/** What a resolver is asked to name: one prepared input of a button that confirms. */
export interface LabelContext {
  action: string;
  field: string;
  /** The prepared value, as text: the id. */
  value: string;
  /** Every prepared input of the button. */
  input: Obj;
}

export interface ResolveOptions {
  /**
   * The app's own word for an id, from its own data, such as a recipe's title for `rcp_lemon_orzo`; undefined to leave it
   * to the field's `shownAs`, then to the value itself. It is asked for each id field a confirm sheet shows (one whose
   * catalog input has `shownAs`), and wins over what the agent prepared, since the agent's text is the one thing the
   * person can't check. Every other row shows exactly what will be sent.
   */
  label?: (context: LabelContext) => string | undefined;
}

/**
 * A node of the composed tree: the component, its props with every value resolved and every default filled, and its
 * children. An adapter produces it; every renderer draws exactly it. An ActionButton's label, consent, press, confirm
 * sheet and handoff come from the catalog (`actionButtonProps`), never from the format.
 */
export interface ComposedNode {
  /** The component's id, which a press names as its source. A template's instances share it. */
  id: string;
  component: string;
  props: Obj;
  children: ComposedNode[];
}

/** The props of an ActionButton for an action and the input an agent prepared: everything else comes from the catalog. */
export function actionButtonProps(cat: Catalog, action: string, prepared: Obj, options: ResolveOptions = {}): Obj {
  const a = cat.actions[action]!;
  const input: Obj = a.personOnly ? {} : prepared;
  const props: Obj = { action, label: a.label, consent: a.consent, press: a.press, input };
  if (a.press === "confirm") props.confirm = { title: a.label, description: a.description, fields: confirmFields(action, a, input, options) };
  if (a.personOnly) props.handoff = a.personOnly.how;
  return props;
}

/** A problem in a composed tree: a JSON pointer into it, and one sentence; the typed refusal when one applies. */
export interface TreeProblem {
  path: string;
  message: string;
  refusal?: Refusal;
}

/** A JSON object (not null, not an array). The A2UI adapter uses it too, so the modules declare no name twice. */
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A catalog entry by a name a sender chose, only when the catalog itself has it: `constructor` or `toString` is never a
 * component, an action or an input field (ouro-ui-core#91).
 */
export const own = <T,>(record: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);
const BUTTON_PROPS = ["action", "label", "consent", "press", "input", "confirm", "handoff", "emphasis", "@label"];

function checkProp(problems: TreeProblem[], key: string, p: Prop, v: unknown, at: string): void {
  const t = p.type;
  const bad = (expected: string) => problems.push({ path: at, message: `${key} is ${expected}, got ${JSON.stringify(v)}.` });
  switch (t.kind) {
    case "string":
      if (typeof v !== "string") bad("text");
      break;
    case "strings":
      if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) bad("a list of text");
      break;
    case "boolean":
      if (typeof v !== "boolean") bad("true or false");
      break;
    case "enum":
      if (typeof v !== "string" || !t.values.includes(v)) bad(`one of ${t.values.join(", ")}`);
      break;
    case "level":
      if (v !== 1 && v !== 2 && v !== 3) bad("1, 2 or 3");
      break;
    case "path":
      if (typeof v !== "string" || !isDataPointer(v)) bad("a JSON pointer into the data model, such as /servings");
      break;
    case "terms":
      if (!Array.isArray(v) || !v.every((it) => isObj(it) && typeof it.term === "string" && typeof it.detail === "string" && Object.keys(it).length === 2)) bad("a list of { term, detail } text");
      break;
    case "children":
    case "action":
    case "input":
      break;
  }
}

/**
 * A confirm sheet's rows against the rows the catalog gives for the prepared input: the same fields, in order, with the
 * catalog's labels, and each row showing what will be sent (its `raw`, or its `value` when it has none) or, for a bound
 * input, the same binding. Only the words shown for an id may differ, since the app's own resolver names it.
 */
function confirmRowProblems(problems: TreeProblem[], id: string, a: CatalogAction, input: Obj, rows: unknown[], at: string): void {
  const expected = confirmFields(id, a, input, {});
  const keys = confirmKeys(a, input);
  const bad = () => problems.push({ path: at, message: `${id}'s confirm sheet shows a row for each prepared input, with its label and the value that will be sent; the catalog's rows are ${JSON.stringify(expected)}.` });
  if (rows.length !== expected.length) return void bad();
  rows.forEach((row, i) => {
    const want = expected[i]!;
    if (!isObj(row) || row.label !== want.label) return void bad();
    if (want.bind !== undefined) {
      if (row.bind !== want.bind || row.raw !== undefined) bad();
    } else if (row.bind !== undefined || typeof row.value !== "string") bad();
    // An id field may show a name, with the id beside it; any other row shows exactly what will be sent.
    else if (a.input[keys[i]!]!.shownAs !== undefined ? (row.raw ?? row.value) !== (want.raw ?? want.value) : row.value !== want.value || row.raw !== undefined) bad();
  });
}

/**
 * Every problem in a composed tree against a catalog: each component is the catalog's, each prop is resolved and of its
 * kind, and each ActionButton is exactly what the catalog says its action's button is, so no adapter and no sender can
 * relabel a button or loosen its consent. An empty list means it renders.
 */
export function validateTree(cat: Catalog, node: unknown, path = ""): TreeProblem[] {
  const problems: TreeProblem[] = [];
  const visit = (n: unknown, at: string): void => {
    if (!isObj(n) || typeof n.id !== "string" || typeof n.component !== "string" || !isObj(n.props) || !Array.isArray(n.children)) {
      problems.push({ path: at, message: "A node is { id, component, props, children }." });
      return;
    }
    const spec = own(cat.components, n.component);
    if (!spec) {
      problems.push({ path: `${at}/component`, message: `${JSON.stringify(n.component)} is not in this catalog; use one of ${Object.keys(cat.components).join(", ")}.` });
      return;
    }
    const props = n.props;
    const allowed = n.component === "ActionButton" ? BUTTON_PROPS : [...Object.keys(spec.props).filter((k) => spec.props[k]!.type.kind !== "children"), "@label"];
    for (const key of Object.keys(props)) if (!allowed.includes(key)) problems.push({ path: `${at}/props/${key}`, message: `${n.component} has no ${key}.` });
    if (props["@label"] !== undefined && typeof props["@label"] !== "string") problems.push({ path: `${at}/props/@label`, message: "@label is text." });
    for (const [key, p] of Object.entries(spec.props)) {
      if (p.type.kind === "children" || p.type.kind === "action" || p.type.kind === "input") continue;
      const v = props[key];
      if (v === undefined) {
        if (p.required) problems.push({ path: `${at}/props/${key}`, message: `${n.component} needs ${key}: ${p.description}` });
        continue;
      }
      checkProp(problems, key, p, v, `${at}/props/${key}`);
    }
    if (n.component === "ActionButton") {
      const id = props.action;
      const a = typeof id === "string" ? own(cat.actions, id) : undefined;
      if (!a || typeof id !== "string") problems.push({ path: `${at}/props/action`, message: `${JSON.stringify(id)} is not one of the app's actions: ${Object.keys(cat.actions).join(", ")}.` });
      else {
        const input = props.input;
        if (!isObj(input)) problems.push({ path: `${at}/props/input`, message: "input is an object of field values." });
        else if (a.personOnly && Object.keys(input).length) problems.push({ path: `${at}/props/input`, message: a.personOnly.refusal.summary, refusal: a.personOnly.refusal });
        else {
          for (const [k, v] of Object.entries(input)) {
            // A field the catalog doesn't carry would be sent without a row on the confirm sheet.
            if (own(a.input, k) === undefined) problems.push({ path: `${at}/props/input/${k}`, message: `${id} has no input ${k}; its fields are ${Object.keys(a.input).join(", ") || "none"}.` });
            if (isObj(v) && "@path" in v && !(isBinding(v) && isDataPointer(v["@path"]))) problems.push({ path: `${at}/props/input/${k}`, message: `${k} is a value, or {"@path": "/..."} bound to the data model.` });
          }
          const expected = actionButtonProps(cat, id, input as Obj);
          for (const key of ["label", "consent", "press", "handoff"]) {
            if (JSON.stringify(props[key]) !== JSON.stringify(expected[key])) problems.push({ path: `${at}/props/${key}`, message: `${id}'s ${key} is the catalog's ${JSON.stringify(expected[key] ?? null)}, never the sender's.` });
          }
          if (a.press === "confirm") {
            const c = props.confirm;
            if (!isObj(c) || c.title !== a.label || c.description !== a.description || !Array.isArray(c.fields)) problems.push({ path: `${at}/props/confirm`, message: `${id} confirms, with the catalog's title and description and a row per prepared input.` });
            else confirmRowProblems(problems, id, a, input as Obj, c.fields, `${at}/props/confirm/fields`);
          } else if (props.confirm !== undefined) problems.push({ path: `${at}/props/confirm`, message: `${id} doesn't confirm; only a consequential action does.` });
        }
      }
    }
    if (spec.props.children === undefined && n.children.length) problems.push({ path: `${at}/children`, message: `${n.component} has no children.` });
    n.children.forEach((c, i) => visit(c, `${at}/children/${i}`));
  };
  visit(node, path);
  return problems;
}

/** What a press asks the app to do, in any format: the action, the prepared input, and that the person pressed it. */
export interface PersonPress {
  action: string;
  input: Obj;
  consent: Consent;
  /** The button's label, as the person read it. */
  label: string;
  by: "person";
  confirmed?: true;
}

/**
 * A button as it stands when the person presses it: each input bound to the data model (`{"@path"}`) replaced by what
 * `data` holds there now (null when nothing), and each bound row of its confirm sheet showing that value. A renderer
 * calls it with its current data before it shows the confirm sheet or presses.
 */
export function resolveButton(button: ComposedNode, data: Json): ComposedNode {
  const p = button.props;
  if (!isObj(p.input) || !Object.values(p.input).some(isBinding)) return button;
  const input: Obj = Object.fromEntries(Object.entries(p.input).map(([k, v]) => [k, isBinding(v) ? (getPointer(data, v["@path"]) ?? null) : v]));
  const props: Obj = { ...p, input };
  if (isObj(p.confirm) && Array.isArray(p.confirm.fields)) {
    const fields = p.confirm.fields.map((row) => (isObj(row) && typeof row.bind === "string" ? { label: row.label as Json, value: asText(getPointer(data, row.bind)) } : row));
    props.confirm = { ...p.confirm, fields };
  }
  return { ...button, props };
}

/**
 * What pressing a composed button asks the app to do (after confirming, for a consequential one). A person-only button
 * never asks: it hands the person to the app's own screen. An adapter wraps it in its format's message. With `data`,
 * an input bound to a field the person filled in is read from it (resolveButton).
 */
export function personPress(button: ComposedNode, confirmed?: boolean, data?: Json): PersonPress {
  const p = (data === undefined ? button : resolveButton(button, data)).props;
  if (p.press === "handoff") throw new Error(`${String(p.action)} is person-only; its button hands the person to the app, so it sends no action.`);
  if (p.press === "confirm" && confirmed !== true) throw new Error(`${String(p.action)} is consequential; send its action only after the person confirms.`);
  return { action: p.action as string, input: p.input as Obj, consent: p.consent as Consent, label: p.label as string, by: "person", ...(p.press === "confirm" ? { confirmed: true as const } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------
// Updating a tree a renderer already draws
// ---------------------------------------------------------------------------------------------------------------

/**
 * A change to a tree a renderer already draws, so an agent sends what changed instead of the whole tree (A2UI's
 * `updateComponents` and `updateDataModel`). Each of `nodes` replaces the tree's one node with its id, children and all.
 * Each of `data` sets the value at its JSON pointer in the data model, and null deletes it (`setPointer`); `/` is the
 * whole data model. Nodes apply in order, each to the tree the ones before it left, then data, in order.
 */
export interface TreeUpdate {
  nodes?: ComposedNode[];
  data?: { path: string; value: Json }[];
}

/**
 * Every problem in an update that needs no tree: its shape, each node against the catalog (`validateTree`, at
 * `/nodes/<i>`) and each data path, which is absolute and never names an object's prototype (`isDataPointer`). A sender
 * checks this; `applyTreeUpdate` checks it too, then the ids and the tree it gives.
 */
export function treeUpdateProblems(cat: Catalog, update: unknown): TreeProblem[] {
  const shape = "An update is { nodes?, data? }: nodes replace the tree's nodes by id, and data sets values by JSON pointer.";
  if (!isObj(update)) return [{ path: "", message: shape }];
  const notJson = nonJsonAt(update, "", new Set());
  if (notJson !== undefined) return [{ path: notJson, message: "An update is JSON: text, finite numbers, true, false, null, lists and objects." }];
  const problems: TreeProblem[] = [];
  for (const key of Object.keys(update)) if (key !== "nodes" && key !== "data") problems.push({ path: `/${key}`, message: `An update has no ${key}. ${shape}` });
  const { nodes, data } = update;
  if (nodes !== undefined) {
    if (!Array.isArray(nodes)) problems.push({ path: "/nodes", message: "nodes is a list of nodes, each replacing the tree's node with its id." });
    else nodes.forEach((n, i) => problems.push(...validateTree(cat, n, `/nodes/${i}`)));
  }
  if (data !== undefined) {
    if (!Array.isArray(data)) problems.push({ path: "/data", message: "data is a list of { path, value }, each setting the data model at a JSON pointer." });
    else
      data.forEach((d, i) => {
        if (!isObj(d) || !("value" in d) || d.value === undefined || Object.keys(d).some((k) => k !== "path" && k !== "value")) problems.push({ path: `/data/${i}`, message: "A data entry is { path, value }: value is JSON, and null deletes." });
        else if (typeof d.path !== "string" || !isDataPointer(d.path)) problems.push({ path: `/data/${i}/path`, message: "path is a JSON pointer into the data model, such as /servings, and never names __proto__, constructor or prototype." });
      });
  }
  return problems;
}

/** Where a value first stops being JSON (as JSON.stringify would lose or change it), or undefined when it is JSON. */
function nonJsonAt(v: unknown, at: string, seen: Set<object>): string | undefined {
  if (v === null || typeof v === "string" || typeof v === "boolean") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? undefined : at;
  if (typeof v !== "object" || seen.has(v) || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)) return at;
  seen.add(v);
  const entries: [string, unknown][] = Array.isArray(v) ? Array.from(v, (x, i) => [String(i), x]) : Object.entries(v);
  for (const [k, x] of entries) {
    const found = nonJsonAt(x, `${at}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, seen);
    if (found !== undefined) return found;
  }
  seen.delete(v);
  return undefined;
}

/** Why setting `pointer` in `data` would not give JSON: a list is written only at an index from 0 to its length. */
function listIndexProblem(data: Json, pointer: string): string | undefined {
  let cur: Json | undefined = data;
  for (const k of segments(pointer)) {
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(k) || Number(k) > cur.length) return `${pointer} names ${JSON.stringify(k)} in a list of ${cur.length}; in a list, a segment is an index from 0 to ${cur.length}.`;
      cur = cur[Number(k)];
    } else if (isObj(cur)) cur = Object.hasOwn(cur, k) ? cur[k] : undefined;
    else return undefined;
  }
  return undefined;
}

const countId = (n: ComposedNode, id: string): number => (n.id === id ? 1 : 0) + n.children.reduce((sum, c) => sum + countId(c, id), 0);
const replaceNode = (n: ComposedNode, by: ComposedNode): ComposedNode => (n.id === by.id ? by : { ...n, children: n.children.map((c) => replaceNode(c, by)) });

/**
 * A tree and its data model after an update (`TreeUpdate`), or every problem and no change: never a tree partly
 * updated. A node's id must name exactly one node of the tree: an id the tree lacks is a problem, never ignored, and so
 * is one a template's instances share (replace the node that holds them). The result passes `validateTree`, so an
 * update can't relabel a button or loosen its consent any more than a whole tree can. Problem paths point into the
 * update, or into the tree when the tree given is itself invalid. It changes neither input, and the result shares no
 * object with them.
 */
export function applyTreeUpdate(cat: Catalog, tree: ComposedNode, data: Json | undefined, update: unknown): { tree: ComposedNode; data: Json | undefined } | { problems: TreeProblem[] } {
  const shape = treeUpdateProblems(cat, update);
  if (shape.length) return { problems: shape };
  const given = validateTree(cat, tree);
  if (given.length) return { problems: given };
  const u = update as TreeUpdate;
  const problems: TreeProblem[] = [];
  let next = structuredClone(tree);
  (u.nodes ?? []).forEach((n, i) => {
    const found = countId(next, n.id);
    if (found === 0) problems.push({ path: `/nodes/${i}/id`, message: `${JSON.stringify(n.id)} is not in the tree; replace a node it has, or the node that should hold this one.` });
    else if (found > 1) problems.push({ path: `/nodes/${i}/id`, message: `${JSON.stringify(n.id)} names ${found} nodes, a template's instances; replace the node that holds them, by its own id.` });
    else next = replaceNode(next, structuredClone(n));
  });
  let model: Json | undefined = data === undefined ? undefined : structuredClone(data);
  (u.data ?? []).forEach((d, i) => {
    const base: Json = model ?? {};
    const index = listIndexProblem(base, d.path);
    if (index) return void problems.push({ path: `/data/${i}/path`, message: index });
    const written = setPointer(base, d.path, structuredClone(d.value));
    if (!isObj(written)) return void problems.push({ path: `/data/${i}/value`, message: "The data model is an object; set / only to an object." });
    model = written;
  });
  if (problems.length) return { problems };
  const invalid = validateTree(cat, next);
  return invalid.length ? { problems: invalid } : { tree: next, data: model };
}

export const MCP_APP_MIME = "text/html;profile=mcp-app";

// MCP_APP_MIME above is MCP Apps' content type for an HTML view (SEP-1865). (No comment goes before the first
// statement: shadcn's CLI drops it when web's registry installs this file.)
//
// The MCP Apps adapter for Ouro's composed UI (src/composed.mts): the `ui://` resource a server lists for its HX view,
// the tool `_meta` that links a tool to it, and a tool result that carries Ouro's composed tree or an update to it.
// MCP Apps is the transport, not the format: a result may carry the tree itself (`structuredContent.ouro`, here), an
// update to the tree the view already draws (`structuredContent.ouro.update`, here) or an A2UI stream
// (`structuredContent.a2ui`, a2ui.mts's `mcpAppToolResult`), and web's view draws each. Decisions:
// docs/decisions/2026-11-14-composed-ui-own-tree.md, docs/decisions/2026-11-18-composed-tree-updates.md.
//
// It imports only composed.mts. Apps vendor it from a release as `ouro-mcp-app.mts`, beside `ouro-composed.mts`.

/** The `ui://` resource a server lists and serves for its HX view (the HTML web's `mcp-app` kit builds). */
export function mcpAppResource(args: { uri: string; name: string; description?: string; html: string }) {
  if (!args.uri.startsWith("ui://")) throw new Error(`MCP Apps resources use ui://, got ${args.uri}. Fix: such as ui://spoonjoy/hx.`);
  return {
    listing: { uri: args.uri, name: args.name, ...(args.description ? { description: args.description } : {}), mimeType: MCP_APP_MIME },
    contents: { uri: args.uri, mimeType: MCP_APP_MIME, text: args.html },
  };
}

/** The `_meta` that links a tool to the view, so hosts render its results with HX. */
export const mcpAppToolMeta = (uri: string) => ({ ui: { resourceUri: uri } });

/**
 * A tool result carrying Ouro's composed tree: `content` is the text an agent and a text-only host read, and
 * `structuredContent.ouro` the tree the view draws, with `data`, the data model its fields start from, when it has one. Throws, with the problems, when the tree doesn't validate against the
 * catalog; the view validates it again against the catalog it was built with.
 */
export function mcpAppTreeResult(args: { text: string; catalog: Catalog; tree: ComposedNode; data?: Obj }) {
  const problems = validateTree(args.catalog, args.tree);
  if (problems.length) throw new Error(`the composed tree doesn't validate: ${problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
  return {
    content: [{ type: "text" as const, text: args.text }],
    structuredContent: { ouro: { version: COMPOSED_VERSION, catalogId: args.catalog.catalogId, tree: args.tree as unknown as Json, ...(args.data ? { data: args.data } : {}) } },
  };
}

/**
 * A tool result carrying an update to the tree the view already draws (`TreeUpdate`), in `structuredContent.ouro.update`:
 * the nodes it replaces by id and the data it sets by JSON pointer, so the agent resends only what changed. Throws, with
 * the problems, when the update's shape, a node or a data path doesn't validate; the view applies it with
 * `applyTreeUpdate`, which also checks each id against the tree it draws and validates the tree it gives.
 */
export function mcpAppTreeUpdateResult(args: { text: string; catalog: Catalog; update: TreeUpdate }) {
  const problems = treeUpdateProblems(args.catalog, args.update);
  if (problems.length) throw new Error(`the tree update doesn't validate: ${problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
  return {
    content: [{ type: "text" as const, text: args.text }],
    structuredContent: { ouro: { version: COMPOSED_VERSION, catalogId: args.catalog.catalogId, update: args.update as unknown as Json } },
  };
}

export const A2UI_VERSION = "1.0";

// A2UI_VERSION above is A2UI's protocol version these catalogs target. (No comment goes before the first statement:
// shadcn's CLI drops it when web's registry installs this file.)
//
// The A2UI v1.0 adapter for Ouro's composed UI (src/composed.mts): it reads an A2UI catalog into Ouro's, validates an A2UI
// message stream, resolves it into Ouro's composed tree, and wraps a press in A2UI's action message. Everything that is
// not A2UI's (the components, the consent rules, the tree) is composed.mts's, so dropping A2UI drops this file and
// nothing else. Decisions: docs/decisions/2026-11-14-composed-ui-own-tree.md, 2026-11-13-a2ui-catalog.md. Guide:
// docs/guides/a2ui.md.
//
// It imports only composed.mts and mcp-app.mts, so it runs in a browser, a server or a test beside them. Apps vendor it
// from a release as `ouro-a2ui.mts`, beside `ouro-composed.mts` and `ouro-mcp-app.mts`; `a2ui-catalog.mts` writes the
// catalogs.

/** Ouro HX's catalog id; an app's catalog, with its actions, takes its own. */
export const HX_CATALOG_ID = "https://ui.ouroboros.bot/a2ui/v1/catalog.json";
/** The catalog-scope extension key that carries what each action's button does. */
export const EXTENSION = "bot_ouroboros_hx";
/** The action-egress extension key on every A2UI `action` a composed button sends. */
export const ACTION_EXTENSION = "bot_ouroboros_action";

// ---------------------------------------------------------------------------------------------------------------
// Reading a catalog back (renderers and the validator take the JSON, not the action set)
// ---------------------------------------------------------------------------------------------------------------

/** An A2UI catalog read back: Ouro's own catalog (composed.mts). */
export type LoadedCatalog = Catalog;

/** Reads a catalog this file wrote. Its component specs are HX's, so a hand-edited catalog can't widen them. */
export function loadCatalog(cat: unknown): LoadedCatalog {
  const c = cat as { catalogId?: unknown; components?: Record<string, unknown>; metadata?: { extensions?: Record<string, { actions?: Record<string, CatalogAction> }> } };
  if (!c || typeof c.catalogId !== "string" || !c.components) throw new Error("not an A2UI catalog: it has no catalogId or components. Fix: pass a catalog ouro-a2ui wrote.");
  const actions = c.metadata?.extensions?.[EXTENSION]?.actions ?? {};
  const components: Record<string, ComponentSpec> = {};
  for (const name of Object.keys(c.components)) {
    const spec = name === "ActionButton" ? ACTION_BUTTON : own(COMPONENTS, name);
    if (!spec) throw new Error(`catalog ${c.catalogId}: component ${name} is not Ouro HX's. Fix: regenerate it with ouro-a2ui catalog.`);
    components[name] = spec;
  }
  return { catalogId: c.catalogId, components, actions };
}

// ---------------------------------------------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------------------------------------------

/** A problem in A2UI's standard validation error format, plus the typed refusal when one applies. */
export interface Problem {
  code: "VALIDATION_FAILED" | "INVALID_FUNCTION_CALL" | "INTEGRITY_ERROR";
  surfaceId?: string;
  functionCallId?: string;
  /** A JSON pointer into the message stream, such as /2/updateComponents/components/0/text. */
  path: string;
  message: string;
  refusal?: Refusal;
}

const IDENT = /^[\p{XID_Start}_][\p{XID_Continue}]*$/u;
const isCall = (v: unknown) => isObj(v) && "@call" in v;
const MESSAGE_KEYS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface", "callRendererFunction", "agentFunctionResponse"];

/** Why an agent can't press a button through the screen: the message for a `callRendererFunction`. */
export const functionCallProblem = (cat: LoadedCatalog, name: unknown): { message: string; refusal?: Refusal } => agentPressProblem(cat, name);

interface Walk {
  cat: LoadedCatalog;
  problems: Problem[];
  surfaceId: string;
}

function checkDynamic(w: Walk, v: unknown, kind: "string" | "strings" | "boolean" | "value", path: string): void {
  if (isCall(v)) {
    w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path, message: "This catalog has no functions; bind to the data model with {\"@path\"} or give the value." });
    return;
  }
  if (isBinding(v)) return;
  const ok =
    kind === "string" ? typeof v === "string"
    : kind === "boolean" ? typeof v === "boolean"
    : kind === "strings" ? Array.isArray(v) && v.every((s) => typeof s === "string")
    : v !== undefined && !(isObj(v) && Object.keys(v).some((k) => k.startsWith("@")));
  if (!ok) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path, message: `Expected ${kind === "strings" ? "a list of strings" : kind === "value" ? "a value" : `a ${kind}`} or {"@path"}, got ${JSON.stringify(v)}.` });
}

function checkInput(w: Walk, action: CatalogAction, id: string, input: unknown, path: string): void {
  if (action.personOnly) {
    if (input !== undefined && !(isObj(input) && Object.keys(input).length === 0)) {
      w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path, message: action.personOnly.refusal.summary, refusal: action.personOnly.refusal });
    }
    return;
  }
  if (input !== undefined && !isObj(input)) {
    w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path, message: "input is an object of field values." });
    return;
  }
  const given = (input ?? {}) as Record<string, unknown>;
  for (const [name, v] of Object.entries(given)) {
    const f = own(action.input, name);
    const at = `${path}/${name}`;
    if (!f) {
      w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: `${id} has no input ${name}; its fields are ${Object.keys(action.input).join(", ") || "none"}.` });
      continue;
    }
    if (isCall(v)) checkDynamic(w, v, "value", at);
    if (isBinding(v) || isCall(v)) continue;
    const ok = f.kind === "string" ? typeof v === "string" : f.kind === "boolean" ? typeof v === "boolean" : f.kind === "enum" ? typeof v === "string" && (f.values ?? []).includes(v) : typeof v === "number" && (f.kind === "number" || Number.isInteger(v));
    if (!ok) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: `${f.label} is ${f.kind === "enum" ? `one of ${(f.values ?? []).join(", ")}` : f.kind === "integer" ? "an integer" : `a ${f.kind}`}, got ${JSON.stringify(v)}.` });
  }
  for (const [name, f] of Object.entries(action.input)) {
    if (!f.optional && !(name in given)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path, message: `${id} needs ${name} (${f.label}) prepared before the person can press it.` });
  }
}

/** Every pointer a component names (a binding or a template's path) that would reach an object's prototype. */
function unsafePointers(w: Walk, v: unknown, path: string): void {
  if (Array.isArray(v)) return v.forEach((x, i) => unsafePointers(w, x, `${path}/${i}`));
  if (!isObj(v)) return;
  const pointer = isBinding(v) ? v["@path"] : typeof v.componentId === "string" && typeof v.path === "string" ? v.path : undefined;
  if (pointer !== undefined && !isSafePointer(pointer)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path, message: `${JSON.stringify(pointer)} points into the data model, never through __proto__, constructor or prototype.` });
  for (const [k, x] of Object.entries(v)) unsafePointers(w, x, `${path}/${k}`);
}

function checkComponent(w: Walk, comp: unknown, path: string, refs: Map<string, string>, ids: Set<string>): void {
  unsafePointers(w, comp, path);
  if (!isObj(comp)) {
    w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path, message: "A component is an object with id and component." });
    return;
  }
  const { id, component } = comp;
  if (typeof id !== "string" || !IDENT.test(id)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: `${path}/id`, message: `id ${JSON.stringify(id)} is not an identifier: letters, digits and _, not starting with a digit (user_card, not user-card).` });
  else ids.add(id);
  const spec = typeof component === "string" ? own(w.cat.components, component) : undefined;
  if (!spec) {
    w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: `${path}/component`, message: `${JSON.stringify(component)} is not in this catalog; use one of ${Object.keys(w.cat.components).join(", ")}.` });
    return;
  }
  if ("@catalogId" in comp && comp["@catalogId"] !== w.cat.catalogId) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: `${path}/@catalogId`, message: `This renderer has only the catalog ${w.cat.catalogId}.` });
  for (const key of Object.keys(comp)) {
    if (key === "id" || key === "component" || key === "@catalogId" || key === "@metadata" || key === "@accessibility") continue;
    if (!Object.hasOwn(spec.props, key)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: `${path}/${key}`, message: `${component} has no ${key}${Object.keys(spec.props).length ? `; its props are ${Object.keys(spec.props).join(", ")}` : ""}.` });
  }
  if (isObj(comp["@accessibility"])) {
    for (const [k, v] of Object.entries(comp["@accessibility"])) {
      if (k === "label" || k === "description") checkDynamic(w, v, "string", `${path}/@accessibility/${k}`);
      else if (k === "hidden") checkDynamic(w, v, "boolean", `${path}/@accessibility/${k}`);
    }
  }
  for (const [key, p] of Object.entries(spec.props)) {
    const v = comp[key];
    const at = `${path}/${key}`;
    if (v === undefined) {
      if (p.required) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: `${component} needs ${key}: ${p.description}` });
      continue;
    }
    const t = p.type;
    switch (t.kind) {
      case "string":
      case "strings":
      case "boolean":
        checkDynamic(w, v, t.kind, at);
        break;
      case "enum":
        if (typeof v !== "string" || !t.values.includes(v)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: `${key} is one of ${t.values.join(", ")}, got ${JSON.stringify(v)}.` });
        break;
      case "level":
        if (v !== 1 && v !== 2 && v !== 3) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: `level is 1, 2 or 3, got ${JSON.stringify(v)}.` });
        break;
      case "children":
        if (Array.isArray(v)) v.forEach((c, i) => (typeof c === "string" ? refs.set(c, `${at}/${i}`) : w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: `${at}/${i}`, message: "A child is a component id." })));
        else if (isObj(v) && typeof v.componentId === "string" && typeof v.path === "string" && Object.keys(v).length === 2) refs.set(v.componentId, `${at}/componentId`);
        else w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: "children is a list of component ids, or a template { componentId, path }." });
        break;
      case "terms":
        if (isBinding(v)) break;
        if (!Array.isArray(v)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: "items is a list of { term, detail }, or {\"@path\"} to one." });
        else
          v.forEach((it, i) => {
            if (!isObj(it) || Object.keys(it).some((k) => k !== "term" && k !== "detail")) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: `${at}/${i}`, message: "Each item is { term, detail }." });
            else
              for (const k of ["term", "detail"]) {
                if (it[k] === undefined) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: `${at}/${i}/${k}`, message: `Each item needs ${k}.` });
                else checkDynamic(w, it[k], "string", `${at}/${i}/${k}`);
              }
          });
        break;
      case "path":
        if (!isBinding(v)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: `${key} is {"@path": "/..."}: where the person's answer goes in the data model.` });
        break;
      case "action":
        if (typeof v !== "string" || !own(w.cat.actions, v)) w.problems.push({ code: "VALIDATION_FAILED", surfaceId: w.surfaceId, path: at, message: `${JSON.stringify(v)} is not one of the app's actions: ${Object.keys(w.cat.actions).join(", ")}.` });
        break;
      case "input":
        break;
    }
  }
  if (component === "ActionButton" && typeof comp.action === "string" && own(w.cat.actions, comp.action)) checkInput(w, own(w.cat.actions, comp.action)!, comp.action, comp.input, `${path}/input`);
}

/**
 * Every problem in a stream of A2UI messages against a catalog: the envelope, each component and its props, every
 * child id resolving, one root per surface, no cycles, and the action rules. An empty list means it renders.
 */
export function validateMessages(catalogJson: unknown, messages: unknown): Problem[] {
  const cat = loadCatalog(catalogJson);
  const problems: Problem[] = [];
  if (!Array.isArray(messages)) return [{ code: "VALIDATION_FAILED", path: "", message: "Send a list of A2UI messages." }];
  const surfaces = new Map<string, Map<string, { comp: Record<string, unknown>; path: string }>>();
  messages.forEach((m, i) => {
    const at = `/${i}`;
    if (!isObj(m) || m.version !== A2UI_VERSION) {
      problems.push({ code: "VALIDATION_FAILED", path: `${at}/version`, message: `Every message has "version": "${A2UI_VERSION}".` });
      return;
    }
    const keys = Object.keys(m).filter((k) => k !== "version");
    const key = keys[0];
    if (keys.length !== 1 || !key || !MESSAGE_KEYS.includes(key)) {
      problems.push({ code: "VALIDATION_FAILED", path: at, message: `A message has exactly one of ${MESSAGE_KEYS.join(", ")}.` });
      return;
    }
    const body = m[key];
    if (!isObj(body)) {
      problems.push({ code: "VALIDATION_FAILED", path: `${at}/${key}`, message: `${key} is an object.` });
      return;
    }
    if (key === "callRendererFunction") {
      const call = isObj(body.callFunction) ? body.callFunction["@call"] : undefined;
      const p = functionCallProblem(cat, call);
      problems.push({ code: "INVALID_FUNCTION_CALL", functionCallId: typeof body.functionCallId === "string" ? body.functionCallId : "", path: `${at}/callRendererFunction/callFunction`, message: p.message, ...(p.refusal ? { refusal: p.refusal } : {}) });
      return;
    }
    if (key === "agentFunctionResponse") {
      problems.push({ code: "INVALID_FUNCTION_CALL", path: `${at}/agentFunctionResponse`, message: "This catalog's renderers call no agent functions, so there is nothing to answer." });
      return;
    }
    const surfaceId = body.surfaceId;
    if (typeof surfaceId !== "string" || surfaceId === "") {
      problems.push({ code: "VALIDATION_FAILED", path: `${at}/${key}/surfaceId`, message: "surfaceId is a non-empty string." });
      return;
    }
    const w: Walk = { cat, problems, surfaceId };
    if (key === "createSurface") {
      if (surfaces.has(surfaceId)) problems.push({ code: "INTEGRITY_ERROR", surfaceId, path: `${at}/createSurface/surfaceId`, message: `Surface ${surfaceId} already exists; delete it first or use another id.` });
      if (body.catalogId !== cat.catalogId) problems.push({ code: "VALIDATION_FAILED", surfaceId, path: `${at}/createSurface/catalogId`, message: `catalogId is ${cat.catalogId}.` });
      if ("theme" in body) problems.push({ code: "VALIDATION_FAILED", surfaceId, path: `${at}/createSurface/theme`, message: "A2UI v1.0 has no theme; the app's HX theme styles the surface." });
      if ("dataModel" in body && !isObj(body.dataModel)) problems.push({ code: "VALIDATION_FAILED", surfaceId, path: `${at}/createSurface/dataModel`, message: "dataModel is an object." });
      surfaces.set(surfaceId, new Map());
    } else if (!surfaces.has(surfaceId)) {
      problems.push({ code: "VALIDATION_FAILED", surfaceId, path: `${at}/${key}/surfaceId`, message: `Create surface ${surfaceId} before ${key}.` });
      return;
    }
    if (key === "deleteSurface") {
      surfaces.delete(surfaceId);
      return;
    }
    if (key === "updateDataModel") {
      if (body.path !== undefined && (typeof body.path !== "string" || (body.path !== "" && !isDataPointer(body.path)))) problems.push({ code: "VALIDATION_FAILED", surfaceId, path: `${at}/updateDataModel/path`, message: "path is a JSON pointer starting with /." });
      if (!("value" in body)) problems.push({ code: "VALIDATION_FAILED", surfaceId, path: `${at}/updateDataModel/value`, message: "updateDataModel needs value (null deletes)." });
      return;
    }
    const list = body.components;
    if (list === undefined && key === "createSurface") return;
    if (!Array.isArray(list)) {
      problems.push({ code: "VALIDATION_FAILED", surfaceId, path: `${at}/${key}/components`, message: "components is a list." });
      return;
    }
    const byId = surfaces.get(surfaceId)!;
    list.forEach((c, j) => {
      const cpath = `${at}/${key}/components/${j}`;
      const ids = new Set<string>();
      checkComponent(w, c, cpath, new Map(), ids);
      if (isObj(c) && typeof c.id === "string") byId.set(c.id, { comp: c, path: cpath });
    });
  });
  // The tree each surface ends with: every child resolves, one root, no cycles.
  for (const [surfaceId, byId] of surfaces) {
    if (byId.size === 0) continue;
    if (!byId.has("root")) problems.push({ code: "VALIDATION_FAILED", surfaceId, path: "", message: "One component must have id root; it is what the surface shows." });
    for (const { comp, path } of byId.values()) {
      for (const [child, at] of childRefs(comp, path)) {
        if (!byId.has(child)) problems.push({ code: "VALIDATION_FAILED", surfaceId, path: at, message: `No component has id ${child}.` });
        if (child === "root") problems.push({ code: "VALIDATION_FAILED", surfaceId, path: at, message: "root can't be a child." });
      }
    }
    const seen = new Set<string>();
    const visit = (id: string, stack: string[]): void => {
      if (stack.includes(id)) {
        problems.push({ code: "VALIDATION_FAILED", surfaceId, path: byId.get(id)!.path, message: `The tree loops: ${[...stack, id].join(" > ")}.` });
        return;
      }
      if (seen.has(id) || !byId.has(id)) return;
      for (const [child] of childRefs(byId.get(id)!.comp, "")) visit(child, [...stack, id]);
      seen.add(id);
    };
    if (byId.has("root")) visit("root", []);
  }
  return problems;
}

function childRefs(comp: Record<string, unknown>, path: string): [string, string][] {
  const out: [string, string][] = [];
  const v = comp.children;
  if (Array.isArray(v)) v.forEach((c, i) => typeof c === "string" && out.push([c, `${path}/children/${i}`]));
  else if (isObj(v) && typeof v.componentId === "string") out.push([v.componentId, `${path}/children/componentId`]);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The reference resolver: what every renderer must show
// ---------------------------------------------------------------------------------------------------------------

/** A resolved node is a node of Ouro's composed tree (composed.mts); A2UI's sourceComponentId is its id. */
export type Resolved = ComposedNode;

interface Surface {
  catalogId: string;
  components: Map<string, Record<string, unknown>>;
  data: Json;
}

/** Applies a stream to surfaces. Throws on a stream the validator would reject; validate first. */
export function applyMessages(messages: readonly unknown[], surfaces = new Map<string, Surface>()): Map<string, Surface> {
  for (const m of messages as Record<string, Record<string, unknown>>[]) {
    if (m.createSurface) {
      const b = m.createSurface;
      const s: Surface = { catalogId: String(b.catalogId), components: new Map(), data: (b.dataModel as Json) ?? {} };
      for (const c of (b.components as Record<string, unknown>[]) ?? []) s.components.set(String(c.id), c);
      surfaces.set(String(b.surfaceId), s);
    } else if (m.updateComponents) {
      const s = surfaces.get(String(m.updateComponents.surfaceId))!;
      for (const c of m.updateComponents.components as Record<string, unknown>[]) s.components.set(String(c.id), c);
    } else if (m.updateDataModel) {
      const s = surfaces.get(String(m.updateDataModel.surfaceId))!;
      s.data = setPointer(s.data, String(m.updateDataModel.path ?? "/"), m.updateDataModel.value as Json);
    } else if (m.deleteSurface) surfaces.delete(String(m.deleteSurface.surfaceId));
  }
  return surfaces;
}

/** Resolves a pointer in a scope: absolute from the root, relative from the template item's path. */
const scoped = (scope: string, p: string) => (p.startsWith("/") ? p : p === "" ? scope : `${scope}/${p}`);

function resolveValue(data: Json, scope: string, v: unknown): Json | undefined {
  if (isBinding(v)) return getPointer(data, scoped(scope, v["@path"]));
  return v as Json;
}

/** One surface as every renderer must show it. */
export function resolveSurface(catalogJson: unknown, surface: Surface, options: ResolveOptions = {}): Resolved | null {
  const cat = loadCatalog(catalogJson);
  const root = surface.components.get("root");
  if (!root) return null;
  const node = (comp: Record<string, unknown>, scope: string): Resolved => {
    const name = String(comp.component);
    const spec = cat.components[name]!;
    const props: Obj = {};
    const children: Resolved[] = [];
    for (const [key, p] of Object.entries(spec.props)) {
      const raw = comp[key];
      const t = p.type;
      switch (t.kind) {
        case "string":
          if (raw !== undefined || p.required) props[key] = asText(resolveValue(surface.data, scope, raw));
          break;
        case "strings": {
          const v = resolveValue(surface.data, scope, raw);
          props[key] = Array.isArray(v) ? v.map((x) => asText(x)) : [];
          break;
        }
        case "boolean": {
          const v = raw === undefined ? t.default : resolveValue(surface.data, scope, raw);
          props[key] = v === true;
          break;
        }
        case "enum":
          props[key] = typeof raw === "string" ? raw : t.default;
          break;
        case "level":
          props[key] = typeof raw === "number" ? raw : t.default;
          break;
        case "terms": {
          const v = resolveValue(surface.data, scope, raw);
          const base = isBinding(raw) ? scoped(scope, raw["@path"]) : scope;
          props[key] = Array.isArray(v)
            ? v.map((it, i) => ({
                term: asText(resolveValue(surface.data, isBinding(raw) ? `${base}/${i}` : scope, isObj(it) ? it.term : undefined)),
                detail: asText(resolveValue(surface.data, isBinding(raw) ? `${base}/${i}` : scope, isObj(it) ? it.detail : undefined)),
              }))
            : [];
          break;
        }
        case "children": {
          if (Array.isArray(raw)) {
            for (const id of raw) {
              const c = surface.components.get(String(id));
              if (c) children.push(node(c, scope));
            }
          } else if (isObj(raw)) {
            const base = scoped(scope, String(raw.path));
            const list = getPointer(surface.data, base);
            const tpl = surface.components.get(String(raw.componentId));
            if (Array.isArray(list) && tpl) list.forEach((_, i) => children.push(node(tpl, `${base}/${i}`)));
          }
          break;
        }
        case "path":
          props[key] = isBinding(raw) ? absolute(scoped(scope, raw["@path"])) : "";
          break;
        case "action":
        case "input":
          break;
      }
    }
    if (name === "ActionButton") {
      // Bindings stay bindings here; once the tree is whole, live() reads those no field writes and adds the catalog's props.
      const id = String(comp.action);
      const input: Obj = {};
      if (!cat.actions[id]!.personOnly && isObj(comp.input)) for (const [k, v] of Object.entries(comp.input)) input[k] = isBinding(v) ? { "@path": absolute(scoped(scope, v["@path"])) } : ((v as Json) ?? null);
      Object.assign(props, { action: id, input });
    }
    if (isObj(comp["@accessibility"]) && comp["@accessibility"].label !== undefined) props["@label"] = asText(resolveValue(surface.data, scope, comp["@accessibility"].label));
    return { id: String(comp.id), component: name, props, children };
  };
  return live(cat, node(root, ""), surface.data, options);
}

/** A pointer that starts at the data model's root. */
const absolute = (p: string) => (p.startsWith("/") ? p : `/${p}`);

/**
 * The tree with each button input bound to a path no field writes read from the data now, as before fields existed;
 * one bound to a field the person fills in stays bound, so a press sends their answer (composed.mts resolveButton).
 */
function live(cat: Catalog, tree: Resolved, data: Json, options: ResolveOptions): Resolved {
  const written = new Set<string>();
  const collect = (n: Resolved): void => {
    if (INPUT_COMPONENTS.includes(n.component) && typeof n.props.value === "string") written.add(n.props.value);
    n.children.forEach(collect);
  };
  collect(tree);
  const fix = (n: Resolved): Resolved => {
    const children = n.children.map(fix);
    if (n.component !== "ActionButton" || !isObj(n.props.input)) return { ...n, children };
    const { action, input: prepared, "@label": label, ...rest } = n.props;
    // A value read from the data is a value: one shaped like a binding is sent as its text, never followed.
    const read = (p: string): Json => {
      const v = getPointer(data, p) ?? null;
      return isBinding(v) ? asText(v) : v;
    };
    const input: Obj = Object.fromEntries(Object.entries(prepared as Obj).map(([k, v]) => [k, isBinding(v) && !written.has(v["@path"]) ? read(v["@path"]) : v]));
    // The catalog's props, computed once per button, so the app's label resolver is asked once per field.
    const props: Obj = { ...rest, ...actionButtonProps(cat, String(action), input, options), ...(label !== undefined ? { "@label": label } : {}) };
    return { ...n, props, children };
  };
  return fix(tree);
}

/** Every surface a stream leaves, resolved; the validator's problems instead when it has any. */
export function resolveMessages(catalogJson: unknown, messages: readonly unknown[], options: ResolveOptions = {}): { surfaces: Record<string, Resolved | null> } | { problems: Problem[] } {
  const problems = validateMessages(catalogJson, messages);
  if (problems.length) return { problems };
  const surfaces: Record<string, Resolved | null> = {};
  for (const [id, s] of applyMessages(messages)) surfaces[id] = resolveSurface(catalogJson, s, options);
  return { surfaces };
}

/**
 * The A2UI `action` message a composed button sends when the person presses it (after confirming, for a
 * consequential one). A person-only button never sends one: it hands the person to the app's own screen.
 */
export function actionMessage(args: { surfaceId: string; sourceComponentId: string; button: Resolved; timestamp: string; confirmed?: boolean }): Obj {
  const press = personPress(args.button, args.confirmed);
  return {
    version: A2UI_VERSION,
    action: {
      name: press.action,
      surfaceId: args.surfaceId,
      sourceComponentId: args.sourceComponentId,
      timestamp: args.timestamp,
      userMessage: press.label,
      context: press.input,
      metadata: { extensions: { [ACTION_EXTENSION]: { consent: press.consent, by: press.by, ...(press.confirmed ? { confirmed: true } : {}) } } },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// MCP Apps: a tool result that carries an A2UI stream (src/mcp-app.mts carries Ouro's tree itself)
// ---------------------------------------------------------------------------------------------------------------

/**
 * A tool result carrying A2UI messages: `content` is the text an agent and a text-only host read, and
 * `structuredContent.a2ui` the surface the view renders. Throws, with the problems, when the messages don't validate.
 */
export function mcpAppToolResult(args: { text: string; catalog: unknown; messages: readonly unknown[] }) {
  const problems = validateMessages(args.catalog, args.messages);
  if (problems.length) throw new Error(`the A2UI messages don't validate: ${problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
  return {
    content: [{ type: "text" as const, text: args.text }],
    structuredContent: { a2ui: { version: A2UI_VERSION, catalogId: loadCatalog(args.catalog).catalogId, messages: args.messages as Json[] } },
  };
}
