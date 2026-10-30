/**
 * The kit's conformance check for a tool's definitions: what an agent needs from every declared command (a summary, an
 * example, a described argument and flag, --why where other people see it, help that fits the width), and how much of
 * the tool is declared yet.
 */
import { flagsOf, type Cli } from "./command.ts";
import { WHY_FLAG } from "./effects.ts";
import { DEFAULT_WIDTH, renderCommand, renderOverview } from "./help.ts";

export interface LintReport {
  /** Commands whose calls the kit checks. */
  typed: string[];
  /** Commands that still pass through unchecked. */
  loose: string[];
  /** One line each, in the dev message format: `<tool> <command>: <what's wrong>. Fix: <what to add>.` */
  problems: string[];
}

export function lintCli(cli: Cli, width: number = DEFAULT_WIDTH): LintReport {
  const problems: string[] = [];
  const say = (thing: string, problem: string, fix: string) => problems.push(`${cli.name} ${thing}: ${problem}. Fix: ${fix}.`);
  const long = (text: string) => text.split("\n").find((line) => line.length > width);
  const typed = cli.commands.filter((c) => !c.loose);
  for (const cmd of typed) {
    if (!cmd.summary.trim()) say(cmd.name, "has no summary", "summary: \"<what it does, in one line>\"");
    if (!cmd.examples?.length) say(cmd.name, "has no example", `examples: ["${cli.name} ${cmd.name} ..."]`);
    if (cmd.effect === "others" && flagsOf(cli, cmd)[WHY_FLAG]?.required !== true) say(cmd.name, "reaches other people without a required --why", 'drop why: "optional"');
    if (cmd.effect === "others" && cmd.readOnly) say(cmd.name, "is a read that other people see", 'effect: "private", or drop readOnly');
    for (const a of cmd.args ?? []) if (!a.description.trim()) say(cmd.name, `<${a.name}> has no description`, `{ name: "${a.name}", description: "<what it is>" }`);
    for (const [name, spec] of Object.entries(cmd.flags ?? {})) if (!spec.description.trim()) say(cmd.name, `--${name} has no description`, `${name}: { description: "<what it does>" }`);
    const line = long(renderCommand(cli, cmd, width));
    if (line) say(cmd.name, `its help has a line of ${line.length} columns`, `shorten "${line.trim().slice(0, 40)}..."`);
  }
  const over = long(renderOverview(cli, { width }));
  if (over) say("--help", `the overview has a line of ${over.length} columns`, "shorten that command's summary");
  return { typed: typed.map((c) => c.name), loose: cli.commands.filter((c) => c.loose).map((c) => c.name), problems };
}
