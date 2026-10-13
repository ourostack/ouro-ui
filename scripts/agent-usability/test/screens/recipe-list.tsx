import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { archiveRecipe, deleteRecipe, listRecipes, type Recipe, type RecipePage } from "./api/recipes";

// A known-good recipe-list screen in plain React (swipe rows, an actions menu, pagination),
// for the scorer's tests (score.test.mjs).

type Act = (recipe: Recipe, action: "archive" | "delete") => void;

function ActionsMenu({ recipe, act }: { recipe: Recipe; act: Act }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [open]);

  function keys(event: KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") items[(index + 1) % items.length]?.focus();
    else if (event.key === "ArrowUp") items[(index - 1 + items.length) % items.length]?.focus();
    else if (event.key === "Escape") {
      setOpen(false);
      button.current?.focus();
    } else return;
    event.preventDefault();
  }

  return (
    <div className="menu-anchor">
      <button
        ref={button}
        type="button"
        className="button"
        aria-label={`Actions for ${recipe.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={`Actions for ${recipe.title}`} className="menu" onKeyDown={keys}>
          {(["archive", "delete"] as const).map((action) => (
            <button key={action} type="button" role="menuitem" tabIndex={-1} className="menu-item" onClick={() => act(recipe, action)}>
              {action === "archive" ? "Archive" : "Delete"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ recipe, act }: { recipe: Recipe; act: Act }) {
  const [revealed, setRevealed] = useState(false);
  const start = useRef<number | null>(null);

  const down = (event: PointerEvent) => {
    if (event.pointerType === "touch") start.current = event.clientX;
  };
  const up = (event: PointerEvent) => {
    if (start.current === null) return;
    const moved = event.clientX - start.current;
    start.current = null;
    if (moved < -60) setRevealed(true);
    else if (moved > 40) setRevealed(false);
  };

  return (
    <li className="swipe-row">
      <div className="swipe-actions" aria-hidden={!revealed}>
        <button type="button" className="button" tabIndex={revealed ? 0 : -1} onClick={() => act(recipe, "archive")}>
          Archive
        </button>
        <button type="button" className="button destructive" tabIndex={revealed ? 0 : -1} onClick={() => act(recipe, "delete")}>
          Delete
        </button>
      </div>
      <div className={revealed ? "swipe-content revealed" : "swipe-content"} onPointerDown={down} onPointerUp={up} onPointerCancel={() => (start.current = null)}>
        <span>
          <strong>{recipe.title}</strong>
          <span className="muted">
            {" "}
            {recipe.minutes} min · Serves {recipe.servings}
          </span>
        </span>
        <ActionsMenu recipe={recipe} act={act} />
      </div>
    </li>
  );
}

export function App() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecipePage | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let current = true;
    listRecipes(page).then((result) => current && setData(result));
    return () => {
      current = false;
    };
  }, [page]);

  const act: Act = (recipe, action) => {
    setData((current) => current && { ...current, recipes: current.recipes.filter((candidate) => candidate.id !== recipe.id) });
    setStatus(`${recipe.title} ${action === "archive" ? "archived" : "deleted"}`);
    void (action === "archive" ? archiveRecipe(recipe.id) : deleteRecipe(recipe.id));
  };

  return (
    <main className="page">
      <h1>My recipes</h1>
      {!data || data.page !== page ? (
        <p>Loading recipes…</p>
      ) : (
        <ul className="list">
          {data.recipes.map((recipe) => (
            <Row key={recipe.id} recipe={recipe} act={act} />
          ))}
        </ul>
      )}
      <nav aria-label="Pagination" className="pagination">
        <button type="button" className="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        {Array.from({ length: data?.pageCount ?? 1 }, (_, index) => index + 1).map((number) => (
          <button key={number} type="button" className="button" aria-current={number === page ? "page" : undefined} onClick={() => setPage(number)}>
            {number}
          </button>
        ))}
        <button type="button" className="button" disabled={page >= (data?.pageCount ?? 1)} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </nav>
      <p role="status" className="muted">
        {status}
      </p>
    </main>
  );
}
