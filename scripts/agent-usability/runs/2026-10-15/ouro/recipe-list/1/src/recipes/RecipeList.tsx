import { useCallback, useEffect, useRef, useState } from "react";
import { archiveRecipe, deleteRecipe, listRecipes, type Recipe } from "@/api/recipes";
import { Item } from "@/components/ouro/item/item";
import { ItemGroup } from "@/components/ouro/item/item-group";
import { Pagination } from "@/components/ouro/pagination/pagination";
import { Skeleton } from "@/components/ouro/skeleton/skeleton";
import { Spinner } from "@/components/ouro/spinner/spinner";
import { SwipeActions } from "@/components/ouro/swipe-actions/swipe-actions";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { Toaster } from "@/components/ouro/toast/toaster";
import { toast } from "@/lib/ouro/toast";

type Removal = "archived" | "deleted";

const remove = { archived: archiveRecipe, deleted: deleteRecipe } as const;

/** The signed-in cook's recipes, one page at a time, with Archive and Delete on every row. */
export function RecipeList() {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | undefined>(undefined);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [recipes, setRecipes] = useState<Recipe[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Only the newest request may update the list.
  const latest = useRef(0);
  // Rows removed here whose archive or delete the server may not have finished yet.
  const removing = useRef(new Set<string>());

  /**
   * Loads `target`. A `page` load shows the page as loading; the `initial` load starts out
   * loading; a `refresh` updates the page in place and keeps it if it fails.
   */
  const load = useCallback((target: number, mode: "page" | "initial" | "refresh") => {
    const request = ++latest.current;
    if (mode === "page") {
      setLoading(true);
      setFailed(false);
    }
    listRecipes(target).then(
      (result) => {
        if (request !== latest.current) return;
        setRecipes(result.recipes.filter((recipe) => !removing.current.has(recipe.id)));
        setPage(result.page);
        setPageCount(result.pageCount);
        setTotal(result.total);
        setLoading(false);
      },
      () => {
        if (request !== latest.current) return;
        setLoading(false);
        if (mode !== "refresh") setFailed(true);
      },
    );
  }, []);

  useEffect(() => {
    load(1, "initial");
  }, [load]);

  const goTo = (target: number) => {
    setPage(target);
    load(target, "page");
  };

  /** Keeps keyboard focus in the list when the row that had it goes away. */
  const keepFocus = (index: number) => {
    const refocus = () => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const buttons = listRef.current?.querySelectorAll<HTMLElement>("[data-ouro-swipe-actions-menu] button");
      if (!buttons || buttons.length === 0) return;
      buttons[Math.min(index, buttons.length - 1)]!.focus();
    };
    requestAnimationFrame(refocus);
    setTimeout(refocus, 400);
  };

  const removeRecipe = (recipe: Recipe, how: Removal) => {
    const index = recipes?.findIndex((row) => row.id === recipe.id) ?? 0;
    removing.current.add(recipe.id);
    setRecipes((rows) => rows?.filter((row) => row.id !== recipe.id));
    setTotal((count) => (count === undefined ? count : count - 1));
    keepFocus(index);
    toast(`${recipe.title} ${how}`);
    remove[how](recipe.id).then(
      () => {
        removing.current.delete(recipe.id);
        // Brings the next recipe up into this page, and the page count up to date.
        load(page, "refresh");
      },
      () => {
        removing.current.delete(recipe.id);
        toast(`${recipe.title} could not be ${how}. Try again.`, { tone: "destructive" });
        load(page, "refresh");
      },
    );
  };

  const showRows = !loading && recipes !== undefined;

  return (
    <main className="mx-auto box-border flex w-full max-w-2xl min-w-0 flex-col gap-4 px-4 py-6 sm:py-10">
      <div className="flex flex-col gap-1">
        <Heading level={1}>My recipes</Heading>
        {total !== undefined && (
          <Text tone="muted" size="sm">
            {total === 1 ? "1 recipe" : `${total} recipes`}
          </Text>
        )}
      </div>

      <div ref={listRef} aria-busy={loading} className="min-w-0">
        {loading && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Spinner label="Loading recipes" size="sm" tone="secondary" />
              <Text tone="muted" size="sm" aria-hidden="true">
                Loading recipes…
              </Text>
            </div>
            <div aria-hidden="true" className="flex flex-col gap-4 py-2">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <Skeleton shape="text" className="w-1/2" />
                  <Skeleton shape="text" className="w-1/4" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && failed && (
          <Text tone="destructive" role="alert">
            Your recipes could not be loaded. Check your connection and try again.
          </Text>
        )}

        {showRows && !failed && (
          <ItemGroup aria-label="Recipes" variant="outline" empty="No recipes on this page.">
            {recipes.map((recipe) => (
              <SwipeActions
                key={recipe.id}
                label={recipe.title}
                fullSwipe={false}
                trailing={[
                  { label: "Archive", tone: "primary", onClick: () => removeRecipe(recipe, "archived") },
                  { label: "Delete", tone: "destructive", onClick: () => removeRecipe(recipe, "deleted") },
                ]}
              >
                <Item
                  title={recipe.title}
                  description={
                    <span className="flex flex-wrap gap-x-2">
                      <span>{recipe.minutes} min</span>
                      <span aria-hidden="true">·</span>
                      <span>Serves {recipe.servings}</span>
                    </span>
                  }
                />
              </SwipeActions>
            ))}
          </ItemGroup>
        )}
      </div>

      {pageCount !== undefined && <Pagination page={page} pageCount={pageCount} onPageChange={goTo} />}

      <Toaster />
    </main>
  );
}
