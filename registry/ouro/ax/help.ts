/**
 * Help from the definitions: a one-screen overview under the two effect headings, each command's details, and the same
 * as JSON (`help --json`), which an agent parses instead of scraping text. Every line is wrapped to `width` columns.
 */
import { argUsage, BUILTIN_FLAGS, flagsOf, flagUsage, inputSchema, usageOf, type Cli, type CommandDef, type JsonSchema } from "./command.ts";
import { WHY_FLAG } from "./effects.ts";

export const DEFAULT_WIDTH = 100;

/** Wraps text to `width` columns, every line indented; a word longer than a line stays whole. */
export function wrap(text: string, indent: number, first: number = indent, width: number = DEFAULT_WIDTH): [...string[], string] {
  const lines: string[] = [];
  let line = " ".repeat(first);
  let empty = true;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!empty && line.length + 1 + word.length > width) {
      lines.push(line);
      line = " ".repeat(indent);
      empty = true;
    }
    line += (empty ? "" : " ") + word;
    empty = false;
  }
  return [...lines, line];
}

export interface OverviewOptions {
  width?: number;
  /** Added after the "others" heading, such as " (only when a human asked you to; each needs --why)". */
  othersNote?: string;
  /** Lines after the command lists; defaults to where details are, --json and the exit codes. */
  footer?: readonly string[];
}

const listed = (cli: Cli) => cli.commands.filter((c) => !c.hidden);

/** Commands of one effect, one per row: a multi-word command ("draft set") shows under its first word once. */
function rows(cli: Cli, effect: "private" | "others"): { name: string; summary: string }[] {
  const out: { name: string; summary: string }[] = [];
  for (const c of listed(cli).filter((x) => x.effect === effect)) {
    const head = c.name.split(" ")[0]!;
    if (out.some((r) => r.name === head)) continue;
    out.push({ name: head, summary: c.summary });
  }
  return out;
}

/** The overview: what the tool is, the commands under "Only you see these" and "Other people see these", the footer. */
export function renderOverview(cli: Cli, options: OverviewOptions = {}): string {
  const width = options.width ?? DEFAULT_WIDTH;
  const mine = rows(cli, "private");
  const theirs = rows(cli, "others");
  const pad = Math.max(...[...mine, ...theirs].map((r) => r.name.length)) + 2;
  const line = (r: { name: string; summary: string }) => `  ${r.name.padEnd(pad)} ${r.summary}`;
  const footer = options.footer ?? [...wrap(`Output: --json on every command. ${cli.exits.line()} Errors: one line that says what to do instead.`, 0, 0, width), `Details: ${cli.name} help <command>`];
  return [...cli.about, "", cli.headings.private, ...mine.map(line), "", `${cli.headings.others}${options.othersNote ?? ""}`, ...theirs.map(line), "", ...footer, ""].join("\n");
}

const COL = 34;

/** `left` from column 2, `text` from column 34, wrapped. */
function columns(left: string, text: string, width: number): string[] {
  if (left.length + 4 < COL) {
    const [head, ...more] = wrap(text, COL, COL, width);
    return [`  ${left}`.padEnd(COL) + head.slice(COL), ...more];
  }
  return [...wrap(left, 4, 2, width), ...wrap(text, COL, COL, width)];
}

/** One line per flag: usage on the left, what it does on the right; the built-ins and the tool's own are left out. */
export function flagLines(cli: Cli, cmd: CommandDef, width: number = DEFAULT_WIDTH): string[] {
  return Object.entries(flagsOf(cli, cmd))
    .filter(([name]) => !(name in BUILTIN_FLAGS) && !(name in cli.globalFlags))
    .flatMap(([name, spec]) => columns(flagUsage(name, spec), `${spec.description}${spec.required ? " Required." : ""}${spec.stdin ? ' "-" reads it from stdin.' : ""}`, width));
}

/** The generated part of a command's help: its usage from the definition, its arguments and its flags. */
export function definitionLines(cli: Cli, cmd: CommandDef, width: number = DEFAULT_WIDTH): string[] {
  const args = (cmd.args ?? []).flatMap((a) => columns(argUsage(a), `${a.description}${a.source ? ` "${cli.name} ${a.source}" lists them.` : ""}${a.stdin ? ' "-" reads it from stdin.' : ""}`, width));
  return ["Definition", ...wrap(`${cli.name} ${usageOf(cli, cmd)}`, 4, 2, width), ...args, ...flagLines(cli, cmd, width)];
}

/** One command's whole help, from its definition alone. */
export function renderCommand(cli: Cli, cmd: CommandDef, width: number = DEFAULT_WIDTH): string {
  const lines = [
    ...(cmd.effect === "others" ? [...wrap(`${cli.headings.others}: run it only when a human asked you to, with --${WHY_FLAG}.`, 0, 0, width), ""] : []),
    ...wrap(`${cli.name} ${cmd.name}: ${cmd.summary}`, 2, 0, width),
    "",
    ...definitionLines(cli, cmd, width),
  ];
  if (cmd.output) lines.push("", "--json", ...wrap(cmd.output, 4, 2, width));
  if (cmd.examples?.length) lines.push("", "Examples", ...cmd.examples.map((x) => `  ${x}`));
  lines.push("", ...wrap(cli.exits.line(), 0, 0, width), "");
  return lines.join("\n");
}

export interface CommandManifest {
  name: string;
  aliases: readonly string[];
  effect: "private" | "others";
  whoSees: string;
  readOnly: boolean;
  needsWhy: boolean;
  summary: string;
  usage: string;
  inputSchema: JsonSchema;
  output: string | null;
  examples: readonly string[];
  hidden: boolean;
}

/** One command as data. */
export function commandManifest(cli: Cli, cmd: CommandDef): CommandManifest {
  const flags = flagsOf(cli, cmd);
  return {
    name: cmd.name,
    aliases: cmd.aliases ?? [],
    effect: cmd.effect,
    whoSees: cmd.effect === "others" ? cli.headings.others : cli.headings.private,
    readOnly: cmd.readOnly === true,
    needsWhy: flags[WHY_FLAG]?.required === true,
    summary: cmd.summary,
    usage: `${cli.name} ${usageOf(cli, cmd)}`,
    inputSchema: inputSchema(cli, cmd),
    output: cmd.output ?? null,
    examples: cmd.examples ?? [],
    hidden: cmd.hidden === true,
  };
}

/** The help as data: the tool, its headings, every command, the exit codes and the one error shape. */
export function helpJson(cli: Cli) {
  return {
    tool: cli.name,
    about: cli.about,
    effects: { private: cli.headings.private, others: cli.headings.others },
    commands: cli.commands.map((c) => commandManifest(cli, c)),
    exitCodes: cli.exits.codes,
    errorShape: { error: { code: "<slug>", exit: "<exit code>", thing: "<command or flag>", problem: "<what's wrong>", fix: "<exact code to run instead, or null>", message: "<thing>: <problem>. Fix: <fix>." } },
  };
}
