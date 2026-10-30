/**
 * One definition of a command: its words, effect, arguments and flags, examples and output. From it come the parser
 * (whose refusals name the exact fix), the usage and help, `help --json` and the MCP tool's input schema, so the CLI
 * and the MCP server can never disagree.
 */
import { AxError, commandLine, didYouMean } from "./errors.ts";
import { BASE_EXIT_CODES, defineExitCodes, type ExitTable } from "./exit-codes.ts";
import { DEFAULT_HEADINGS, WHY_FLAG, WHY_PLACEHOLDER, type Effect, type EffectHeadings } from "./effects.ts";

export type FlagType = "boolean" | "string" | "number" | "enum" | "list";

export interface FlagSpec {
  type: FlagType;
  description: string;
  required?: boolean;
  /** How the value is shown in usage and fixes, such as "<N>"; defaults to `<name>`. */
  placeholder?: string;
  /** The choices of an "enum" flag. */
  values?: readonly string[];
  min?: number;
  max?: number;
  /** Whether "-" reads the value from stdin. */
  stdin?: boolean;
}

export interface ArgSpec {
  name: string;
  description: string;
  required?: boolean;
  /** Takes every remaining word, joined by spaces (free text). */
  rest?: boolean;
  /** Whether "-" reads it from stdin. */
  stdin?: boolean;
  /** Not required when this flag is given (`send <conversation> --draft` needs no text). */
  unless?: string;
  /** The command that lists valid values, as the fix names it ("conversations"). */
  source?: string;
  /** The problem a missing value reports; defaults to "needs <name>". */
  missing?: string;
}

/** What an ambiguous word could mean, and the command for each meaning. */
export interface Meaning {
  means: string;
  use: string;
}

export type InputValue = string | number | boolean | readonly string[];
export type Input = Readonly<Record<string, InputValue>>;

export interface RunContext {
  /** Reads stdin once; a second read throws. */
  stdin(): Promise<string>;
  json: boolean;
}

export interface CommandDef<R = unknown> {
  /** One or more words: "today", "draft set". */
  name: string;
  aliases?: readonly string[];
  summary: string;
  effect: Effect;
  /** A read never changes anything, for anyone. */
  readOnly?: boolean;
  /** Whether --why is asked for: required on every "others" command by default. */
  why?: "required" | "optional" | "none";
  args?: readonly ArgSpec[];
  flags?: Readonly<Record<string, FlagSpec>>;
  examples?: readonly string[];
  /** The `--json` shape, as one line. */
  output?: string;
  /** Out of the overview, still callable and with its help. */
  hidden?: boolean;
  /** Flags and extra words pass through unchecked: a command adopted before its flags were declared. */
  loose?: boolean;
  run?(input: Input, ctx: RunContext): R | Promise<R>;
  text?(result: R, input: Input): string;
}

export interface CliDef {
  name: string;
  /** The overview's first lines: what the tool is and when to use it. */
  about: readonly string[];
  commands: readonly CommandDef[];
  exits?: ExitTable;
  headings?: EffectHeadings;
  /** Flags every command takes, besides --json and --help. */
  globalFlags?: Readonly<Record<string, FlagSpec>>;
  /** Words that could mean two effects answer with both commands instead of acting. */
  ambiguous?: Readonly<Record<string, readonly Meaning[]>>;
  /** The overview's one line for a multi-word group ("draft"), when its first command's summary is not it. */
  groups?: Readonly<Record<string, string>>;
}

export interface Cli {
  readonly name: string;
  readonly about: readonly string[];
  readonly commands: readonly CommandDef[];
  readonly exits: ExitTable;
  readonly headings: EffectHeadings;
  readonly globalFlags: Readonly<Record<string, FlagSpec>>;
  readonly ambiguous: Readonly<Record<string, readonly Meaning[]>>;
  readonly groups: Readonly<Record<string, string>>;
}

export const BUILTIN_FLAGS: Readonly<Record<string, FlagSpec>> = Object.freeze({
  json: { type: "boolean", description: "Print one JSON document on stdout instead of text." },
  help: { type: "boolean", description: "This command's help." },
});

export function defineCommand<R>(def: CommandDef<R>): CommandDef<R> {
  return def;
}

const wordsOf = (name: string) => name.split(" ");

/** Every flag a command takes: the built-ins, the tool's, --why where asked for, then its own. */
export function flagsOf(cli: Pick<Cli, "globalFlags">, cmd: CommandDef): Record<string, FlagSpec> {
  const why = cmd.why ?? (cmd.effect === "others" ? "required" : "none");
  const whyFlag: Record<string, FlagSpec> =
    why === "none" ? {} : { [WHY_FLAG]: { type: "string", required: why === "required", placeholder: `"${WHY_PLACEHOLDER}"`, stdin: true, description: "Who asked you, and what they said; it is logged with the action." } };
  return { ...BUILTIN_FLAGS, ...cli.globalFlags, ...whyFlag, ...cmd.flags };
}

/** Builds the tool and checks its definitions: unique names, a valid exit table, examples that parse. */
export function defineCli(def: CliDef): Cli {
  const cli: Cli = {
    name: def.name,
    about: def.about,
    commands: def.commands,
    exits: def.exits ?? defineExitCodes(BASE_EXIT_CODES),
    headings: def.headings ?? DEFAULT_HEADINGS,
    globalFlags: def.globalFlags ?? {},
    ambiguous: def.ambiguous ?? {},
    groups: def.groups ?? {},
  };
  const seen = new Set<string>();
  for (const cmd of cli.commands) {
    for (const n of [cmd.name, ...(cmd.aliases ?? [])]) {
      if (seen.has(n)) throw new Error(`${def.name}: two commands are named "${n}". Fix: rename one.`);
      seen.add(n);
    }
    const args = cmd.args ?? [];
    args.forEach((a, i) => {
      if (a.rest && i !== args.length - 1) throw new Error(`${def.name} ${cmd.name}: <${a.name}> takes the rest of the words, so it must be the last argument. Fix: move it last.`);
    });
  }
  for (const word of Object.keys(cli.ambiguous)) if (seen.has(word)) throw new Error(`${def.name}: "${word}" is both a command and an ambiguous word. Fix: remove one.`);
  for (const cmd of cli.commands) {
    for (const example of cmd.examples ?? []) {
      const argv = exampleArgv(cli.name, example);
      if (!argv) continue;
      try {
        parse(cli, argv);
      } catch (e) {
        throw new Error(`${def.name} ${cmd.name}: the example "${example}" does not parse: ${(e as Error).message}`);
      }
    }
  }
  return cli;
}

/** An example's words after the tool's name, up to a pipe; null when the tool is not in it. */
export function exampleArgv(tool: string, example: string): string[] | null {
  const words: string[] = [];
  const pattern = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  for (const m of example.matchAll(pattern)) words.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : (m[2] ?? m[3]!));
  const at = words.indexOf(tool);
  if (at === -1) return null;
  const after = words.slice(at + 1);
  const pipe = after.indexOf("|");
  return pipe === -1 ? after : after.slice(0, pipe);
}

/** `<name>`, `[<name>]` or `<name...>`, as usage shows an argument. */
export function argUsage(a: ArgSpec): string {
  const shown = `<${a.name}${a.rest ? "..." : ""}>${a.stdin ? "|-" : ""}`;
  return a.required && !a.unless ? shown : `[${shown}]`;
}

function placeholderOf(name: string, spec: FlagSpec): string {
  if (spec.placeholder) return spec.placeholder;
  if (spec.type === "enum" && spec.values) return spec.values.join("|");
  if (spec.type === "number") return "<N>";
  if (spec.type === "list") return `<${name},${name}>`;
  return `<${name}>`;
}

/** `--name <value>`, or `--name` for a boolean. */
export function flagUsage(name: string, spec: FlagSpec): string {
  return spec.type === "boolean" ? `--${name}` : `--${name} ${placeholderOf(name, spec)}`;
}

/** The command's usage line from its definition: words, arguments, required flags, then the optional ones. */
export function usageOf(cli: Pick<Cli, "globalFlags">, cmd: CommandDef): string {
  const flags = Object.entries(flagsOf(cli, cmd)).filter(([name]) => !(name in BUILTIN_FLAGS) && !(name in cli.globalFlags));
  const required = flags.filter(([, s]) => s.required).map(([n, s]) => flagUsage(n, s));
  const optional = flags.filter(([, s]) => !s.required).map(([n, s]) => `[${flagUsage(n, s)}]`);
  return [cmd.name, ...(cmd.args ?? []).map(argUsage), ...required, ...optional].join(" ");
}

export interface Parsed {
  kind: "run";
  command: CommandDef;
  input: Input;
  json: boolean;
  /** Flags a loose command passed through unchecked. */
  unchecked: Readonly<Record<string, string | true>>;
}
export interface HelpAsked {
  kind: "help";
  /** The command or topic asked about; undefined for the overview. */
  topic: string | undefined;
  json: boolean;
}

/** The command the leading words name (the longest match), and how many words it took. */
export function findCommand(cli: Pick<Cli, "commands">, words: readonly string[]): { command: CommandDef; used: number } | null {
  let best: { command: CommandDef; used: number } | null = null;
  for (const command of cli.commands) {
    for (const name of [command.name, ...(command.aliases ?? [])]) {
      const w = wordsOf(name);
      if (w.length <= words.length && w.every((x, i) => words[i] === x) && (!best || w.length > best.used)) best = { command, used: w.length };
    }
  }
  return best;
}

const usage = (cli: Cli) => cli.exits.code("usage");

/**
 * Parses argv against the definitions. Throws an AxError (exit "usage") whose fix is the corrected command line: an
 * unknown flag names the nearest one, a missing argument shows where it goes and where to get it, a missing --why is
 * appended, an ambiguous word lists each meaning's command.
 */
export function parse(cli: Cli, argv: readonly string[]): Parsed | HelpAsked {
  const tokens = [...argv];
  const json = tokens.includes("--json");
  const helpFlag = tokens.includes("--help") || tokens.includes("-h");
  const leading: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("-")) break;
    leading.push(t);
  }
  if (leading[0] === "help") return { kind: "help", topic: leading.slice(1).join(" ") || undefined, json };
  if (leading.length === 0) {
    if (helpFlag) return { kind: "help", topic: undefined, json };
    throw new AxError({ code: "no-command", exit: usage(cli), thing: cli.name, problem: "no command given", fix: `${cli.name} --help` });
  }
  const found = findCommand(cli, leading);
  if (!found) throw unknownCommand(cli, leading);
  const { command, used } = found;
  if (helpFlag) return { kind: "help", topic: command.name, json };
  const words = tokens.slice(0, used);
  const rest = tokens.slice(used);
  const flags = flagsOf(cli, command);
  const thing = command.name;
  const input: Record<string, InputValue> = {};
  const unchecked: Record<string, string | true> = {};
  const positional: string[] = [];
  const positionalAt: number[] = [];
  /** The command line with `count` tokens from `start` replaced: the fix an error prints. */
  const at = (start: number, replacement: readonly string[], count: number = 1) => commandLine([cli.name, ...words, ...rest.slice(0, start), ...replacement, ...rest.slice(start + count)]);
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]!;
    if (t === "--") {
      for (let j = i + 1; j < rest.length; j++) {
        positional.push(rest[j]!);
        positionalAt.push(j);
      }
      break;
    }
    if (t === "-h" || !t.startsWith("--")) {
      if (t !== "-h") {
        positional.push(t);
        positionalAt.push(i);
      }
      continue;
    }
    const eq = t.indexOf("=");
    const name = t.slice(2, eq === -1 ? undefined : eq);
    const inline = eq === -1 ? undefined : t.slice(eq + 1);
    const spec = flags[name];
    if (command.loose) {
      const next = rest[i + 1];
      unchecked[name] = inline ?? (spec?.type !== "boolean" && next !== undefined && !next.startsWith("--") ? (i++, next) : true);
      continue;
    }
    if (!spec) {
      const near = didYouMean(name, Object.keys(flags));
      const own = Object.keys(command.flags ?? {}).concat(command.effect === "others" || command.why ? [WHY_FLAG] : []);
      throw new AxError({
        code: "unknown-flag",
        exit: usage(cli),
        thing,
        problem: `there is no --${name}${own.length ? `; its flags are ${own.map((f) => `--${f}`).join(", ")}` : "; it takes no flags of its own"}`,
        fix: near ? at(i, [`--${near}${inline === undefined ? "" : `=${inline}`}`]) : at(i, []),
      });
    }
    if (Object.hasOwn(input, name)) throw new AxError({ code: "duplicate-flag", exit: usage(cli), thing, problem: `--${name} is given twice`, fix: at(i, [], spec.type === "boolean" || inline !== undefined ? 1 : 2) });
    if (spec.type === "boolean") {
      if (inline !== undefined && inline !== "true" && inline !== "false") throw new AxError({ code: "bad-value", exit: usage(cli), thing, problem: `--${name} takes no value`, fix: at(i, [`--${name}`]) });
      input[name] = inline !== "false";
      continue;
    }
    const start = i;
    let raw = inline;
    if (raw === undefined) {
      const next = rest[i + 1];
      if (next === undefined || (next.startsWith("--") && next.length > 2)) throw new AxError({ code: "missing-value", exit: usage(cli), thing, problem: `--${name} needs a value`, fix: at(i, [`--${name}`, placeholderOf(name, spec)]) });
      raw = next;
      i++;
    }
    input[name] = valueOf(cli, thing, name, spec, raw, (replacement) => at(start, [`--${name}`, replacement], i - start + 1));
  }
  const args = command.args ?? [];
  const given = [...positional];
  for (const a of args) {
    if (given.length === 0) break;
    input[a.name] = a.rest ? given.splice(0).join(" ") : given.shift()!;
  }
  if (given.length && !command.loose) {
    const last = args.at(-1);
    throw new AxError({
      code: "extra-arg",
      exit: usage(cli),
      thing,
      problem: `"${given[0]}" is one word too many: it takes ${args.length ? args.map(argUsage).join(" ") : "no words after its name"}${last && !last.rest ? "; quote text with spaces" : ""}`,
      fix: commandLine([cli.name, ...words, ...rest.filter((_, j) => !positionalAt.slice(positional.length - given.length).includes(j))]),
    });
  }
  if (given.length) unchecked["_"] = given.join(" ");
  for (const a of args) {
    if (!a.required || Object.hasOwn(input, a.name) || (a.unless && Object.hasOwn(input, a.unless))) continue;
    const filled = commandLine([cli.name, ...words, ...positional, `<${a.name}>`, ...rest.filter((_, j) => !positionalAt.includes(j))]);
    throw new AxError({
      code: "missing-arg",
      exit: usage(cli),
      thing,
      problem: a.missing ?? `needs <${a.name}>${a.unless ? ` (or --${a.unless})` : ""}`,
      fix: a.source ? `${cli.name} ${a.source}, then ${filled}` : filled,
    });
  }
  for (const [name, spec] of Object.entries(flags)) {
    if (!spec.required || Object.hasOwn(input, name)) continue;
    throw new AxError({
      code: name === WHY_FLAG ? "needs-why" : "missing-flag",
      exit: usage(cli),
      thing,
      problem: name === WHY_FLAG ? whyProblem(command, "--why") : `needs --${name}: ${spec.description.replace(/[.\s]+$/, "")}`,
      fix: commandLine([cli.name, ...words, ...rest, `--${name}`, placeholderOf(name, spec).replace(/^"(.*)"$/, "$1")]),
    });
  }
  return { kind: "run", command, input, json, unchecked };
}

function valueOf(cli: Cli, thing: string, name: string, spec: FlagSpec, raw: string, fixWith: (replacement: string) => string): InputValue {
  if (spec.stdin && raw === "-") return raw;
  if (spec.type === "number") {
    const n = Number(raw);
    const inRange = raw.trim() !== "" && Number.isFinite(n) && (spec.min === undefined || n >= spec.min) && (spec.max === undefined || n <= spec.max);
    if (!inRange) {
      const range = spec.min !== undefined && spec.max !== undefined ? ` from ${spec.min} to ${spec.max}` : spec.min !== undefined ? ` of at least ${spec.min}` : "";
      throw new AxError({ code: "bad-value", exit: usage(cli), thing, problem: `--${name} takes a number${range}, not "${raw}"`, fix: fixWith(String(spec.min ?? 1)) });
    }
    return n;
  }
  if (spec.type === "enum") {
    const values = spec.values ?? [];
    if (!values.includes(raw)) {
      const near = didYouMean(raw, values);
      throw new AxError({ code: "bad-value", exit: usage(cli), thing, problem: `--${name} is one of ${values.join(", ")}, not "${raw}"`, fix: fixWith(near ?? values.join("|")) });
    }
    return raw;
  }
  if (spec.type === "list") return raw.split(/[\s,]+/).filter(Boolean);
  return raw;
}

function unknownCommand(cli: Cli, leading: readonly string[]): AxError {
  const word = leading[0]!;
  const meanings = cli.ambiguous[word];
  if (meanings) {
    return new AxError({
      code: "ambiguous",
      exit: usage(cli),
      thing: word,
      problem: `"${word}" could mean ${meanings.length} things, so it does nothing: ${meanings.map((m) => m.means).join("; or ")}`,
      fix: meanings.map((m) => `${cli.name} ${m.use}`).join(" or "),
    });
  }
  const group = cli.commands.filter((c) => !c.hidden && wordsOf(c.name)[0] === word && wordsOf(c.name).length > 1);
  if (group.length) {
    const sub = leading[1];
    const near = sub ? didYouMean(sub, group.map((c) => wordsOf(c.name)[1]!)) : null;
    return new AxError({
      code: "unknown-command",
      exit: usage(cli),
      thing: word,
      problem: sub ? `there is no "${word} ${sub}"; it is ${group.map((c) => c.name).join(", ")}` : `"${word}" needs one of ${group.map((c) => c.name).join(", ")}`,
      fix: near ? commandLine([cli.name, word, near, ...leading.slice(2)]) : `${cli.name} help ${word}`,
    });
  }
  const names = cli.commands.filter((c) => !c.hidden).flatMap((c) => [wordsOf(c.name)[0]!, ...(c.aliases ?? [])]);
  const near = didYouMean(word, [...new Set(names)]);
  return new AxError({
    code: "unknown-command",
    exit: usage(cli),
    thing: word,
    problem: `there is no command "${word}"`,
    fix: near ? commandLine([cli.name, near, ...leading.slice(1)]) : `${cli.name} --help`,
  });
}

/** A JSON Schema (draft 2020-12) object. */
export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: readonly string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

/** The command's input as a JSON Schema: its arguments and flags as properties (the MCP tool's inputSchema). */
export function inputSchema(cli: Pick<Cli, "globalFlags">, cmd: CommandDef): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const a of cmd.args ?? []) {
    properties[a.name] = { type: "string", description: a.description + (a.unless ? ` Not needed with ${a.unless}.` : "") };
    if (a.required && !a.unless) required.push(a.name);
  }
  for (const [name, spec] of Object.entries(flagsOf(cli, cmd))) {
    if (name in BUILTIN_FLAGS) continue;
    const s: JsonSchema = { description: spec.description };
    if (spec.type === "boolean") s.type = "boolean";
    else if (spec.type === "number") {
      s.type = "number";
      if (spec.min !== undefined) s.minimum = spec.min;
      if (spec.max !== undefined) s.maximum = spec.max;
    } else if (spec.type === "list") s.items = { type: "string" };
    else s.type = "string";
    if (spec.type === "list") s.type = "array";
    if (spec.type === "enum" && spec.values) s.enum = spec.values;
    properties[name] = s;
    if (spec.required) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/** Why --why is needed: other people will see it, or it acts on the person's own things for them. */
const whyProblem = (cmd: CommandDef, flag: string) =>
  cmd.effect === "others" ? `other people will see this as the person's, so it needs ${flag}: ${WHY_PLACEHOLDER.slice(1, -1)}` : `it acts on the person's own things for them, so it needs ${flag}: ${WHY_PLACEHOLDER.slice(1, -1)}`;

const typeName = (value: unknown) => (Array.isArray(value) ? "array" : value === null ? "null" : typeof value);

/**
 * Checks an MCP call's arguments against the command, as the parser checks argv: an unknown property names the nearest,
 * a wrong type or a missing value names it. The fix is the arguments to send instead, as JSON.
 */
export function checkInput(cli: Cli, cmd: CommandDef, raw: unknown, thing: string = cmd.name.replace(/ /g, "_")): Input {
  const schema = inputSchema(cli, cmd);
  const props = schema.properties ?? {};
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fixed: Record<string, unknown> = { ...given };
  const fail = (code: string, problem: string): never => {
    throw new AxError({ code, exit: usage(cli), thing, problem, fix: JSON.stringify(fixed) });
  };
  for (const key of Object.keys(given)) {
    if (props[key]) continue;
    const near = didYouMean(key, Object.keys(props));
    const value = fixed[key];
    delete fixed[key];
    if (near) fixed[near] = value;
    fail("unknown-argument", `there is no argument "${key}"; it takes ${Object.keys(props).join(", ") || "none"}`);
  }
  const input: Record<string, InputValue> = {};
  for (const [key, s] of Object.entries(props)) {
    const value = given[key];
    if (value === undefined || value === null) continue;
    const want = s.type ?? "string";
    if (want === "array" ? !Array.isArray(value) || value.some((v) => typeof v !== "string") : typeName(value) !== want) {
      fixed[key] = want === "array" ? [String(value)] : want === "number" ? Number(value) || 0 : want === "boolean" ? true : String(value);
      fail("bad-value", `"${key}" is ${want === "array" ? "an array of strings" : `a ${want}`}, not ${typeName(value)}`);
    }
    if (s.enum && !s.enum.includes(value as string)) {
      fixed[key] = didYouMean(String(value), s.enum) ?? s.enum[0];
      fail("bad-value", `"${key}" is one of ${s.enum.join(", ")}, not "${String(value)}"`);
    }
    if (typeof value === "number" && ((s.minimum !== undefined && value < s.minimum) || (s.maximum !== undefined && value > s.maximum))) {
      fixed[key] = s.minimum ?? s.maximum;
      fail("bad-value", `"${key}" is out of range (${s.minimum ?? "-"} to ${s.maximum ?? "-"})`);
    }
    input[key] = value as InputValue;
  }
  for (const key of schema.required ?? []) {
    if (Object.hasOwn(input, key)) continue;
    fixed[key] = key === WHY_FLAG ? WHY_PLACEHOLDER : `<${key}>`;
    fail(key === WHY_FLAG ? "needs-why" : "missing-arg", key === WHY_FLAG ? whyProblem(cmd, '"why"') : `needs "${key}": ${props[key]?.description ?? ""}`);
  }
  for (const a of cmd.args ?? []) {
    if (a.required && a.unless && !Object.hasOwn(input, a.name) && !Object.hasOwn(input, a.unless)) {
      fixed[a.name] = `<${a.name}>`;
      fail("missing-arg", `needs "${a.name}" (or "${a.unless}")`);
    }
  }
  return input;
}

/**
 * The argv that runs a command with this input, the way an agent would type it; the first stdin-capable argument's
 * text goes on stdin ("-"), so text that starts with "-" or spans lines passes whole.
 */
export function toArgv(cli: Pick<Cli, "globalFlags">, cmd: CommandDef, input: Input): { argv: string[]; stdin: string | null } {
  const argv = wordsOf(cmd.name);
  let stdin: string | null = null;
  for (const a of cmd.args ?? []) {
    const value = input[a.name];
    if (value === undefined) continue;
    const text = String(value);
    if (a.stdin && stdin === null) {
      stdin = text;
      argv.push("-");
    } else argv.push(text);
  }
  for (const [name, spec] of Object.entries(flagsOf(cli, cmd))) {
    const value = input[name];
    if (value === undefined || name in BUILTIN_FLAGS) continue;
    if (spec.type === "boolean") {
      if (value === true) argv.push(`--${name}`);
    } else argv.push(`--${name}`, Array.isArray(value) ? value.join(",") : String(value));
  }
  return { argv, stdin };
}
