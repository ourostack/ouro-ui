import { Fragment, useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { resetRooms, rooms } from "@/registry/ouro/ax/example-cli";
import { CommandLine, OutputLine, Terminal } from "./parts";
import { cast, CAST } from "./cast";
import { runNotes, say } from "./run";

/** What the visitor can try with one press, in plain words, and the command each one runs. */
export const TRIES = ([
  { label: "Ask for help", command: "notes --help" },
  { label: "List the rooms", command: "notes rooms" },
  { label: "Post without a reason", command: 'notes post abc123 "Back soon"' },
  { label: "Preview it", command: 'notes post abc123 "Back soon" --why "{person} asked me to say so" --dry-run' },
  { label: "Post it", command: 'notes post abc123 "Back soon" --why "{person} asked me to say so"' },
  { label: "Wait for a reply", command: "notes watch abc123 --timeout 2m" },
  { label: "Say “edit”", command: "notes edit abc123" },
  { label: "Add a private note", command: 'notes note abc123 "ask {replier} about the dates"' },
  { label: "Misspell a flag", command: "notes rooms --limt 3" },
  { label: "Preview it as JSON", command: 'notes post abc123 "Back soon" --why "{person} asked me to say so" --dry-run --json' },
] as const).map((tryIt) => ({ label: tryIt.label, command: cast(tryIt.command) }));

const REPLIES = [
  { by: CAST.replier.full, text: "Got it, thanks for the heads-up" },
  { by: CAST.other.full, text: "Same here, I'll join late too" },
  { by: CAST.replier.full, text: "Dates first, then the banner" },
];

type Entry = { kind: "command"; text: string } | { kind: "line"; text: string; refused: boolean };

/**
 * "Your turn": the kit's example tool, running in this page. The visitor types or presses a command as the agent;
 * on the left, the room the person shares changes with it, and a press of "Reply as someone in the room" is someone
 * answering, which ends a wait the agent started.
 */
export default function Playground(): JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [seenUpTo, setSeenUpTo] = useState(0);
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  const replies = useRef(0);
  const log = useRef<HTMLPreElement>(null);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries, busy]);

  async function run(command: string) {
    if (busy || !command.trim()) return;
    setSeenUpTo(entries.length);
    setEntries((list) => [...list, { kind: "command", text: command.trim() }]);
    setLine("");
    setBusy(command.trim());
    const ran = await runNotes(command);
    setEntries((list) => [...list, ...ran.printed.map((p): Entry => ({ kind: "line", text: p.text, refused: p.stream === "stderr" }))]);
    setBusy(null);
    refresh();
  }

  function reply() {
    const next = REPLIES[replies.current % REPLIES.length]!;
    replies.current += 1;
    say("abc123", next.by, next.text);
    refresh();
  }

  function startOver() {
    if (busy) return;
    resetRooms();
    replies.current = 0;
    setEntries([]);
    setSeenUpTo(0);
    refresh();
  }

  const room = rooms["abc123"];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(line);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="ax-screen" role="group" aria-label={cast("Design sync, the room {person} shares")}>
        <span className="ax-card-head" aria-hidden="true">
          {cast("Design sync, the room {person} shares")}
        </span>
        <p className="m-0 text-sm text-muted-foreground">{[CAST.person.full, CAST.replier.full, CAST.other.full].join(", ")}</p>
        <ul aria-label="Messages" className="m-0 grid list-none gap-2 p-0" data-testid="ax-room">
          {room && room.messages.length > 0 ? (
            room.messages.map((message) => (
              <li key={message.cursor} className="ax-card">
                <span>
                  <strong className="font-semibold">{message.by === "you" ? CAST.person.full : message.by}</strong> {message.summary}
                </span>
                {message.by === "you" && <span className="text-sm text-muted-foreground">{cast("Sent by {person}'s agent")}</span>}
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">Quiet so far.</li>
          )}
        </ul>
        {room && room.notes.length > 0 && (
          <div className="ax-card" data-testid="ax-notes">
            <span className="ax-card-head">{cast("{person}'s notes, only {person} sees them")}</span>
            <ul className="m-0 grid list-none gap-1 p-0">
              {room.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" tone="secondary" onClick={reply}>
            Reply as someone in the room
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 content-start gap-4">
        <Terminal label={cast("What {agent} sees")}>
          <pre ref={log} role="log" aria-label={cast("What {agent} sees")} tabIndex={0} className="ax-term-body ax-term-log overflow-y-auto">
            {entries.length === 0 && <span className="ax-term-line ax-term-out">Type a command below, or press one of the tries.</span>}
            {entries.map((entry, index) => {
              const fresh = index >= seenUpTo;
              if (entry.kind === "command")
                return (
                  <Fragment key={index}>
                    {index > 0 && <span className="ax-term-gap" aria-hidden="true" />}
                    <CommandLine command={entry.text} fresh={fresh} />
                  </Fragment>
                );
              return <OutputLine key={index} text={entry.text} refused={entry.refused} fresh={fresh} />;
            })}
            {busy && /(^|\s)watch\s/.test(busy) && (
              <span className="ax-term-line ax-term-aside">
                Waiting inside the tool. Reply as someone in the room to end it. <span className="ax-term-cursor" aria-hidden="true" />
              </span>
            )}
          </pre>
        </Terminal>
        <form onSubmit={submit} className="flex items-end gap-2">
          <TextField
            label={cast("Run a command as {agent}")}
            value={line}
            onChange={(event) => setLine(event.currentTarget.value)}
            startAdornment="$"
            placeholder="notes rooms"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy !== null}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={busy !== null}>
            Run
          </Button>
        </form>
        <div className="grid gap-2">
          <p className="m-0 text-sm text-muted-foreground">Or press one:</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {TRIES.map((tryIt) => (
              <li key={tryIt.label}>
                <Button size="sm" variant="outline" tone="secondary" disabled={busy !== null} onClick={() => void run(tryIt.command)}>
                  {tryIt.label}
                </Button>
              </li>
            ))}
            <li>
              <Button size="sm" variant="plain" tone="secondary" disabled={busy !== null} onClick={startOver}>
                Start over
              </Button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
