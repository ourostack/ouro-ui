export { argUsage, BUILTIN_FLAGS, checkInput, defineCli, defineCommand, exampleArgv, findCommand, flagsOf, flagUsage, inputSchema, parse, toArgv, usageOf };
export type { ArgSpec, Cli, CliDef, CommandDef, FlagSpec, FlagType, HelpAsked, Input, InputValue, JsonSchema, Meaning, Parsed, RunContext };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

import { AxError, commandLine, didYouMean, shellWord } from "./problem.ts";
import { BASE_EXIT_CODES, defineExitCodes, type ExitTable } from "./exit-codes.ts";
import { DEFAULT_HEADINGS, DRY_RUN_FLAG, WHY_FLAG, WHY_PLACEHOLDER, type Effect, type EffectHeadings } from "./effects.ts";
import { DEFAULT_OUTCOME_EXITS, type Outcome, type OutcomeExits } from "./outcome.ts";
import { DEFAULT_WAIT_EXITS, type WaitExits } from "./wait.ts";
import { checkVoice, type VoiceDef } from "./voice.ts";

/**
 * One definition of a command: its words, effect, arguments and flags, examples and output. From it come the parser
 * (whose refusals name the exact fix), the usage and help, `help --json` and the MCP tool's input schema, so the CLI
 * and the MCP server can never disagree.
 *
 * @claim "the CLI and the MCP server can never disagree" registry/ouro/ax/command.test.mts verify:testExists(registry/ouro/ax/command.test.mts::usage, the input schema and toArgv come from the same definition)
 */
type FlagType = "boolean" | "string" | "number" | "enum" | "list";

interface FlagSpec {
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
  /** A required flag that is not needed when one of these flags or arguments is given (`--why` unless `--why-file`). */
  unless?: string | readonly string[];
  /**
   * A value errors and fixes never print back (a token): they show the placeholder instead.
   *
   * @claim "errors and fixes never print back" registry/ouro/ax/command.test.mts verify:testExists(registry/ouro/ax/command.test.mts::an unknown flag's fix drops its value once the command's words are all given; a sensitive value is never printed back)
   */
  sensitive?: boolean;
}

interface ArgSpec {
  name: string;
  description: string;
  required?: boolean;
  /** Takes the remaining words: joined by spaces (free text), or with "list", as a list of words. */
  rest?: boolean | "list";
  /** Whether "-" reads it from stdin. */
  stdin?: boolean;
  /** Not required when one of these flags is given, as `send <conversation> --draft` sends the draft instead. */
  unless?: string | readonly string[];
  /** The command that lists valid values, as the fix names it ("conversations"). */
  source?: string;
  /** The problem a missing value reports; defaults to "needs <name>". */
  missing?: string;
  /**
   * The words it takes when it is one of a few (`today`, `week`): an unknown flag spelt as one of them (`--week`) gets the
   * word itself as its fix. Help and the input schema don't restrict the argument to them.
   *
   * @claim "gets the word itself as its fix" registry/ouro/ax/command.test.mts verify:testExists(registry/ouro/ax/command.test.mts::an unknown flag that is one of an argument's words gets that word as its fix)
   */
  values?: readonly string[];
}

/**
 * One meaning of an ambiguous word, and the command for it. `use` may hold `{args}`, the words the agent gave after the
 * ambiguous word in that command's argument slots (a slot with none shows its placeholder), and `{flags}`, the flags
 * the agent gave that the command takes (a sensitive value as its placeholder). A flag `use` writes out itself, such as
 * `--why <why>`, gives way to the same flag given.
 *
 * @claim "the words the agent gave after the ambiguous word" registry/ouro/ax/command.test.mts verify:testExists(registry/ouro/ax/command.test.mts::an ambiguous word's fix carries the words and flags the agent gave, in each meaning's command)
 */
interface Meaning {
  means: string;
  use: string;
}

type InputValue = string | number | boolean | readonly string[];
type Input = Readonly<Record<string, InputValue>>;

interface RunContext {
  /** Reads stdin once; a second read throws. */
  stdin(): Promise<string>;
  json: boolean;
}

/** A command's definition. `C` is the context run() and plan() get: RunContext, or an adopter's own that extends it. */
interface CommandDef<R = unknown, C extends RunContext = RunContext> {
  /** One or more words: "today", "draft set". */
  name: string;
  aliases?: readonly string[];
  summary: string;
  effect: Effect;
  /** Marks a read, which changes nothing for anyone. */
  readOnly?: boolean;
  /** Whether --why is asked for; by default it is required where other people see the effect. */
  why?: "required" | "optional" | "none";
  args?: readonly ArgSpec[];
  flags?: Readonly<Record<string, FlagSpec>>;
  examples?: readonly string[];
  /** The `--json` shape, as one line. */
  output?: string;
  /** Out of the overview, still callable and with its help. */
  hidden?: boolean;
  /** Marks the command whose text sums up the person's day: the voice's `summary` line may follow it on a terminal. */
  summarizes?: boolean;
  /** Flags and extra words pass through unchecked: a command adopted before its flags were declared. */
  loose?: boolean;
  run?(input: Input, ctx: C): R | Promise<R>;
  /**
   * The preview `--dry-run` runs instead of run(): what it would do and who would see it, as a `planned` outcome. ax-lint
   * reports an "others" command without one. The kit never calls run() on a dry run.
   *
   * @claim "never calls run() on a dry run" registry/ouro/ax/cli.test.mts verify:testExists(registry/ouro/ax/cli.test.mts::--dry-run runs the plan, never run(): a planned outcome, exit 0, nothing posted)
   */
  plan?(input: Input, ctx: C): Outcome | Promise<Outcome>;
  text?(result: R, input: Input): string;
}

interface CliDef<C extends RunContext = RunContext> {
  name: string;
  /** The overview's first lines: what the tool is and when to use it. */
  about: readonly string[];
  commands: readonly CommandDef<unknown, C>[];
  exits?: ExitTable;
  headings?: EffectHeadings;
  /** The tool's global flags, besides --json and --help. */
  globalFlags?: Readonly<Record<string, FlagSpec>>;
  /**
   * Words that could mean two effects answer with both commands instead of acting.
   *
   * @claim "could mean two effects" registry/ouro/ax/command.test.mts verify:testExists(registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead)
   */
  ambiguous?: Readonly<Record<string, readonly Meaning[]>>;
  /** The overview's one line for a multi-word group ("draft"), when its first command's summary is not it. */
  groups?: Readonly<Record<string, string>>;
  /** Exit code names by outcome state; defaults to DEFAULT_OUTCOME_EXITS. */
  outcomeExits?: OutcomeExits;
  /** Exit code names by wait state; defaults to DEFAULT_WAIT_EXITS. */
  waitExits?: WaitExits;
  /**
   * Optional lines of character for a person at a terminal (ax-voice). With a voice the tool takes `--quiet`, which
   * turns it off.
   *
   * @claim "the tool takes `--quiet`" registry/ouro/ax/cli.test.mts verify:testExists(registry/ouro/ax/cli.test.mts::the voice speaks only on a terminal: never under --json, --quiet, CI or a pipe, and never in an error)
   */
  voice?: VoiceDef;
}

interface Cli<C extends RunContext = RunContext> {
  readonly name: string;
  readonly about: readonly string[];
  readonly commands: readonly CommandDef<unknown, C>[];
  readonly exits: ExitTable;
  readonly headings: EffectHeadings;
  readonly globalFlags: Readonly<Record<string, FlagSpec>>;
  readonly ambiguous: Readonly<Record<string, readonly Meaning[]>>;
  readonly groups: Readonly<Record<string, string>>;
  readonly outcomeExits: OutcomeExits;
  readonly waitExits: WaitExits;
  readonly voice: VoiceDef;
}

const BUILTIN_FLAGS: Readonly<Record<string, FlagSpec>> = Object.freeze({
  json: { type: "boolean", description: "Print one JSON document on stdout instead of text." },
  help: { type: "boolean", description: "This command's help." },
});

/** The flag a tool with a voice takes to print the facts alone. */
const QUIET_FLAG: FlagSpec = Object.freeze({ type: "boolean", description: "The facts only: no voice lines on a terminal." });

function defineCommand<R, C extends RunContext = RunContext>(def: CommandDef<R, C>): CommandDef<R, C> {
  return def;
}

const wordsOf = (name: string) => name.split(" ");
const unlessOf = (spec: { unless?: string | readonly string[] }): readonly string[] => (spec.unless === undefined ? [] : typeof spec.unless === "string" ? [spec.unless] : spec.unless);

/** The flags a command takes: the built-ins, the tool's, --why where asked for, --dry-run on an "others" command, then its own; a command's own flag replaces a generated one of the same name. */
function flagsOf(cli: Pick<Cli, "globalFlags">, cmd: CommandDef): Record<string, FlagSpec> {
  const why = cmd.why ?? (cmd.effect === "others" ? "required" : "none");
  const whyFlag: Record<string, FlagSpec> =
    why === "none" ? {} : { [WHY_FLAG]: { type: "string", required: why === "required", placeholder: `"${WHY_PLACEHOLDER}"`, description: 'Who asked you, and what they said, like "Riley asked me to post the banner"; it is logged with the action.' } };
  const dryRun: Record<string, FlagSpec> = cmd.effect === "others" ? { [DRY_RUN_FLAG]: { type: "boolean", description: "Show what it would do and who would see it, and do nothing." } } : {};
  return { ...BUILTIN_FLAGS, ...cli.globalFlags, ...whyFlag, ...dryRun, ...cmd.flags };
}

/** Builds the tool and checks its definitions: unique names, a valid exit table, examples that parse. */
function defineCli<C extends RunContext = RunContext>(def: CliDef<C>): Cli<C> {
  const cli: Cli<C> = {
    name: def.name,
    about: def.about,
    commands: def.commands,
    exits: def.exits ?? defineExitCodes(BASE_EXIT_CODES),
    headings: def.headings ?? DEFAULT_HEADINGS,
    globalFlags: def.voice && !def.globalFlags?.["quiet"] ? { ...def.globalFlags, quiet: QUIET_FLAG } : (def.globalFlags ?? {}),
    ambiguous: def.ambiguous ?? {},
    groups: def.groups ?? {},
    outcomeExits: def.outcomeExits ?? DEFAULT_OUTCOME_EXITS,
    waitExits: def.waitExits ?? DEFAULT_WAIT_EXITS,
    voice: def.voice ?? {},
  };
  if (def.voice) checkVoice(def.name, def.voice);
  for (const names of [cli.outcomeExits, cli.waitExits]) for (const name of Object.values(names)) cli.exits.code(name);
  const seen = new Set<string>();
  for (const cmd of cli.commands) {
    for (const n of [cmd.name, ...(cmd.aliases ?? [])]) {
      if (seen.has(n)) throw new Error(`${def.name}: two commands are named "${n}". Fix: rename one.`);
      seen.add(n);
    }
    const args = cmd.args ?? [];
    const flags = flagsOf(cli, cmd);
    args.forEach((a, i) => {
      if (a.rest && i !== args.length - 1) throw new Error(`${def.name} ${cmd.name}: <${a.name}> takes the rest of the words, so it must be the last argument. Fix: move it last.`);
      if (Object.hasOwn(flags, a.name)) throw new Error(`${def.name} ${cmd.name}: <${a.name}> and --${a.name} share one input key. Fix: rename one.`);
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
        throw new Error(`${def.name} ${cmd.name}: the example "${example}" does not parse: ${(e as Error).message}`, { cause: e });
      }
    }
  }
  return cli;
}

/** An example's words after the tool's name, up to a pipe; null when the tool is not in it. */
function exampleArgv(tool: string, example: string): string[] | null {
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
function argUsage(a: ArgSpec): string {
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
function flagUsage(name: string, spec: FlagSpec): string {
  return spec.type === "boolean" ? `--${name}` : `--${name} ${placeholderOf(name, spec)}`;
}

/** The command's usage line from its definition: words, arguments, required flags, then the optional ones. */
function usageOf(cli: Pick<Cli, "globalFlags">, cmd: CommandDef): string {
  const flags = Object.entries(flagsOf(cli, cmd)).filter(([name]) => !(name in BUILTIN_FLAGS) && !(name in cli.globalFlags));
  const required = flags.filter(([, s]) => s.required).map(([n, s]) => flagUsage(n, s));
  const optional = flags.filter(([, s]) => !s.required).map(([n, s]) => `[${flagUsage(n, s)}]`);
  return [cmd.name, ...(cmd.args ?? []).map(argUsage), ...required, ...optional].join(" ");
}

interface Parsed {
  kind: "run";
  command: CommandDef;
  input: Input;
  json: boolean;
  /** Flags a loose command passed through unchecked. */
  unchecked: Readonly<Record<string, string | true>>;
}
interface HelpAsked {
  kind: "help";
  /** The command or topic asked about; undefined for the overview. */
  topic: string | undefined;
  json: boolean;
}

/** The command the leading words name (the longest match), and how many words it took. */
function findCommand(cli: Pick<Cli, "commands">, words: readonly string[]): { command: CommandDef; used: number } | null {
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
 *
 * @claim "whose fix is the corrected command line" registry/ouro/ax/command.test.mts verify:testExists(registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead)
 */
function parse(cli: Cli, argv: readonly string[]): Parsed | HelpAsked {
  // Global flags may come before the command's words (`tool --json send ...`); they move after them.
  const globals: Readonly<Record<string, FlagSpec>> = { ...BUILTIN_FLAGS, ...cli.globalFlags };
  let lead = 0;
  while (lead < argv.length) {
    const t = argv[lead]!;
    const spec = t.startsWith("--") ? globals[t.slice(2).split("=")[0]!] : undefined;
    if (!spec) break;
    lead += spec.type !== "boolean" && !t.includes("=") ? 2 : 1;
  }
  const tokens = [...argv.slice(lead), ...argv.slice(0, lead)];
  const json = tokens.includes("--json");
  /** Whether --help or -h is asked, and not as the value of a flag before it (`--category -h`). */
  const helpIn = (flags: Readonly<Record<string, FlagSpec>>) =>
    tokens.some((t, i) => {
      const prev = i > 0 ? tokens[i - 1]! : "";
      const spec = prev.startsWith("--") && !prev.includes("=") ? flags[prev.slice(2)] : undefined;
      return (t === "--help" || t === "-h") && !(spec && spec.type !== "boolean");
    });
  const leading: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("-")) break;
    leading.push(t);
  }
  if (leading[0] === "help") return { kind: "help", topic: leading.slice(1).join(" ") || undefined, json };
  if (leading.length === 0) {
    if (helpIn(globals)) return { kind: "help", topic: undefined, json };
    throw new AxError({ code: "no-command", exit: usage(cli), thing: cli.name, problem: "no command given", fix: `${cli.name} --help` });
  }
  const found = findCommand(cli, leading);
  const refused = ambiguousWord(cli, leading);
  if (refused && (!found || wordsOf(refused).length > found.used)) throw ambiguousError(cli, refused, tokens.slice(wordsOf(refused).length));
  if (!found) throw unknownCommand(cli, leading);
  const { command, used } = found;
  if (helpIn(flagsOf(cli, command))) return { kind: "help", topic: command.name, json };
  const words = tokens.slice(0, used);
  const rest = tokens.slice(used);
  const flags = flagsOf(cli, command);
  const thing = command.name;
  const input: Record<string, InputValue> = {};
  const unchecked: Record<string, string | true> = {};
  const positional: string[] = [];
  const positionalAt: number[] = [];
  // What a fix shows of the words: a sensitive flag's value as its placeholder.
  const shown = rest.map((t, j) => {
    const prev = rest[j - 1];
    const prevSpec = prev?.startsWith("--") && !prev.includes("=") ? flags[prev.slice(2)] : undefined;
    if (prevSpec?.sensitive && prevSpec.type !== "boolean") return placeholderOf(prev!.slice(2), prevSpec);
    const eq = t.indexOf("=");
    const own = t.startsWith("--") && eq !== -1 ? flags[t.slice(2, eq)] : undefined;
    return own?.sensitive ? `${t.slice(0, eq)}=${placeholderOf(t.slice(2, eq), own)}` : t;
  });
  /** The command line with `count` tokens from `start` replaced: the fix an error prints. */
  const at = (start: number, replacement: readonly string[], count: number = 1) => commandLine([cli.name, ...words, ...shown.slice(0, start), ...replacement, ...shown.slice(start + count)]);
  /** Whether a token is one of this command's flags, so it cannot be the value of the flag before it. */
  const isFlag = (t: string) => t.startsWith("--") && Object.hasOwn(flags, t.slice(2).split("=")[0]!);
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
      const word = inline === undefined ? (command.args ?? []).find((a) => a.values?.includes(name)) : undefined;
      if (word) throw new AxError({ code: "unknown-flag", exit: usage(cli), thing, problem: `there is no --${name}; "${name}" is a word for <${word.name}>, without the dashes`, fix: at(i, [name]) });
      const near = didYouMean(name, Object.keys(flags));
      // An unknown flag's value goes with it when the command's words are already all given.
      const next = rest[i + 1];
      const args = command.args ?? [];
      const full = !args.at(-1)?.rest && positional.length >= args.length;
      const span = inline === undefined && next !== undefined && !next.startsWith("-") && full ? 2 : 1;
      const own = [...new Set([...Object.keys(command.flags ?? {}), ...(Object.hasOwn(flags, WHY_FLAG) ? [WHY_FLAG] : [])])];
      throw new AxError({
        code: "unknown-flag",
        exit: usage(cli),
        thing,
        problem: `there is no --${name}${own.length ? `; its flags are ${own.map((f) => `--${f}`).join(", ")}` : "; it takes no flags of its own"}`,
        fix: near ? at(i, [`--${near}${inline === undefined ? "" : `=${inline}`}`]) : at(i, [], span),
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
      if (next === undefined || isFlag(next)) throw new AxError({ code: "missing-value", exit: usage(cli), thing, problem: `--${name} needs a value`, fix: at(i, [`--${name}`, placeholderOf(name, spec)]) });
      raw = next;
      i++;
    }
    input[name] = valueOf(cli, thing, name, spec, raw, (replacement) => at(start, [`--${name}`, replacement], i - start + 1));
  }
  const args = command.args ?? [];
  const given = [...positional];
  for (const a of args) {
    if (given.length === 0) break;
    input[a.name] = a.rest === "list" ? given.splice(0) : a.rest ? given.splice(0).join(" ") : given.shift()!;
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
    const unless = unlessOf(a);
    if (!a.required || Object.hasOwn(input, a.name) || unless.some((u) => Object.hasOwn(input, u))) continue;
    const filled = commandLine([cli.name, ...words, ...positional, `<${a.name}>`, ...shown.filter((_, j) => !positionalAt.includes(j))]);
    throw new AxError({
      code: "missing-arg",
      exit: usage(cli),
      thing,
      problem: a.missing ?? `needs <${a.name}>${unless.length ? ` (or ${unless.map((u) => `--${u}`).join(", ")})` : ""}`,
      fix: a.source ? `${cli.name} ${a.source}, then ${filled}` : filled,
    });
  }
  for (const [name, spec] of Object.entries(flags)) {
    if (!spec.required || Object.hasOwn(input, name) || unlessOf(spec).some((u) => Object.hasOwn(input, u))) continue;
    throw new AxError({
      code: name === WHY_FLAG ? "needs-why" : "missing-flag",
      exit: usage(cli),
      thing,
      problem: name === WHY_FLAG ? whyProblem(command, "--why") : `needs --${name}: ${spec.description.replace(/[.\s]+$/, "")}`,
      fix: commandLine([cli.name, ...words, ...shown, `--${name}`, placeholderOf(name, spec).replace(/^"(.*)"$/, "$1")]),
    });
  }
  return { kind: "run", command, input, json, unchecked };
}

function valueOf(cli: Cli, thing: string, name: string, spec: FlagSpec, raw: string, fixWith: (replacement: string) => string): InputValue {
  const said = spec.sensitive ? "the value given" : `"${raw}"`;
  if (spec.stdin && raw === "-") return raw;
  if (spec.type === "number") {
    const n = Number(raw);
    const inRange = raw.trim() !== "" && Number.isFinite(n) && (spec.min === undefined || n >= spec.min) && (spec.max === undefined || n <= spec.max);
    if (!inRange) {
      const range = spec.min !== undefined && spec.max !== undefined ? ` from ${spec.min} to ${spec.max}` : spec.min !== undefined ? ` of at least ${spec.min}` : "";
      throw new AxError({ code: "bad-value", exit: usage(cli), thing, problem: `--${name} takes a number${range}, not ${said}`, fix: fixWith(String(spec.min ?? 1)) });
    }
    return n;
  }
  if (spec.type === "enum") {
    const values = spec.values ?? [];
    if (!values.includes(raw)) {
      const near = didYouMean(raw, values);
      throw new AxError({ code: "bad-value", exit: usage(cli), thing, problem: `--${name} is one of ${values.join(", ")}, not ${said}`, fix: fixWith(near ?? values.join("|")) });
    }
    return raw;
  }
  if (spec.type === "list") return raw.split(/[\s,]+/).filter(Boolean);
  return raw;
}

/** The longest ambiguous word or phrase (`edit`, `draft send`) the leading words start with, or null. */
function ambiguousWord(cli: Cli, leading: readonly string[]): string | null {
  const matches = Object.keys(cli.ambiguous).filter((key) => wordsOf(key).every((w, i) => leading[i] === w));
  return matches.sort((a, b) => wordsOf(b).length - wordsOf(a).length)[0] ?? null;
}

/** The flags given after an ambiguous word, by name, with their values; and the words that are not flags or values. */
function givenAfter(cli: Cli, after: readonly string[]): { words: string[]; flags: { name: string; value: string | null }[] } {
  const words: string[] = [];
  const flags: { name: string; value: string | null }[] = [];
  // A flag takes the next word as its value when some command declares it with a value.
  const takesValue = (name: string) => cli.commands.some((c) => {
    const spec = flagsOf(cli, c)[name];
    return spec !== undefined && spec.type !== "boolean";
  });
  for (let i = 0; i < after.length; i++) {
    const t = after[i]!;
    if (!t.startsWith("--")) {
      words.push(t);
      continue;
    }
    const eq = t.indexOf("=");
    const name = t.slice(2, eq === -1 ? undefined : eq);
    const next = after[i + 1];
    const value = eq !== -1 ? t.slice(eq + 1) : next !== undefined && !next.startsWith("--") && takesValue(name) ? (i++, next) : null;
    flags.push({ name, value });
  }
  return { words, flags };
}

/** A meaning's command with the given words and flags in it ({args}, {flags}); a `use` without them is as written. */
function fillMeaning(cli: Cli, use: string, given: ReturnType<typeof givenAfter>): string {
  if (!use.includes("{args}") && !use.includes("{flags}")) return use;
  const cmd = findCommand(cli, wordsOf(use.split("{")[0]!.trim()))?.command;
  const flags = cmd ? flagsOf(cli, cmd) : {};
  const taken = given.flags.filter((f) => Object.hasOwn(flags, f.name) && !(f.name in BUILTIN_FLAGS));
  // A flag the template writes out itself gives way to the same flag given.
  let template = use;
  for (const f of taken) template = template.replace(new RegExp(` --${f.name}(?![\\w-])(?:=\\S+| "[^"]*"| <[^>]*>| (?!-|\\{)\\S+)?`, "g"), "");
  const slots: string[] = [];
  const words = [...given.words];
  for (const a of cmd?.args ?? []) {
    if (a.rest) slots.push(...(words.length ? words.splice(0).map(shellWord) : a.required ? [`<${a.name}>`] : []));
    else if (words.length) slots.push(shellWord(words.shift()!));
    else if (a.required) slots.push(`<${a.name}>`);
  }
  slots.push(...words.map(shellWord));
  const flagWords = taken.flatMap((f) => {
    const spec = flags[f.name]!;
    if (spec.type === "boolean" || f.value === null) return [`--${f.name}`];
    return [`--${f.name}`, spec.sensitive ? placeholderOf(f.name, spec) : shellWord(f.value)];
  });
  return template.replace("{args}", slots.join(" ")).replace("{flags}", flagWords.join(" ")).replace(/ {2,}/g, " ").trim();
}

function ambiguousError(cli: Cli, word: string, after: readonly string[]): AxError {
  const meanings = cli.ambiguous[word]!;
  const given = givenAfter(cli, after);
  return new AxError({
    code: "ambiguous",
    exit: usage(cli),
    thing: word,
    problem: `"${word}" could mean ${meanings.length} things, so it does nothing: ${meanings.map((m) => m.means).join("; or ")}`,
    fix: meanings.map((m) => `${cli.name} ${fillMeaning(cli, m.use, given)}`).join(" or "),
  });
}

function unknownCommand(cli: Cli, leading: readonly string[]): AxError {
  const word = leading[0]!;
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
    problem: `there is no command "${word}"; the commands are ${[...new Set(names)].join(", ")}`,
    fix: near ? commandLine([cli.name, near, ...leading.slice(1)]) : `${cli.name} --help`,
  });
}

/** A JSON Schema object, as an MCP tool's inputSchema takes. */
interface JsonSchema {
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
function inputSchema(cli: Pick<Cli, "globalFlags">, cmd: CommandDef): JsonSchema & { properties: Record<string, JsonSchema & { type: string }>; required: string[] } {
  const properties: Record<string, JsonSchema & { type: string }> = {};
  const required: string[] = [];
  for (const a of cmd.args ?? []) {
    const unless = unlessOf(a);
    const description = a.description + (unless.length ? ` Not needed with ${unless.join(" or ")}.` : "");
    properties[a.name] = a.rest === "list" ? { type: "array", items: { type: "string" }, description } : { type: "string", description };
    if (a.required && !unless.length) required.push(a.name);
  }
  for (const [name, spec] of Object.entries(flagsOf(cli, cmd))) {
    if (name in BUILTIN_FLAGS || spec === QUIET_FLAG) continue;
    const unless = unlessOf(spec);
    const type = spec.type === "boolean" ? "boolean" : spec.type === "number" ? "number" : spec.type === "list" ? "array" : "string";
    const s: JsonSchema & { type: string } = { type, description: spec.description + (unless.length ? ` Not needed with ${unless.join(" or ")}.` : "") };
    if (spec.min !== undefined) s.minimum = spec.min;
    if (spec.max !== undefined) s.maximum = spec.max;
    if (spec.type === "list") s.items = { type: "string" };
    if (spec.values) s.enum = spec.values;
    properties[name] = s;
    if (spec.required && !unlessOf(spec).length) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/** Why --why is needed: other people will see it, or it acts on the person's own things for them. */
const whyProblem = (cmd: CommandDef, flag: string) =>
  cmd.effect === "others" ? `other people will see this as the person's, so it needs ${flag}: ${WHY_PLACEHOLDER.slice(1, -1)}` : `it acts on the person's own things for them, so it needs ${flag}: ${WHY_PLACEHOLDER.slice(1, -1)}`;

const typeName = (value: unknown) => (Array.isArray(value) ? "array" : typeof value);

/**
 * Checks an MCP call's arguments against the command, as the parser checks argv: an unknown property names the nearest,
 * a wrong type or a missing value names it. The fix is the arguments to send instead, as JSON.
 */
function checkInput(cli: Cli, cmd: CommandDef, raw: unknown, thing: string = cmd.name.replace(/ /g, "_")): Input {
  const schema = inputSchema(cli, cmd);
  const props = schema.properties;
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
    const want = s.type;
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
  for (const key of schema.required) {
    if (Object.hasOwn(input, key)) continue;
    fixed[key] = key === WHY_FLAG ? WHY_PLACEHOLDER : `<${key}>`;
    fail(key === WHY_FLAG ? "needs-why" : "missing-arg", key === WHY_FLAG ? whyProblem(cmd, '"why"') : `needs "${key}": ${props[key]?.description ?? ""}`);
  }
  for (const a of cmd.args ?? []) {
    const unless = unlessOf(a);
    if (a.required && unless.length && !Object.hasOwn(input, a.name) && !unless.some((u) => Object.hasOwn(input, u))) {
      fixed[a.name] = `<${a.name}>`;
      fail("missing-arg", `needs "${a.name}" (or ${unless.map((u) => `"${u}"`).join(", ")})`);
    }
  }
  for (const [name, spec] of Object.entries(flagsOf(cli, cmd))) {
    const unless = unlessOf(spec);
    if (spec.required && unless.length && !Object.hasOwn(input, name) && !unless.some((u) => Object.hasOwn(input, u))) {
      fixed[name] = name === WHY_FLAG ? WHY_PLACEHOLDER : `<${name}>`;
      fail(name === WHY_FLAG ? "needs-why" : "missing-arg", `needs "${name}" (or ${unless.map((u) => `"${u}"`).join(", ")})`);
    }
  }
  return input;
}

/**
 * The argv that runs a command with this input, the way an agent would type it; the first stdin-capable argument's
 * text goes on stdin ("-"), so text that starts with "-" or spans lines passes whole.
 */
function toArgv(cli: Pick<Cli, "globalFlags">, cmd: CommandDef, input: Input): { argv: string[]; stdin: string | null } {
  const argv = wordsOf(cmd.name);
  let stdin: string | null = null;
  for (const a of cmd.args ?? []) {
    const value = input[a.name];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      argv.push(...value);
      continue;
    }
    const text = String(value);
    if (a.stdin && stdin === null) {
      stdin = text;
      argv.push("-");
    } else argv.push(text);
  }
  for (const [name, spec] of Object.entries(flagsOf(cli, cmd))) {
    const value = input[name];
    if (value === undefined || name in BUILTIN_FLAGS || spec === QUIET_FLAG) continue;
    if (spec.type === "boolean") {
      if (value === true) argv.push(`--${name}`);
    } else argv.push(`--${name}`, Array.isArray(value) ? value.join(",") : String(value));
  }
  return { argv, stdin };
}
