import * as React from "react"
import { ArchiveIcon, ClockIcon, MoreHorizontalIcon, Trash2Icon, UsersIcon } from "lucide-react"

import {
  archiveRecipe,
  deleteRecipe,
  listRecipes,
  pageSize,
  type Recipe,
} from "@/api/recipes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { RecipePagination } from "@/recipes/recipe-pagination"
import { SwipeRow } from "@/recipes/swipe-row"

type Action = "archive" | "delete"

const actionLabels: Record<Action, { past: string }> = {
  archive: { past: "archived" },
  delete: { past: "deleted" },
}

export function App() {
  const [page, setPage] = React.useState(1)
  const [pageCount, setPageCount] = React.useState(1)
  const [recipes, setRecipes] = React.useState<Recipe[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState("")
  // Recipes removed here whose archive or delete call hasn't finished yet.
  const pending = React.useRef(new Set<string>())
  const latestRequest = React.useRef(0)
  const triggers = React.useRef(new Map<string, HTMLButtonElement>())
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  const load = React.useCallback((target: number, { quiet = false } = {}) => {
    const request = ++latestRequest.current
    if (!quiet) {
      setLoading(true)
      setError(null)
    }
    listRecipes(target).then(
      (result) => {
        if (request !== latestRequest.current) return
        setRecipes(result.recipes.filter((r) => !pending.current.has(r.id)))
        setPage(result.page)
        setPageCount(result.pageCount)
        setError(null)
        setLoading(false)
      },
      () => {
        if (request !== latestRequest.current) return
        setError("Your recipes couldn't be loaded.")
        setLoading(false)
      }
    )
  }, [])

  React.useEffect(() => {
    // `loading` starts out true, so the first load needs no loading state of its own.
    load(1, { quiet: true })
  }, [load])

  function goToPage(target: number) {
    setPage(target)
    load(target)
  }

  function runAction(recipe: Recipe, action: Action) {
    // Keep keyboard focus in the list once this row is gone.
    const index = recipes.findIndex((r) => r.id === recipe.id)
    const next = recipes[index + 1] ?? recipes[index - 1]
    const focused = document.activeElement
    const hadFocus =
      focused?.closest(`[data-recipe-id="${recipe.id}"], [role="menu"]`) != null ||
      focused === document.body

    pending.current.add(recipe.id)
    setRecipes((current) => current.filter((r) => r.id !== recipe.id))
    setMessage(`${recipe.title} ${actionLabels[action].past}`)

    if (hadFocus) {
      // Wait for the menu to close and give up focus first.
      setTimeout(() => {
        const target = next ? triggers.current.get(next.id) : null
        ;(target ?? headingRef.current)?.focus()
      }, 50)
    }

    const call = action === "archive" ? archiveRecipe : deleteRecipe
    call(recipe.id).then(
      () => {
        pending.current.delete(recipe.id)
        // Refill the page from the server so it still shows a full page.
        load(page, { quiet: true })
      },
      () => {
        pending.current.delete(recipe.id)
        setMessage(`${recipe.title} couldn't be ${actionLabels[action].past}`)
        load(page, { quiet: true })
      }
    )
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:py-10">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          My recipes
        </h1>

        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-5 text-sm text-muted-foreground empty:min-h-0"
        >
          {message}
        </div>

        <section aria-labelledby="recipe-list-heading" aria-busy={loading}>
          <h2 id="recipe-list-heading" className="sr-only">
            Page {page} of {pageCount}
          </h2>
          {loading ? (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Loading recipes…</p>
              <ul aria-hidden className="divide-y rounded-xl border">
                {Array.from({ length: pageSize }, (_, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="size-8" />
                  </li>
                ))}
              </ul>
            </div>
          ) : error ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border p-4">
              <p className="text-sm">{error}</p>
              <Button variant="outline" onClick={() => load(page)}>
                Try again
              </Button>
            </div>
          ) : recipes.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              No recipes on this page.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border">
              {recipes.map((recipe) => (
                <li key={recipe.id} data-recipe-id={recipe.id}>
                  <RecipeRow
                    recipe={recipe}
                    onAction={(action) => runAction(recipe, action)}
                    triggerRef={(el) => {
                      if (el) triggers.current.set(recipe.id, el)
                      else triggers.current.delete(recipe.id)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {pageCount > 0 && (
          <RecipePagination page={page} pageCount={pageCount} onPageChange={goToPage} />
        )}
      </main>
    </div>
  )
}

function RecipeRow({
  recipe,
  onAction,
  triggerRef,
}: {
  recipe: Recipe
  onAction: (action: Action) => void
  triggerRef: (el: HTMLButtonElement | null) => void
}) {
  return (
    <SwipeRow
      actions={
        <>
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-primary text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => onAction("archive")}
          >
            <ArchiveIcon className="size-4" aria-hidden />
            Archive
          </button>
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-700 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => onAction("delete")}
          >
            <Trash2Icon className="size-4" aria-hidden />
            Delete
          </button>
        </>
      }
    >
      <div className="flex items-center gap-3 py-3 pr-2 pl-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{recipe.title}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3.5" aria-hidden />
              {recipe.minutes} min
            </span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden />
              Serves {recipe.servings}
            </span>
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                ref={triggerRef}
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${recipe.title}`}
              />
            }
          >
            <MoreHorizontalIcon aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-36">
            <DropdownMenuItem onClick={() => onAction("archive")}>
              <ArchiveIcon aria-hidden />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("delete")}>
              <Trash2Icon aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SwipeRow>
  )
}
