import { Fragment, useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import morningSource from "./art/morning-with-an-agent.svg?raw";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { resetRooms, rooms } from "@/registry/ouro/ax/example-cli";
import { CommandLine, OutputLine, SeenItem, Terminal } from "./parts";
import { cast, CAST } from "./cast";
import { ASKS, asksDone, EGGS, eggFor, heardFrom, progressOf, type Egg, type Heard } from "./asks";
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
  { by: CAST.replier.full, text: "Sounds good, we'll begin with the dates" },
  { by: CAST.other.full, text: "Morning! Coffee first, then the banner" },
  { by: CAST.replier.full, text: "Got it, thanks" },
];

/** The duo drawing again, cropped to the desk, for the end of the three asks (the same module the page's band uses). */
const DESK_ART = morningSource
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<title>[\s\S]*?<\/title>/, "")
  .replace(/viewBox="[^"]*"/, 'viewBox="300 80 600 360"')
  .replace("<svg ", '<svg aria-hidden="true" focusable="false" ');

const isWait = (command: string) => /(^|\s)watch(\s|$)/.test(command);

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
  const [heard, setHeard] = useState<Heard | null>(null);
  const [egg, setEgg] = useState<Egg | null>(null);
  const [, setVersion] = useState(0);
  const replies = useRef(0);
  const eggsShown = useRef(new Set<Egg>());
  // A wait still running when the visitor starts over finishes in the background; its result belongs to the old run.
  const generation = useRef(0);
  const log = useRef<HTMLPreElement>(null);
  const messages = useRef<HTMLUListElement>(null);
  const replyButton = useRef<HTMLButtonElement>(null);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries, busy]);

  const room = rooms["abc123"];
  const progress = progressOf(room, heard);
  const done = asksDone(progress);

  useEffect(() => {
    const element = messages.current;
    if (element) element.scrollTop = element.scrollHeight;
  });

  async function run(command: string) {
    if (busy || !command.trim()) return;
    const mine = generation.current;
    setSeenUpTo(entries.length);
    setEntries((list) => [...list, { kind: "command", text: command.trim() }]);
    setLine("");
    setBusy(command.trim());
    // The only way a wait ends here is someone in the room answering, so the keyboard goes there.
    if (isWait(command)) replyButton.current?.focus();
    const ran = await runNotes(command);
    if (mine !== generation.current) return;
    setEntries((list) => [...list, ...ran.printed.map((p): Entry => ({ kind: "line", text: p.text, refused: p.stream === "stderr" }))]);
    const reply = heardFrom(ran);
    if (reply) setHeard(reply);
    const found = eggFor(ran);
    if (found && !eggsShown.current.has(found)) {
      eggsShown.current.add(found);
      setEgg(found);
    }
    setBusy(null);
    refresh();
  }

  function reply() {
    const next = REPLIES[replies.current % REPLIES.length]!;
    replies.current += 1;
    say("abc123", next.by, next.text);
    refresh();
  }

  /** Starts again, ending any wait: the wait's result, when it comes, is dropped. */
  function startOver() {
    generation.current += 1;
    resetRooms();
    replies.current = 0;
    setEntries([]);
    setSeenUpTo(0);
    setBusy(null);
    setHeard(null);
    setEgg(null);
    refresh();
  }

  const asks = ASKS.slice(0, Math.min(done + 1, ASKS.length));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(line);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid min-w-0 content-start gap-4">
      <div className="ax-screen" role="group" aria-label={cast("What {person} asks you")} data-testid="ax-asks" data-asks-done={done}>
        <span className="ax-card-head" aria-hidden="true">
          {cast("What {person} asks you")} <span className="site-mono normal-case">· {done} of {ASKS.length}</span>
        </span>
        <div aria-live="polite" className="grid gap-3">
          {asks.map((ask, index) => (
            <Fragment key={ask.ask}>
              <SeenItem item={{ kind: "person", text: ask.ask }} fresh={index > 0} />
              {index < done && (
                <>
                  <SeenItem item={{ kind: "agent", text: ask.answer(progress) }} fresh />
                  <SeenItem item={{ kind: "person", text: ask.thanks }} fresh />
                </>
              )}
            </Fragment>
          ))}
        </div>
        {done === ASKS.length && <div className="ax-reward ax-new" aria-hidden="true" dangerouslySetInnerHTML={{ __html: DESK_ART }} />}
      </div>
      <div className="ax-screen" role="group" aria-label={cast("Design sync, the room {person} shares")}>
        <span className="ax-card-head" aria-hidden="true">
          {cast("Design sync, the room {person} shares")}
        </span>
        <p className="m-0 text-sm text-muted-foreground">{[CAST.person.full, CAST.replier.full, CAST.other.full].join(", ")}</p>
        <div className="flex flex-wrap gap-3">
          <Button ref={replyButton} variant="outline" tone="secondary" onClick={reply}>
            Reply as someone in the room
          </Button>
        </div>
        <ul ref={messages} aria-label="Messages" aria-live={busy && isWait(busy) ? "off" : "polite"} className="ax-room m-0 grid list-none gap-2 p-0" data-testid="ax-room">
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
      </div>
      </div>
      <div className="grid min-w-0 content-start gap-4">
        <Terminal label={cast("What {agent} sees")}>
          <pre ref={log} role="log" aria-label={cast("What {agent} sees")} tabIndex={0} className="ax-term-body ax-term-log overflow-y-auto">
            {entries.length === 0 && <span className="ax-term-line ax-term-aside">{cast("{person}'s waiting. Type a command, or press one below.")}</span>}
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
            {busy && isWait(busy) && (
              <span className="ax-term-line ax-term-aside">
                Waiting inside the tool. Reply as someone in the room to end it, or start over. <span className="ax-term-cursor" aria-hidden="true" />
              </span>
            )}
          </pre>
        </Terminal>
        <p className="ax-egg m-0" aria-live="polite" data-testid="ax-egg">
          {egg && EGGS[egg]}
        </p>
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
            readOnly={busy !== null}
            className="min-w-0 flex-1"
          />
          <Button type="submit" aria-disabled={busy !== null}>
            Run
          </Button>
        </form>
        <div className="grid gap-2">
          <p className="m-0 text-sm text-muted-foreground">Or press one:</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {TRIES.map((tryIt) => (
              <li key={tryIt.label}>
                <Button size="sm" variant="outline" tone="secondary" aria-disabled={busy !== null} onClick={() => void run(tryIt.command)}>
                  {tryIt.label}
                </Button>
              </li>
            ))}
            <li>
              <Button size="sm" variant="plain" tone="secondary" onClick={startOver}>
                Start over
              </Button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
