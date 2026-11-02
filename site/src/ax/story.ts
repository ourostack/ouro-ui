import { claim } from "@/registry/ouro/lib/ouro/claims";
import { cast, castAll } from "./cast";
import rawTranscripts from "./transcripts.json";

/*
 * "A morning with an agent": the person asks their agent for a few things, and the page shows each one twice, as they see it
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

/** What the person sees: a line in their chat with their agent, a message in the room or a private note. */
export type Seen =
  | { kind: "person"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "room"; by: string; text: string; aside?: string }
  | { kind: "private"; text: string }
  /** Nothing new on the person's screen, said in the screen's own quiet voice. */
  | { kind: "quiet"; text: string };

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

/** The duo drawing (art/morning-with-an-agent.svg), in plain words. */
export const MORNING_ART_ALT =
  "A person and their agent at a desk on a sunny morning. The person, in an amber cap with a satchel, holds a coffee; the agent, a small robot with a visor and an antenna, sends the person's note from its terminal to a room of three people.";

/** 9:03 on the person's screen: the ask, the room as it now reads, and the agent's reply. The hero and the home page show it too. */
export const LATE_SEEN: Seen[] = [
  { kind: "person", text: "Tell Design sync I'm running late." },
  { kind: "agent", text: cast("Posted in Design sync on your word. {replier} and {other} can see it.") },
  { kind: "room", by: "You", text: "Running late, start without me", aside: "Sent by your agent, on your word" },
];

/** Each command and what the kit printed, with the cast's names filled in. */
export const TRANSCRIPTS = castAll(rawTranscripts);

export const MORNING: Beat[] = [
  {
    id: "today",
    time: "8:58",
    title: "What can you do in Design sync?",
    seen: [
      { kind: "person", text: "What can you do in Design sync?" },
      { kind: "agent", text: cast("Post there for you, where {replier} and {other} will see it. Keep notes only you see. Tell you when someone answers.") },
    ],
    steps: TRANSCRIPTS.today,
    why: claim("The help sorts every command under two headings, what only the person sees and what other people see, so the agent knows which commands reach other people before it runs one.", {
      source: { test: "registry/ouro/ax/help.test.mts::the overview is the two headings, one line per command, and the exit codes" },
      verify: { testExists: "registry/ouro/ax/help.test.mts::the overview is the two headings, one line per command, and the exit codes" },
    }),
  },
  {
    id: "late",
    time: "9:03",
    title: "Tell Design sync I'm running late.",
    seen: LATE_SEEN,
    steps: TRANSCRIPTS.late,
    why: claim("The message goes in as an argument, not piped in. That is one of two rules we wrote from where agents in our runs went wrong, and together they took the same agent from 5 of 10 runs to 10 of 10. The refusal that names its fix already held before them, and agents recovered from it.", {
      source: [{ evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md" }, { test: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" }],
      verify: [
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md", pattern: "Standard 0\\.2 adds them as `cli\\.text-as-argument` and `cli\\.wait-on-refs`" },
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md", pattern: "Fixing those two claims took the same agent from 5\\/10 to 10\\/10" },
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-probe.md", pattern: "recovered from one-line errors that name the fix" },
        { testExists: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" },
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
    seen: [{ kind: "quiet", text: "Nothing new, and nothing to check." }],
    steps: TRANSCRIPTS.checked,
    why: claim("The tool read its own work back and said so: Checked. When the tool said it had checked its own work, agents in our runs stopped reading the conversation back to be sure, in 0 of 2 runs against 2 of 2 without it.", {
      source: [{ file: "registry/ouro/ax/example-cli.ts" }, { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md" }],
      verify: [
        { fileLine: "registry/ouro/ax/example-cli.ts", pattern: "how: \"read the room's last message back\"" },
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md", pattern: "read-back after edit 2\\/2->0\\/2" },
      ],
    }),
    figure: {
      value: "2 → 0",
      label: claim("of 2 runs read the room again after Checked", {
        source: { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md" },
        verify: { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md", pattern: "read-back after edit 2\\/2->0\\/2" },
      }),
    },
  },
  {
    id: "reply",
    time: "9:05",
    title: "Tell me when someone answers.",
    seen: [
      { kind: "person", text: "Tell me when someone answers." },
      { kind: "agent", text: cast("{replier.full} answered in Design sync at 9:11: “Sounds good, we'll begin with the dates”") },
      { kind: "room", by: cast("{replier.full}"), text: "Sounds good, we'll begin with the dates" },
    ],
    steps: TRANSCRIPTS.reply,
    waiting: "The tool waits on the room: one call, not a loop.",
    why: claim("Three of the four designs we tried each added a way to wait on the conversation the agent had just posted in. With it, “tell me when someone replies” went from 1 of 2 runs to 2 of 2, in about half the calls.", {
      source: [{ file: "docs/decisions/2026-10-30-ouro-ax.md" }, { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md" }],
      verify: [
        { fileLine: "docs/decisions/2026-10-30-ouro-ax.md", pattern: "Three of the four probes independently added a way to wait on a conversation" },
        { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/outcomes-probe.md", pattern: "T5 1\\/2->2\\/2, 8->4\\.5 calls" },
      ],
    }),
    figure: {
      value: "1 → 2",
      label: claim("of 2 runs, in about half the calls (8 → 4.5 calls)", {
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
      { kind: "person", text: cast("Actually, edit that: ask {replier} about the dates.") },
      { kind: "agent", text: "Edit the message everyone in Design sync saw, or keep a note only you see?" },
      { kind: "person", text: "A note, just for me." },
      { kind: "private", text: cast("ask {replier} about the dates") },
    ],
    steps: TRANSCRIPTS.edit,
    why: claim("A word that could mean two things does nothing. It answers with both meanings, so the agent asks its person instead of guessing.", {
      source: [{ test: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" }, { file: "registry/ouro/ax/example-cli.ts" }],
      verify: [
        { testExists: "registry/ouro/ax/command.test.mts::every refusal names the exact command to run instead" },
        { fileLine: "registry/ouro/ax/example-cli.ts", pattern: "\\[\"edit\", \"delete\", \"remove\"\\]" },
      ],
    }),
  },
];
