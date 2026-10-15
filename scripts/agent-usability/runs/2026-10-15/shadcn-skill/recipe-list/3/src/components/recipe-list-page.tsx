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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

const actions = {
  archive: { run: archiveRecipe, done: "archived", failed: "archive" },
  delete: { run: deleteRecipe, done: "deleted", failed: "delete" },
} satisfies Record<RecipeAction, unknown>

export function RecipeListPage() {
  const [page, setPage] = React.useState(1)
  const [result, setResult] = React.useState<RecipePage | null>(null)
  // Bumped after an archive or delete, to refill the page from the server.
  const [refresh, setRefresh] = React.useState(0)
  // Rows taken off the list before the server has caught up.
  const [removed, setRemoved] = React.useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = React.useState<{ id: number; text: string } | null>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const focusRowIndex = React.useRef<number | null>(null)

  React.useEffect(() => {
    let ignore = false
    listRecipes(page).then((data) => {
      if (ignore) return
      setResult(data)
      // The server clamps pages that no longer exist.
      if (data.page !== page) setPage(data.page)
    })
    return () => {
      ignore = true
    }
  }, [page, refresh])

  const loading = result?.page !== page
  const recipes = result?.recipes.filter((recipe) => !removed.has(recipe.id)) ?? []

  // After a row goes away, keep keyboard focus in the list.
  React.useEffect(() => {
    const index = focusRowIndex.current
    if (index === null || loading) return
    focusRowIndex.current = null
    const triggers = listRef.current?.querySelectorAll<HTMLButtonElement>(
      "button[aria-haspopup]"
    )
    if (!triggers?.length) return
    triggers[Math.min(index, triggers.length - 1)]?.focus()
  })

  // Hide the message a while after it was shown.
  React.useEffect(() => {
    if (!message) return
    const timeout = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(timeout)
  }, [message])

  function announce(text: string) {
    setMessage((current) => ({ id: (current?.id ?? 0) + 1, text }))
  }

  function handleAction(recipe: Recipe, action: RecipeAction) {
    const { run, done, failed } = actions[action]
    // The row's menu or swipe actions had focus; it moves to the next row.
    const hadFocus = document.activeElement && document.activeElement !== document.body
    focusRowIndex.current = hadFocus ? recipes.indexOf(recipe) : null

    setRemoved((current) => new Set(current).add(recipe.id))
    run(recipe.id).then(
      () => {
        announce(`${recipe.title} ${done}`)
        setRefresh((count) => count + 1)
      },
      () => {
        setRemoved((current) => {
          const next = new Set(current)
          next.delete(recipe.id)
          return next
        })
        announce(`Couldn't ${failed} ${recipe.title}. Try again.`)
      }
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My recipes</h1>
        <p className="text-sm text-muted-foreground">
          Swipe a recipe to the left, or use its actions menu, to archive or delete it.
        </p>
      </header>

      <section aria-labelledby="recipes-heading" aria-busy={loading} className="flex flex-col gap-4">
        <h2 id="recipes-heading" className="sr-only">
          Recipes
        </h2>
        {loading ? (
          <>
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner role="presentation" aria-label={undefined} aria-hidden="true" />
              Loading recipes…
            </div>
            <ul className="flex flex-col gap-2" aria-hidden="true">
              {Array.from({ length: pageSize }, (_, index) => (
                <li key={index} className="flex flex-col gap-2 rounded-lg border px-3 py-2.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/4" />
                </li>
              ))}
            </ul>
          </>
        ) : recipes.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpenIcon />
              </EmptyMedia>
              <EmptyTitle>No recipes here</EmptyTitle>
              <EmptyDescription>Recipes you save will show up in this list.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul ref={listRef} className="flex flex-col gap-2">
            {recipes.map((recipe) => (
              <RecipeRow key={recipe.id} recipe={recipe} onAction={handleAction} />
            ))}
          </ul>
        )}
      </section>

      {result && (
        <RecipePagination
          page={page}
          pageCount={result.pageCount}
          onPageChange={setPage}
        />
      )}

      <div
        role="status"
        className="pointer-events-none fixed inset-x-4 bottom-4 flex justify-center"
      >
        {message && (
          <p
            key={message.id}
            className="max-w-sm rounded-lg border bg-popover px-4 py-3 text-sm font-medium text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
          >
            {message.text}
          </p>
        )}
      </div>
    </main>
  )
}
