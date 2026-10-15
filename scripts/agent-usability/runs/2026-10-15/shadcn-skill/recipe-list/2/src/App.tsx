import * as React from "react"
import { BookOpenIcon } from "lucide-react"

import {
  archiveRecipe,
  deleteRecipe,
  listRecipes,
  pageSize,
  type Recipe,
  type RecipePage,
} from "@/api/recipes"
import { RecipePagination } from "@/components/recipe-pagination"
import { RecipeRow, type RecipeAction } from "@/components/recipe-row"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Toaster, toast } from "@/components/ui/toast"
import { useInstantThemeChange } from "@/hooks/use-instant-theme-change"

export function App() {
  useInstantThemeChange()

  return (
    <Toaster>
      <RecipesScreen />
    </Toaster>
  )
}

const pastTense: Record<RecipeAction, string> = {
  archive: "archived",
  delete: "deleted",
}

function RecipesScreen() {
  const [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<RecipePage | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  // Recipes archived or deleted here, kept out of later pages until the server agrees.
  const removed = React.useRef(new Set<string>())
  const requestId = React.useRef(0)
  const pageRef = React.useRef(1)
  const loadingRef = React.useRef(true)
  const focusIndex = React.useRef<number | null>(null)

  const load = React.useCallback(async (target: number, silent: boolean) => {
    const id = ++requestId.current
    pageRef.current = target
    if (!silent) {
      loadingRef.current = true
      setLoading(true)
    }
    try {
      const result = await listRecipes(target)
      if (id !== requestId.current) return
      pageRef.current = result.page
      setPage(result.page)
      setData({
        ...result,
        recipes: result.recipes.filter((recipe) => !removed.current.has(recipe.id)),
      })
      setError(false)
    } catch {
      if (id === requestId.current) setError(true)
    } finally {
      if (id === requestId.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [])

  React.useEffect(() => {
    // The first page is already shown as loading, so this load can be silent.
    void load(1, true)
  }, [load])

  // After a row goes away, keep keyboard focus in the list instead of losing it.
  React.useEffect(() => {
    if (focusIndex.current === null || loading) return
    const index = focusIndex.current
    focusIndex.current = null
    const timer = window.setTimeout(() => {
      const active = document.activeElement
      if (active && active !== document.body && document.contains(active)) return
      const triggers = listRef.current?.querySelectorAll<HTMLElement>("[data-recipe-actions]")
      const next = triggers?.[Math.min(index, triggers.length - 1)]
      ;(next ?? headingRef.current)?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [data, loading])

  function goToPage(target: number) {
    setPage(target)
    void load(target, false)
  }

  async function handleAction(recipe: Recipe, action: RecipeAction) {
    const index = data?.recipes.findIndex((item) => item.id === recipe.id) ?? -1
    const remaining = (data?.recipes.length ?? 0) - 1
    removed.current.add(recipe.id)
    focusIndex.current = Math.max(0, index)
    setData((current) =>
      current && {
        ...current,
        recipes: current.recipes.filter((item) => item.id !== recipe.id),
        total: current.total - 1,
      }
    )
    try {
      await (action === "archive" ? archiveRecipe(recipe.id) : deleteRecipe(recipe.id))
      toast.add({ title: `${recipe.title} ${pastTense[action]}` })
    } catch {
      removed.current.delete(recipe.id)
      toast.add({ title: `Couldn't ${action} ${recipe.title}. Try again.`, type: "error" })
    }
    // Refill the page from the server, unless the cook has already moved to another page.
    if (!loadingRef.current) void load(pageRef.current, remaining > 0)
  }

  const total = data?.total ?? 0
  const pageCount = data?.pageCount ?? 1
  // A page emptied by archiving waits for the server to refill it.
  const showLoading = loading || (data !== null && data.recipes.length === 0 && total > 0)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          My recipes
        </h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${total} ${total === 1 ? "recipe" : "recipes"}` : " "}
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load your recipes</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => goToPage(page)}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      )}

      <section aria-labelledby="recipes-heading" aria-busy={showLoading} className="flex flex-col gap-4">
        <h2 id="recipes-heading" className="sr-only">
          Recipes, page {page} of {pageCount}
        </h2>
        {showLoading ? (
          <>
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner aria-hidden="true" role="presentation" />
              Loading recipes…
            </p>
            <ul aria-hidden="true" className="flex flex-col gap-2">
              {Array.from({ length: pageSize }, (_, index) => (
                <li key={index} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                  <Skeleton className="size-8" />
                </li>
              ))}
            </ul>
          </>
        ) : data && data.recipes.length > 0 ? (
          <ul ref={listRef} className="flex flex-col gap-2">
            {data.recipes.map((recipe) => (
              <RecipeRow key={recipe.id} recipe={recipe} onAction={handleAction} />
            ))}
          </ul>
        ) : data ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpenIcon />
              </EmptyMedia>
              <EmptyTitle>No recipes yet</EmptyTitle>
              <EmptyDescription>Recipes you save will show up here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </section>

      {data && (
        <RecipePagination page={page} pageCount={pageCount} onPageChange={goToPage} />
      )}
    </main>
  )
}
