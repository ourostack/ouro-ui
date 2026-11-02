import { claim } from "@/registry/ouro/lib/ouro/claims";
import { cast } from "./cast";
import type { Ran } from "./run";
import { splitArgs } from "./run";

/*
 * The playground gives the visitor a person to work for: three short asks from the person to their own agent, each
 * checked off from the kit's real state (the room's messages and notes, and what a wait printed), never from a button
 * press alone. And a few notes in the page's voice when a visitor does something no agent in our runs did. Pure, so
 * ax.test.tsx runs them.
 */

type Room = { messages: ReadonlyArray<{ by: string }>; notes: readonly string[] } | undefined;

/** What a wait heard: the line the tool printed after "Happened:", split into its time, who said it and what. */
export interface Heard {
  at: string;
  by: string;
  text: string;
}

/** What the visitor has done, as the tool's state shows it. */
export interface Progress {
  /** A real post reached the room (a preview does not). */
  posted: boolean;
  /** A wait ended with someone's reply. */
  heard: Heard | null;
  /** A note only the person sees. */
  noted: boolean;
}

export function progressOf(room: Room, heard: Heard | null): Progress {
  return { posted: room?.messages.some((message) => message.by === "you") ?? false, heard, noted: (room?.notes.length ?? 0) > 0 };
}

/**
 * The three asks, in order: what the person asks their agent, and the agent's reply once the tool's state shows it
 * done. The replies give the fact first and who can see it.
 */
export const ASKS: ReadonlyArray<{ ask: string; done: (progress: Progress) => boolean; answer: (progress: Progress) => string }> = [
  {
    ask: "Tell Design sync I'll be back soon.",
    done: (progress) => progress.posted,
    answer: () => cast("Posted in Design sync on your word. {replier} and {other} can see it."),
  },
  {
    ask: "Tell me when someone answers.",
    done: (progress) => progress.heard !== null,
    answer: (progress) => `${progress.heard!.by} answered in Design sync: “${progress.heard!.text}”`,
  },
  {
    ask: cast("Remind me to ask {replier} about the dates. Just for me."),
    done: (progress) => progress.noted,
    answer: () => "Noted in Design sync. Only you see it; nothing was sent.",
  },
];

/** How many asks are done, in order: an ask counts once every ask before it is done too. */
export function asksDone(progress: Progress): number {
  let done = 0;
  while (done < ASKS.length && ASKS[done]!.done(progress)) done += 1;
  return done;
}

/** The reply a finished wait printed, from its lines ("Happened: …", then "<time> <name>: <text>"). */
export function heardFrom(ran: Ran): Heard | null {
  const lines = ran.printed.filter((line) => line.stream === "stdout").map((line) => line.text);
  const at = lines.findIndex((line) => line.startsWith("Happened:"));
  const match = at === -1 ? null : /^(\S+) ([^:]+): (.*)$/.exec(lines[at + 1] ?? "");
  return match ? { at: match[1]!, by: match[2]!, text: match[3]! } : null;
}

/** The example tool's commands (example-cli.ts), and help. */
const COMMANDS = new Set(["help", "rooms", "note", "post", "watch"]);

/** Something the visitor did that no agent in our runs did, and the note that says so. */
export type Egg = "flag" | "preview" | "words";

export const EGGS: Record<Egg, string> = {
  flag: claim("In 30 agent runs, no agent passed a misspelt flag. You just did, and the tool still named the fix.", {
    source: { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md" },
    verify: { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md", pattern: "In 30 agent runs no agent passed a misspelt flag or used `--dry-run`" },
  }),
  preview: claim("In 30 agent runs, no agent used --dry-run to preview a post. You just did.", {
    source: { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md" },
    verify: { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md", pattern: "In 30 agent runs no agent passed a misspelt flag or used `--dry-run`" },
  }),
  words: "That's how people talk. The tool takes only commands: turning one into the other is the agent's job, and today that's you.",
};

/** Which note, if any, a command earns: a misspelt flag the tool refused, a preview that ran, or plain words. */
export function eggFor(ran: Ran): Egg | null {
  if (ran.exit !== 0 && ran.printed.some((line) => line.stream === "stderr" && /there is no --/.test(line.text))) return "flag";
  const words = splitArgs(ran.line);
  if (ran.exit === 0 && words.includes("--dry-run")) return "preview";
  const first = words[0]?.toLowerCase();
  if (first && first !== "notes" && !first.startsWith("-") && !COMMANDS.has(first) && (words.length >= 3 || ran.line.trim().endsWith("?"))) return "words";
  return null;
}
