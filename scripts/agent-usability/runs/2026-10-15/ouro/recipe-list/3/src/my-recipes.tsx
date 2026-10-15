import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { archiveRecipe, deleteRecipe, listRecipes, pageSize, type Recipe } from "@/api/recipes";
import { Item } from "@/components/ouro/item/item";
import { ItemGroup } from "@/components/ouro/item/item-group";
import { Pagination } from "@/components/ouro/pagination/pagination";
import { Skeleton } from "@/components/ouro/skeleton/skeleton";
import { Spinner } from "@/components/ouro/spinner/spinner";
import { SwipeActions } from "@/components/ouro/swipe-actions/swipe-actions";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { useMediaQuery } from "@/lib/ouro/use-media-query";

type Action = "archive" | "delete";

const actions = {
  archive: { run: archiveRecipe, done: "archived", failed: "Couldn't archive" },
  delete: { run: deleteRecipe, done: "deleted", failed: "Couldn't delete" },
} as const;

function RecipeDetails({ recipe }: { recipe: Recipe }): JSX.Element {
  return (
    <>
      <span>{recipe.minutes} min</span>
      <span aria-hidden="true"> · </span>
      <span>Serves {recipe.servings}</span>
    </>
  );
}

function LoadingRows(): JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Spinner size="sm" label="Loading recipes" />
        <Text tone="muted" aria-hidden="true">
          Loading recipes…
        </Text>
      </div>
      <div aria-hidden="true" className="flex flex-col">
        {Array.from({ length: pageSize }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
            <Skeleton shape="text" className="w-2/3" />
            <Skeleton shape="text" className="w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The cook's recipes, one page at a time, with Archive and Delete on a swipe or the row's actions menu. */
export function MyRecipes(): JSX.Element {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | undefined>(undefined);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  // Recipes being archived or deleted: hidden at once, even from a page fetched before the server finished.
  const [removing, setRemoving] = useState<ReadonlySet<string>>(() => new Set());
  const latestRequest = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const narrow = useMediaQuery("(max-width: 639px)", false);

  /** Fetches `target`; `quiet` keeps the current rows on screen, for a refresh after an action. */
  const load = useCallback((target: number, quiet = false) => {
    const request = ++latestRequest.current;
    if (!quiet) setLoading(true);
    listRecipes(target).then(
      (answer) => {
        if (request !== latestRequest.current) return;
        setRecipes(answer.recipes);
        setPage(answer.page);
        setPageCount(answer.pageCount);
        setLoading(false);
      },
      () => {
        if (request !== latestRequest.current) return;
        setLoading(false);
        setMessage("Couldn't load your recipes. Try again.");
      },
    );
  }, []);

  useEffect(() => {
    load(1, true);
  }, [load]);

  const goTo = (target: number) => {
    setPage(target);
    load(target);
  };

  /** After a row leaves, focus that was on its actions goes to the next row's, or the heading. */
  const keepFocus = (index: number) => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const buttons = listRef.current?.querySelectorAll<HTMLElement>("[data-ouro-swipe-actions-menu] button");
      const next = buttons?.[Math.min(index, buttons.length - 1)];
      (next ?? headingRef.current)?.focus();
    }, 0);
  };

  const act = (recipe: Recipe, action: Action, index: number) => {
    const { run, done, failed } = actions[action];
    setRemoving((current) => new Set(current).add(recipe.id));
    setMessage(`${recipe.title} ${done}`);
    keepFocus(index);
    run(recipe.id).then(
      () => {
        setRecipes((current) => current.filter((row) => row.id !== recipe.id));
        setRemoving((current) => {
          const next = new Set(current);
          next.delete(recipe.id);
          return next;
        });
        // Brings the page back to 10 rows, and the page count up to date.
        load(page, true);
      },
      () => {
        setRemoving((current) => {
          const next = new Set(current);
          next.delete(recipe.id);
          return next;
        });
        setMessage(`${failed} ${recipe.title}. Try again.`);
      },
    );
  };

  const shown = recipes.filter((recipe) => !removing.has(recipe.id));

  return (
    <main className="mx-auto box-border flex w-full max-w-2xl min-w-0 flex-col gap-4 px-4 py-8">
      <title>My recipes</title>
      <Heading level={1} ref={headingRef} tabIndex={-1}>
        My recipes
      </Heading>
      <Text size="sm" tone="muted" role="status" aria-live="polite" aria-atomic="true" className="min-h-5">
        {message}
      </Text>
      <div ref={listRef} className="min-w-0">
        {loading ? (
          <LoadingRows />
        ) : (
          <ItemGroup aria-label="Recipes" empty="No recipes on this page.">
            {shown.map((recipe, index) => (
              <SwipeActions
                key={recipe.id}
                label={recipe.title}
                fullSwipe={false}
                trailing={[
                  { label: "Archive", onClick: () => act(recipe, "archive", index) },
                  { label: "Delete", tone: "destructive", onClick: () => act(recipe, "delete", index) },
                ]}
              >
                <Item title={recipe.title} description={<RecipeDetails recipe={recipe} />} />
              </SwipeActions>
            ))}
          </ItemGroup>
        )}
      </div>
      {pageCount !== undefined && (
        <Pagination page={page} pageCount={pageCount} siblings={narrow ? 0 : 1} onPageChange={goTo} className="mt-2" />
      )}
    </main>
  );
}
