import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react";
import { commands, runCommand, type Command, type CommandGroup } from "./api/commands";

// A known-good command-palette screen in plain React with a native <dialog>, for the
// scorer's tests (score.test.mjs).

const groups: CommandGroup[] = ["Navigation", "Recipes", "Account"];

export function App() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [last, setLast] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const matches = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  const onShortcut = useEffectEvent(() => show());
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onShortcut();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  function show() {
    if (dialog.current?.open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setOpen(true);
    dialog.current?.showModal();
  }

  function hide() {
    dialog.current?.close();
    setOpen(false);
    returnTo.current?.focus();
  }

  function run(command: Command) {
    hide();
    setLast(command.label);
    void runCommand(command.id);
  }

  function keys(event: KeyboardEvent) {
    if (event.key === "ArrowDown") setActive((index) => Math.min(index + 1, matches.length - 1));
    else if (event.key === "ArrowUp") setActive((index) => Math.max(index - 1, 0));
    else if (event.key === "Enter" && matches[active]) run(matches[active]);
    else return;
    event.preventDefault();
  }

  return (
    <>
      <header className="header">
        <button type="button" className="button" onClick={show}>
          Search commands <kbd>⌘K</kbd>
        </button>
      </header>
      <main className="page">
        <h1>Kitchen</h1>
        {last && <p>Last command: {last}</p>}
        <p className="muted">Your dashboard will live here.</p>
      </main>
      <dialog
        ref={dialog}
        aria-label="Command palette"
        className="dialog palette"
        onCancel={(event) => {
          event.preventDefault();
          hide();
        }}
      >
        {open && (
          <>
            <input
              autoFocus
              role="combobox"
              aria-label="Search commands"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={matches[active] ? `command-${matches[active].id}` : undefined}
              className="input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={keys}
            />
            {matches.length === 0 ? (
              <p>No commands found.</p>
            ) : (
              <div id="command-list" role="listbox" aria-label="Commands">
                {groups.map((group) => {
                  const items = matches.filter((command) => command.group === group);
                  if (items.length === 0) return null;
                  return (
                    <div key={group} role="group" aria-labelledby={`group-${group}`}>
                      <div id={`group-${group}`} className="muted group">
                        {group}
                      </div>
                      {items.map((command) => (
                        <div
                          key={command.id}
                          id={`command-${command.id}`}
                          role="option"
                          aria-selected={matches[active]?.id === command.id}
                          className={matches[active]?.id === command.id ? "option active" : "option"}
                          onClick={() => run(command)}
                        >
                          {command.label}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
