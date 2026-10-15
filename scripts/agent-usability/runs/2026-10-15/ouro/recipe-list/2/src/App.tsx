import { useCallback, useEffect, useRef, useState } from "react";
import { archiveRecipe, deleteRecipe, listRecipes, type Recipe } from "@/api/recipes";
import { Item } from "@/components/ouro/item/item";
import { ItemGroup } from "@/components/ouro/item/item-group";
import { Pagination } from "@/components/ouro/pagination/pagination";
import { Spinner } from "@/components/ouro/spinner/spinner";
import { Stack } from "@/components/ouro/stack/stack";
import { SwipeActions } from "@/components/ouro/swipe-actions/swipe-actions";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";

type Removal = "archived" | "deleted";

export function App() {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  // Bumped to fetch the current page again, to refill it after a row leaves.
  const [refresh, setRefresh] = useState(0);
  // Rows already removed here: a page fetched before the server caught up must not bring them back.
  const removed = useRef(new Set<string>());
  const listRef = useRef<HTMLDivElement>(null);
  // The row index to move focus to once a removed row's actions button is gone.
  const focusIndex = useRef<number | null>(null);
  // Whether the list is already on screen, so a refill does not blank it.
  const shown = useRef(false);

  useEffect(() => {
    let current = true;
    if (!shown.current) setLoading(true);
    listRecipes(page)
      .then((result) => {
        if (!current) return;
        setRecipes(result.recipes.filter((recipe) => !removed.current.has(recipe.id)));
        setPageCount(result.pageCount);
        if (result.page !== page) setPage(result.page);
        setError(null);
        shown.current = true;
      })
      .catch(() => {
        if (current) setError("Your recipes could not be loaded. Try again in a moment.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, refresh]);

  useEffect(() => {
    const index = focusIndex.current;
    if (index === null) return;
    focusIndex.current = null;
    // Focus was on the menu of the row that left; give it to the row that took its place.
    if (document.activeElement && document.activeElement !== document.body) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-ouro-swipe-actions-menu] button');
    const next = buttons?.[Math.min(index, buttons.length - 1)];
    next?.focus();
  }, [recipes]);

  const goTo = (next: number) => {
    shown.current = false;
    setRecipes([]);
    setPage(next);
  };

  const remove = useCallback((recipe: Recipe, how: Removal) => {
    removed.current.add(recipe.id);
    setRecipes((rows) => {
      focusIndex.current = rows.findIndex((row) => row.id === recipe.id);
      return rows.filter((row) => row.id !== recipe.id);
    });
    setMessage(`${recipe.title} ${how}`);
    const call = how === "archived" ? archiveRecipe : deleteRecipe;
    call(recipe.id)
      .then(() => setRefresh((count) => count + 1))
      .catch(() => {
        removed.current.delete(recipe.id);
        setMessage(`${recipe.title} could not be ${how}. Try again.`);
        setRefresh((count) => count + 1);
      });
  }, []);

  return (
    <main className="mx-auto box-border w-full max-w-2xl px-4 py-8 sm:px-6">
      <Stack gap="lg">
        <Heading level={1}>My recipes</Heading>

        <p role="status" className="m-0 min-h-5 text-sm text-muted-foreground">
          {message}
        </p>

        {loading ? (
          <div className="flex items-center gap-3 py-6">
            <Spinner label="Loading recipes" />
            <Text as="span" tone="muted" aria-hidden="true">
              Loading recipes…
            </Text>
          </div>
        ) : error ? (
          <Text role="alert">{error}</Text>
        ) : (
          <div ref={listRef}>
            <ItemGroup aria-label="Recipes" empty={<Text tone="muted">No recipes on this page.</Text>}>
              {recipes.map((recipe) => (
                <SwipeActions
                  key={recipe.id}
                  label={recipe.title}
                  fullSwipe={false}
                  trailing={[
                    { label: "Archive", onClick: () => remove(recipe, "archived") },
                    { label: "Delete", tone: "destructive", onClick: () => remove(recipe, "deleted") },
                  ]}
                >
                  <Item
                    title={recipe.title}
                    description={
                      <>
                        <span>{recipe.minutes} min</span>
                        <span aria-hidden="true"> · </span>
                        <span>Serves {recipe.servings}</span>
                      </>
                    }
                  />
                </SwipeActions>
              ))}
            </ItemGroup>
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onPageChange={goTo} />
      </Stack>
    </main>
  );
}
