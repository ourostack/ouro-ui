import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { run, sorted, START, suggestions, type KitchenState, type Reply } from "./reins-kitchen";

/*
 * The pretend kitchen's terminal: type `ls` or `do <action> [json]`, or press a line it suggests, and read the reply
 * Reins would give. The log is its own scrolling box, so a reply never moves the page; a short status line says what
 * happened out loud, rather than reading the JSON.
 */

interface Entry {
  id: number;
  line: string;
  reply: Reply;
}

const OPENING: Entry = { id: 0, line: "ls", reply: run(START, "ls").reply };

/** A reply in a few words, for the status line a screen reader hears. */
export function spoken(reply: Reply): string {
  if (!reply.ok) return `Refused, exit 2: ${reply.error.message}`;
  if ("help" in reply) return "Help: ls, do, and one JSON reply per line.";
  return `Now on ${reply.screen.focus}, with ${reply.screen.actions.length} actions: ${reply.screen.actions.map((action) => action.name).join(", ")}.`;
}

/** JSON that keeps short objects and arrays on one line, so a screen fits the log without scrolling. */
export function compact(value: unknown, indent = ""): string {
  const flat = JSON.stringify(value);
  if (flat === undefined) return "null";
  if (flat.length <= 64 || value === null || typeof value !== "object") return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) return `[\n${value.map((item) => inner + compact(item, inner)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => `${inner}${JSON.stringify(key)}: ${compact(item, inner)}`);
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

function Shown({ reply, raw }: { reply: Reply; raw: boolean }): JSX.Element {
  if (raw) return <pre className="reins-json">{JSON.stringify(sorted(reply))}</pre>;
  if ("help" in reply) return <pre className="reins-json">{reply.help.join("\n")}</pre>;
  if (!reply.ok) {
    return (
      <div className="reins-refusal">
        <p className="reins-exit">
          exit {reply.error.exit} · {reply.error.code}
        </p>
        <p>{reply.error.message}</p>
      </div>
    );
  }
  const { screen } = reply;
  return (
    <div className="reins-screen">
      <p className="reins-focus">
        focus <strong>{screen.focus}</strong> <span className="reins-path">{screen.path.join(" › ")}</span>
      </p>
      <pre className="reins-json">{compact(screen.state)}</pre>
      <p className="reins-actions">
        actions{" "}
        {screen.actions.map((action) => (
          <span key={`${action.from}.${action.name}`} className="reins-action" title={action.title}>
            {action.name}
            <span className="reins-from"> from {action.from}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

export function ReinsTerminal(): JSX.Element {
  const [state, setState] = useState<KitchenState>(START);
  const [entries, setEntries] = useState<Entry[]>([OPENING]);
  const [draft, setDraft] = useState("");
  const [raw, setRaw] = useState(false);
  const [status, setStatus] = useState("");
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);
  const back = useRef(0);
  const next = useRef(1);

  /** Says `text` in the status line, clearing it first so the same words twice are spoken twice. */
  const say = (text: string) => {
    setStatus("");
    requestAnimationFrame(() => setStatus(text));
  };

  const send = (line: string) => {
    const text = line.trim();
    if (!text) return;
    const { state: after, reply } = run(state, text);
    setState(after);
    setEntries((was) => [...was.slice(-11), { id: next.current++, line: text, reply }]);
    say(spoken(reply));
    history.current.push(text);
    back.current = 0;
    setDraft("");
  };

  // The newest reply scrolls into view inside the log, never the page.
  useEffect(() => {
    const element = log.current;
    if (element && entries.length > 1) element.scrollTop = element.scrollHeight;
  }, [entries]);

  /** A chip runs its line, then hands focus to the log, since the chip itself may be gone from the new screen. */
  const runChip = (line: string) => {
    send(line);
    log.current?.focus({ preventScroll: true });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  return (
    <div className="reins-terminal" data-reins-terminal>
      <div className="reins-bar">
        <p className="reins-title site-mono">
          spoonjoy-reins <span className="reins-title-note">a pretend kitchen, running in your browser</span>
        </p>
        <Switch label="Raw reply lines" checked={raw} onCheckedChange={setRaw} />
      </div>
      <ol ref={log} className="reins-log site-mono" aria-label="Replies" tabIndex={0}>
        {entries.map((entry) => (
          <li key={entry.id} className="reins-entry" data-ok={entry.reply.ok ? "" : undefined}>
            <p className="reins-line">
              <span aria-hidden="true" className="reins-prompt">
                ${" "}
              </span>
              {entry.line}
            </p>
            <Shown reply={entry.reply} raw={raw} />
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      <form className="reins-form" onSubmit={submit}>
        <span aria-hidden="true" className="reins-prompt site-mono">
          $
        </span>
        <input
          ref={input}
          className="reins-input site-mono"
          aria-label="Command"
          value={draft}
          placeholder="ls, or do goBack"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && draft) {
              event.preventDefault();
              setDraft("");
              back.current = 0;
              return;
            }
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            const past = history.current;
            if (!past.length) return;
            event.preventDefault();
            back.current = Math.min(Math.max(back.current + (event.key === "ArrowUp" ? 1 : -1), 0), past.length);
            setDraft(back.current ? past[past.length - back.current]! : "");
          }}
        />
        <Button type="submit" size="sm">
          Run
        </Button>
      </form>
      <div className="reins-try">
        <p className="apple-twin-label" id="reins-try-label">
          Or press one. These are exactly what <code className="apple-code">ls</code> offers right now:
        </p>
        <ul className="reins-chips" aria-labelledby="reins-try-label">
          {suggestions(state).map((line) => (
            <li key={line}>
              <button type="button" className="reins-chip site-mono" title={line} onClick={() => runChip(line)}>
                {/* The input is filled in for you; the chip shows only that there is one, and the log shows it in full. */}
                {line.replace(/ \{.*$/, "")}
                {line.includes(" {") ? <span className="reins-from" aria-hidden="true"> {"{…}"}</span> : null}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="reins-chip reins-chip-mischief site-mono" onClick={() => runChip(state.stack.length || state.cook ? "do teleport" : "do goBack")}>
              {state.stack.length || state.cook ? "do teleport" : "do goBack"}
              <span className="reins-from"> (it'll refuse)</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="reins-chip site-mono"
              onClick={() => {
                setState(START);
                setEntries([{ ...OPENING, id: next.current++ }]);
                say("Back to the Kitchen, fresh.");
                log.current?.focus({ preventScroll: true });
              }}
            >
              reset
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
