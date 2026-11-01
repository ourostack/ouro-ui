export { dispatch, isEmptyResult, printResult, quietPipes, runCli };
export type { CliIo, RunOptions };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

import { flagsOf, findCommand, parse, type ArgSpec, type Cli, type CommandDef, type Input, type InputValue, type Parsed, type RunContext } from "./command.ts";
import { DRY_RUN_FLAG } from "./effects.ts";
import { AxError, errorJson, errorLine, isAxError, type AxErrorShape } from "./problem.ts";
import { commandManifest, helpJson, renderCommand, renderOverview, type OverviewOptions } from "./help.ts";
import { isOutcome, outcomeExit, outcomeText, type Outcome } from "./outcome.ts";
import { render } from "./output.ts";
import { isWait, waitExit, waitText } from "./wait.ts";
import { createVoice, type Voice, type VoiceMemory, type VoiceSlot } from "./voice.ts";

/**
 * The whole front door for a tool built on the kit: parse, help, run (or, on `--dry-run`, plan), print the result as
 * text or `--json`, and turn every failure into the one error line and its exit code. An outcome or a wait sets the
 * exit code from its state.
 *
 * @claim "turn every failure into" registry/ouro/ax/cli.test.mts verify:testExists(registry/ouro/ax/cli.test.mts::an error is one stderr line with the fix and its exit code; --json also prints the error shape)
 */
interface CliIo {
  /** `isTTY` says stdout is a terminal, the one place a voice line may print. */
  stdout: { write(s: string): unknown; isTTY?: boolean };
  stderr: { write(s: string): unknown };
  stdin?: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>;
}

interface RunOptions {
  overview?: OverviewOptions;
  /** Help topics that are not commands, as finished text. */
  topics?: Readonly<Record<string, string>>;
  /** The environment the voice reads `CI` from; defaults to the process's. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Keeps the last variant of a voice slot between runs, so variants rotate across runs too. */
  voiceMemory?: VoiceMemory;
}

async function readAll(stream: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array> | undefined): Promise<string> {
  if (!stream) return "";
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of stream) text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/** Replaces the one "-" value with stdin's text; a second "-" is a usage error. */
async function withStdin(cli: Cli, cmd: CommandDef, input: Input, stdin: () => Promise<string>): Promise<Input> {
  const out: Record<string, InputValue> = { ...input };
  const stdinNames = [...(cmd.args ?? []).filter((a: ArgSpec) => a.stdin).map((a) => a.name), ...Object.entries(flagsOf(cli, cmd)).filter(([, s]) => s.stdin).map(([n]) => n)];
  const dashes = stdinNames.filter((n) => out[n] === "-");
  if (dashes.length > 1) throw new AxError({ code: "two-stdin", exit: cli.exits.code("usage"), thing: cmd.name, problem: `only one "-" (stdin) per command, and ${dashes.map((n) => n).join(" and ")} both ask for it`, fix: `${cli.name} ${cmd.name} ... with the shorter text on the command line` });
  for (const n of dashes) out[n] = (await stdin()).replace(/\r?\n$/, "");
  return out;
}

/**
 * Runs a parsed command as runCli does, for a tool that reads stdin and prints errors its own way: on `--dry-run` the
 * command's plan(), refused ("no-preview") when it has none, else its run(). It prints nothing and reads no stdin.
 *
 * @claim "It prints nothing and reads" registry/ouro/ax/cli.test.mts verify:testExists(registry/ouro/ax/cli.test.mts::dispatch runs the plan or run() with the tool's own context, and prints nothing)
 * @claim "on `--dry-run` the command's plan()" registry/ouro/ax/cli.test.mts verify:testExists(registry/ouro/ax/cli.test.mts::dispatch runs the plan or run() with the tool's own context, and prints nothing)
 */
async function dispatch<C extends RunContext>(cli: Cli<C>, parsed: Parsed, ctx: C): Promise<unknown> {
  const cmd = parsed.command as CommandDef<unknown, C>;
  const dryRun = parsed.input[DRY_RUN_FLAG] === true;
  if (dryRun && !cmd.plan) throw new AxError({ code: "no-preview", exit: cli.exits.code("usage"), thing: `${cmd.name} --${DRY_RUN_FLAG}`, problem: "this command has no preview, so nothing was done", fix: null });
  if (!dryRun && !cmd.run) throw new AxError({ code: "not-runnable", exit: cli.exits.code("error"), thing: cmd.name, problem: "this command has no run() in its definition", fix: null });
  return dryRun ? cmd.plan!(parsed.input, ctx) : cmd.run!(parsed.input, ctx);
}

/** Whether a result is an empty list: an empty array, or a page (`{ items }`) whose items are empty. */
function isEmptyResult(result: unknown): boolean {
  if (Array.isArray(result)) return result.length === 0;
  const items = typeof result === "object" && result !== null ? (result as { items?: unknown }).items : undefined;
  return Array.isArray(items) && items.length === 0;
}

/**
 * Prints a command's result as runCli does and returns the exit code: an outcome by its state (a refusal or failure in
 * text is the one error line on stderr), a wait by its state, anything else as its text or `--json`. Given the
 * process's voice, a voice line may follow the text on stdout, never before it: after a done or queued outcome, an
 * empty list, or the summary command.
 *
 * @claim "never before it" registry/ouro/ax/cli.test.mts verify:testExists(registry/ouro/ax/cli.test.mts::a voice line follows the fact it adds to: a done outcome, an empty list, the summary, and one celebration at most)
 */
function printResult(cli: Cli, cmd: CommandDef, input: Input, result: unknown, json: boolean, io: Pick<CliIo, "stdout" | "stderr">, voice?: Voice): number {
  const say = (slot: VoiceSlot, outcome?: Outcome) => {
    const line = json || !voice ? null : voice.line(slot, outcome);
    if (line !== null) io.stdout.write(`${line}\n`);
  };
  if (isOutcome(result)) {
    const exit = outcomeExit(result, cli.exits, cli.outcomeExits);
    if (!json && result.error && (result.state === "refused" || result.state === "failed")) io.stderr.write(`${outcomeText(result, cli.name)}\n`);
    else {
      io.stdout.write(render(result, { json, text: (o) => outcomeText(o, cli.name) }));
      if (result.state === "done" || result.state === "queued") say("done", result);
    }
    return exit;
  }
  const own = cmd.text;
  const text = own ? (r: unknown) => own.call(cmd, r, input) : isWait(result) ? () => waitText(result) : undefined;
  io.stdout.write(render(result, { json, ...(text ? { text } : {}) }));
  if (isWait(result)) return waitExit(result, cli.exits, cli.waitExits);
  if (isEmptyResult(result)) say("empty");
  else if (cmd.summarizes) say("summary");
  return 0;
}

/** The process's environment, read without Node's types so the kit also type-checks without them. */
// Node always has a process; the fallback is for a runtime without one.
/* node:coverage ignore next */
const processEnv = (): Readonly<Record<string, string | undefined>> => (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

async function runCli(cli: Cli, argv: readonly string[], io: CliIo, options: RunOptions = {}): Promise<number> {
  let json = argv.includes("--json");
  try {
    const parsed = parse(cli, argv);
    json = parsed.json;
    const voice = createVoice(cli.voice, {
      tty: io.stdout.isTTY === true,
      json,
      quiet: parsed.kind === "run" ? parsed.input["quiet"] === true : argv.includes("--quiet"),
      env: options.env ?? processEnv(),
      ...(options.voiceMemory ? { memory: options.voiceMemory } : {}),
    });
    if (parsed.kind === "help") {
      const topic = parsed.topic;
      if (topic === undefined) {
        if (parsed.json) io.stdout.write(`${JSON.stringify(helpJson(cli), null, 2)}\n`);
        else {
          const banner = voice.line("banner");
          io.stdout.write(`${banner === null ? "" : `${banner}\n`}${renderOverview(cli, options.overview)}`);
        }
        return 0;
      }
      const found = findCommand(cli, topic.split(" "));
      if (found) {
        io.stdout.write(parsed.json ? `${JSON.stringify(commandManifest(cli, found.command), null, 2)}\n` : renderCommand(cli, found.command));
        return 0;
      }
      const text = options.topics && Object.hasOwn(options.topics, topic) ? options.topics[topic] : undefined;
      if (text !== undefined) {
        io.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
        return 0;
      }
      throw new AxError({ code: "unknown-topic", exit: cli.exits.code("usage"), thing: "help", problem: `there is no help for "${topic}"`, fix: `${cli.name} --help` });
    }
    const cmd = parsed.command;
    let taken = false;
    const stdin = async () => {
      if (taken) throw new AxError({ code: "two-stdin", exit: cli.exits.code("usage"), thing: cmd.name, problem: 'stdin was already read; only one "-" per command', fix: null });
      taken = true;
      return readAll(io.stdin);
    };
    const input = await withStdin(cli, cmd, parsed.input, stdin);
    const result = await dispatch(cli, { ...parsed, input }, { stdin, json });
    return printResult(cli, cmd, input, result, json, io, voice);
  } catch (e) {
    const shape: AxErrorShape = isAxError(e) ? e.shape : { code: "error", exit: cli.exits.code("error"), thing: cli.name, problem: e instanceof Error ? e.message : String(e), fix: null };
    io.stderr.write(`${errorLine(cli.name, shape)}\n`);
    if (json) io.stdout.write(`${JSON.stringify(errorJson(shape), null, 2)}\n`);
    return shape.exit;
  }
}

/** A stream that reports its errors as events, as Node's process.stdout and process.stderr do. */
interface ErrorEvents {
  on(event: "error", listener: (error: { code?: string }) => void): unknown;
}

/**
 * Ends the tool quietly when whatever reads its output goes away, as in `tool help | head -1`: on `EPIPE` it exits with
 * the exit code so far (0 when none was set) and prints nothing, instead of a stack trace. Call it once in the tool's
 * bin, before runCli: `quietPipes(process)`. Any other stream error is thrown as before.
 *
 * @claim "prints nothing, instead of a stack trace" registry/ouro/ax/cli.test.mts verify:testExists(registry/ouro/ax/cli.test.mts::a closed pipe ends the tool quietly with the exit code so far, and any other stream error still throws)
 */
function quietPipes(proc: { stdout: ErrorEvents; stderr: ErrorEvents; exitCode?: number | string | null | undefined; exit(code?: number): unknown }): void {
  for (const stream of [proc.stdout, proc.stderr]) {
    stream.on("error", (error) => {
      if (error.code !== "EPIPE") throw error;
      proc.exit(typeof proc.exitCode === "number" ? proc.exitCode : 0);
    });
  }
}
