import { runCli } from "@/registry/ouro/ax/cli";
import { exampleCli } from "@/registry/ouro/ax/example-cli";

/** One line a command printed, and where it went: stdout, or stderr for a refusal. */
export interface Printed {
  stream: "stdout" | "stderr";
  text: string;
}

/** What one command line printed and the exit code it gave. */
export interface Ran {
  line: string;
  printed: Printed[];
  exit: number;
}

/** Splits a command line the way a shell would for these examples: spaces, and single or double quotes around words. */
export function splitArgs(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | null = null;
  let started = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) words.push(word);
      word = "";
      started = false;
    } else {
      word += ch;
      started = true;
    }
  }
  if (started) words.push(word);
  return words;
}

/**
 * Runs a `notes …` command line against the kit's example tool (`ax-example`), in this page, through the kit's own
 * `runCli`: the words, the refusals and the exit codes are the kit's, not a recording.
 */
export async function runNotes(line: string): Promise<Ran> {
  const words = splitArgs(line.trim());
  const argv = words[0] === "notes" ? words.slice(1) : words;
  const printed: Printed[] = [];
  const sink = (stream: Printed["stream"]) => ({
    write(s: string) {
      for (const text of s.replace(/\n$/, "").split("\n")) printed.push({ stream, text });
      return true;
    },
  });
  const exit = await runCli(exampleCli, argv, { stdout: sink("stdout"), stderr: sink("stderr") });
  return { line: line.trim(), printed, exit };
}
