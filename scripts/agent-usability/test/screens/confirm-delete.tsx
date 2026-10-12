import { useEffect, useRef, useState } from "react";
import { deleteCookbook, listCookbooks, type Cookbook } from "./api/cookbooks";

// A known-good confirm-delete screen in plain React with a native <dialog>, for the scorer's
// tests (score.test.mjs), which also break copies of it.
export function App() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listCookbooks().then(setCookbooks);
  }, []);

  useEffect(() => {
    if (!target || dialog.current?.open) return;
    dialog.current?.showModal();
    cancel.current?.focus();
  }, [target]);

  function open(cookbook: Cookbook, button: HTMLButtonElement) {
    opener.current = button;
    setError("");
    setTarget(cookbook);
  }

  function close() {
    dialog.current?.close();
    setTarget(null);
    opener.current?.focus();
  }

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    const result = await deleteCookbook(target.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    dialog.current?.close();
    setCookbooks((current) => current?.filter((cookbook) => cookbook.id !== target.id) ?? null);
    setStatus(`${target.name} deleted`);
    setTarget(null);
  }

  return (
    <main className="page">
      <h1>Cookbooks</h1>
      {cookbooks === null ? (
        <p>Loading cookbooks…</p>
      ) : (
        <ul className="list">
          {cookbooks.map((cookbook) => (
            <li key={cookbook.id} className="row">
              <span>
                <strong>{cookbook.name}</strong> <span className="muted">{cookbook.recipeCount} recipes</span>
              </span>
              <button type="button" className="button" onClick={(event) => open(cookbook, event.currentTarget)}>
                Delete {cookbook.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="muted">
        {status}
      </p>
      <dialog
        ref={dialog}
        role="alertdialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) close();
        }}
      >
        {target && (
          <>
            <h2 id="confirm-title">Delete {target.name}?</h2>
            <p id="confirm-body">The cookbook goes away for good. Its recipes stay in your library.</p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="button" ref={cancel} className="button" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button destructive" onClick={confirm} disabled={busy} aria-busy={busy}>
                {busy ? "Deleting…" : "Delete cookbook"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </main>
  );
}
