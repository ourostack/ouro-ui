import { useEffect, useRef, useState } from "react";
import { currentUser, signOut } from "./api/session";

// A known-good app-shell screen in plain React, for the scorer's tests (score.test.mjs).

const pages = [
  { name: "Home", hash: "#/" },
  { name: "Recipes", hash: "#/recipes" },
  { name: "Cookbooks", hash: "#/cookbooks" },
  { name: "Shopping list", hash: "#/shopping-list" },
  { name: "Settings", hash: "#/settings" },
];

const fromHash = () => pages.find((page) => page.hash === window.location.hash) ?? pages[0]!;

export function App() {
  const [current, setCurrent] = useState(fromHash);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const follow = () => setCurrent(fromHash());
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);

  return (
    <div className="shell">
      <a href="#content" className="skip" onClick={(event) => {
        event.preventDefault();
        document.getElementById("content")?.focus();
      }}>
        Skip to content
      </a>
      <header className="topbar">
        <button ref={menuButton} type="button" className="button" aria-expanded={open} onClick={() => setOpen(true)}>
          Open navigation
        </button>
      </header>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <nav aria-label="Main" className={open ? "sidebar open" : "sidebar"}>
        <ul className="list">
          {pages.map((page) => (
            <li key={page.hash}>
              <a href={page.hash} className="nav-link" aria-current={page === current ? "page" : undefined} onClick={() => setOpen(false)}>
                {page.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="account">
          <p>
            {currentUser.name}
            <br />
            <span className="muted">{currentUser.email}</span>
          </p>
          <button type="button" className="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </nav>
      <main id="content" tabIndex={-1} className="page">
        <h1>{current.name}</h1>
        <p>Nothing here yet.</p>
      </main>
    </div>
  );
}
