import { claim } from "@/registry/ouro/lib/ouro/claims";
import transcripts from "./transcripts.json";

/*
 * "A morning with an agent": Sam asks their agent for five things, and the page shows each one twice, as Sam sees it
 * and as the agent sees it. The agent's side is the kit's example tool (registry/ouro/ax/example-cli.ts): each command
 * and what it printed is in transcripts.json, and ax.test.tsx runs every one through the kit and compares.
 */

/** A command the agent runs, and what the tool printed. `meanwhile` is a message someone posts while the command waits. */
export interface Step {
  command: string;
  output: string;
  /** The tool refused: its one line went to stderr. */
  refused?: boolean;
  meanwhile?: { by: string; text: string; at: string };
}

/** What Sam sees: a line in their chat with the agent, a message in the room, a notification or a private note. */
export type Seen =
  | { kind: "sam"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "room"; by: string; text: string; aside?: string }
  | { kind: "ping"; text: string; time?: string }
  | { kind: "private"; text: string };

export interface Beat {
  id: string;
  time: string;
  title: string;
  seen: Seen[];
  steps: Step[];
  /** Shown between a waiting command and what it printed. */
  waiting?: string;
  /** Why the tool answered that way, with what we measured. */
  why: string;
  /** A measured figure to set large beside the note, if the beat has one. */
  figure?: { value: string; label: string };
}

export const ROOM = "Design sync";

export const MORNING: Beat[] = [
  {
    id: "today",
    time: "8:58",
    title: "What have I got today?",
    seen: [
      { kind: "sam", text: "What have I got this morning?" },
      { kind: "agent", text: "Just Design sync, with Ana and Kim." },
    ],
    steps: transcripts.today,
    why: claim("The help sorts every command under two headings, what only Sam sees and what other people see, so the agent knows which commands reach other people before it runs one.", {
      source: { test: "registry/ouro/ax/help.test.mts::the overview is the two headings, one line per command, and the exit codes" },
      verify: { testExists: "registry/ouro/ax/help.test.mts::the overview is the two headings, one line per command, and the exit codes" },
    }),
  },
  {
    id: "late",
    time: "9:03",
    title: "Tell Design sync I'm running late.",
    seen: [
      { kind: "sam", text: "Tell Design sync I'm running late." },
      { kind: "room", by: "Sam Lee", text: "Running late, start without me", aside: "Sent by Sam's agent: Sam asked me to tell the room" },
      { kind: "agent", text: "Done: posted in Design sync." },
    ],
    steps: transcripts.late,
    why: claim("The first try was refused in one line that ends with the exact command to run instead. Rules like that one, written from where agents in our runs went wrong, took the same agent from 5 of 10 runs to 10 of 10.", {
      source: [{ test: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" }, { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md" }],
      verify: [
        { testExists: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" },
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md", pattern: "Fixing those two claims took the same agent from 5\\/10 to 10\\/10" },
      ],
    }),
    figure: {
      value: "5 → 10",
      label: claim("of 10 runs", {
        source: { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md" },
        verify: { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md", pattern: "Fixing those two claims took the same agent from 5\\/10 to 10\\/10" },
      }),
    },
  },
  {
    id: "checked",
    time: "9:04",
    title: "Nothing happens, which is the point.",
    seen: [{ kind: "agent", text: "(The agent doesn't open the room to make sure.)" }],
    steps: transcripts.checked,
    why: claim("The tool read its own work back and said so: Checked. When an outcome said its check held, agents in our runs stopped reading the conversation back to be sure, in 0 of 2 runs against 2 of 2 without it.", {
      source: [{ file: "registry/ouro/ax/example-cli.ts" }, { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md" }],
      verify: [
        { fileLine: "registry/ouro/ax/example-cli.ts", pattern: "how: \"read the room's last message back\"" },
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md", pattern: "read-back after edit 2\\/2->0\\/2" },
      ],
    }),
    figure: { value: "2 → 0", label: "runs that checked again" },
  },
  {
    id: "reply",
    time: "9:05",
    title: "Let me know when someone answers.",
    seen: [
      { kind: "sam", text: "Let me know when someone answers." },
      { kind: "room", by: "Ana Ruiz", text: "Sounds good, we'll begin with the dates" },
      { kind: "ping", time: "9:11", text: "Ana answered in Design sync: “Sounds good, we'll begin with the dates”" },
    ],
    steps: transcripts.reply,
    waiting: "The tool waits on the room. The agent makes one call, not a loop.",
    why: claim("Three of the four designs we tried each added a way to wait on a conversation the agent already knew. With it, “tell me when someone replies” went from 1 of 2 runs to 2 of 2, in about half the calls.", {
      source: [{ file: "docs/decisions/2026-10-30-ouro-ax.md" }, { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md" }],
      verify: [
        { fileLine: "docs/decisions/2026-10-30-ouro-ax.md", pattern: "Three of the four probes independently added a way to wait on a conversation" },
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md", pattern: "T5 1\\/2->2\\/2, 8->4\\.5 calls" },
      ],
    }),
    figure: {
      value: "1 → 2",
      label: claim("of 2 runs, in about half the calls", {
        source: { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md" },
        verify: { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md", pattern: "T5 1\\/2->2\\/2, 8->4\\.5 calls" },
      }),
    },
  },
  {
    id: "edit",
    time: "9:20",
    title: "Actually, edit that.",
    seen: [
      { kind: "sam", text: "Actually, edit that." },
      { kind: "agent", text: "A note just for you, or the message everyone in Design sync saw?" },
      { kind: "sam", text: "Just a note for me: ask Ana about the dates." },
      { kind: "private", text: "ask Ana about the dates" },
    ],
    steps: transcripts.edit,
    why: claim("A word that could mean two things does nothing. It answers with both meanings, so the agent asks Sam instead of guessing.", {
      source: [{ test: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" }, { file: "registry/ouro/ax/example-cli.ts" }],
      verify: [
        { testExists: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" },
        { fileLine: "registry/ouro/ax/example-cli.ts", pattern: "\\[\"edit\", \"delete\", \"remove\"\\]" },
      ],
    }),
  },
];
