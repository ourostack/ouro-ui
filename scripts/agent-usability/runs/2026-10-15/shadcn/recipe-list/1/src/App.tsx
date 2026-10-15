import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { archiveRecipe, deleteRecipe, listRecipes, pageSize, type Recipe } from "@/api/recipes"
import { RecipeRow, type RecipeAction } from "@/components/recipe-row"
import { Button } from "@/components/ui/button"
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

export function App() {
  const [page, setPage] = React.useState(1)
  const [pageCount, setPageCount] = React.useState<number | null>(null)
  const [recipes, setRecipes] = React.useState<Recipe[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState("")
  const [openRowId, setOpenRowId] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  // Recipes removed here stay hidden even if a refresh races ahead of the backend.
  const removedIds = React.useRef(new Set<string>())
  const actionButtons = React.useRef(new Map<string, HTMLButtonElement>())
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  React.useEffect(() => {
    let cancelled = false
    listRecipes(page)
      .then((result) => {
        if (cancelled) return
        setRecipes(result.recipes.filter((recipe) => !removedIds.current.has(recipe.id)))
        setPageCount(result.pageCount)
        setError(null)
        if (result.page !== page) setPage(result.page)
      })
      .catch(() => {
        if (!cancelled) setError("Your recipes could not be loaded. Try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, reloadKey])

  function goToPage(next: number) {
    if (next === page || loading) return
    setLoading(true)
    setOpenRowId(null)
    setPage(next)
  }

  function handleAction(recipe: Recipe, action: RecipeAction) {
    const index = recipes.findIndex((item) => item.id === recipe.id)
    const neighbour = recipes[index + 1] ?? recipes[index - 1]

    removedIds.current.add(recipe.id)
    setRecipes((current) => current.filter((item) => item.id !== recipe.id))
    setOpenRowId(null)
    setMessage(`${recipe.title} ${action === "archive" ? "archived" : "deleted"}`)

    // The removed row took focus with it; hand it to the next row so keyboard users keep their place.
    setTimeout(() => {
      const target = neighbour ? actionButtons.current.get(neighbour.id) : null
      ;(target ?? headingRef.current)?.focus()
    })

    const request = action === "archive" ? archiveRecipe(recipe.id) : deleteRecipe(recipe.id)
    request
      .then(() => setReloadKey((key) => key + 1))
      .catch(() => {
        removedIds.current.delete(recipe.id)
        setMessage(`${recipe.title} could not be ${action === "archive" ? "archived" : "deleted"}`)
        setReloadKey((key) => key + 1)
      })
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          My recipes
        </h1>
        <p className="text-sm text-muted-foreground">
          Swipe a recipe to the left, or use its actions button, to archive or delete it.
        </p>
      </header>

      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden="true" role="presentation" />
            Loading recipes…
          </div>
          <ul className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: pageSize }, (_, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </li>
            ))}
          </ul>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border p-4 text-sm">
          {error}
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true)
              setReloadKey((key) => key + 1)
            }}
          >
            Try again
          </Button>
        </div>
      ) : recipes.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No recipes on this page.</p>
      ) : (
        <ul aria-label="Recipes" className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              open={openRowId === recipe.id}
              onOpenChange={(open) => setOpenRowId(open ? recipe.id : null)}
              onAction={handleAction}
              actionsButtonRef={(node) => {
                if (node) actionButtons.current.set(recipe.id, node)
                else actionButtons.current.delete(recipe.id)
              }}
            />
          ))}
        </ul>
      )}

      {pageCount !== null && (
        <Pagination aria-label="Pagination" className="mt-2">
          <PaginationContent className="flex-wrap justify-center gap-1">
            <PaginationItem>
              <Button variant="ghost" size="lg" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
                Previous
              </Button>
            </PaginationItem>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
              <PaginationItem key={number}>
                <Button
                  variant={number === page ? "outline" : "ghost"}
                  size="icon-lg"
                  aria-current={number === page ? "page" : undefined}
                  onClick={() => goToPage(number)}
                >
                  {number}
                </Button>
              </PaginationItem>
            ))}
            <PaginationItem>
              <Button variant="ghost" size="lg" disabled={page >= pageCount} onClick={() => goToPage(page + 1)}>
                Next
                <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </main>
  )
}
