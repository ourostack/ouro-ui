import * as React from "react"
import { BookOpenIcon, CircleAlertIcon } from "lucide-react"

import {
  archiveRecipe,
  deleteRecipe,
  listRecipes,
  pageSize,
  type Recipe,
  type RecipePage,
} from "@/api/recipes"
import { RecipePagination } from "@/components/recipes/recipe-pagination"
import { RecipeRow, RecipeRowSkeleton, type RecipeAction } from "@/components/recipes/recipe-row"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

const actions = {
  archive: { run: archiveRecipe, done: "archived" },
  delete: { run: deleteRecipe, done: "deleted" },
} satisfies Record<RecipeAction, { run: (id: string) => Promise<void>; done: string }>

export function MyRecipes() {
  const [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<RecipePage | null>(null)
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading")
  // Recipes archived or deleted here; hidden at once, before the backend confirms.
  const [removedIds, setRemovedIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const [revealedId, setRevealedId] = React.useState<string | null>(null)
  const latestRequest = React.useRef(0)
  const pageRef = React.useRef(1)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  const load = React.useCallback((target: number, { quiet = false } = {}) => {
    const request = ++latestRequest.current
    pageRef.current = target
    if (!quiet) setStatus("loading")
    listRecipes(target).then(
      (result) => {
        if (request !== latestRequest.current) return
        pageRef.current = result.page
        setPage(result.page)
        setData(result)
        setStatus("ready")
      },
      () => {
        if (request !== latestRequest.current || quiet) return
        setStatus("error")
      }
    )
  }, [])

  React.useEffect(() => {
    // The first page starts out loading, so there is no loading state to set here.
    load(1, { quiet: true })
  }, [load])

  const recipes = data?.recipes.filter((recipe) => !removedIds.has(recipe.id)) ?? []

  function goToPage(target: number) {
    setPage(target)
    setRevealedId(null)
    load(target)
    headingRef.current?.scrollIntoView({ block: "nearest" })
  }

  /** The row is gone, so focus would fall to the page: hand it to a neighbouring row instead. */
  function keepFocus(index: number) {
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected) return
      const triggers = listRef.current?.querySelectorAll<HTMLElement>("[data-recipe-actions]")
      const next = triggers?.[index] ?? triggers?.[index - 1] ?? headingRef.current
      next?.focus()
    })
  }

  function handleAction(recipe: Recipe, action: RecipeAction) {
    const index = recipes.findIndex((item) => item.id === recipe.id)
    setRemovedIds((ids) => new Set(ids).add(recipe.id))
    setRevealedId(null)
    keepFocus(index)

    actions[action].run(recipe.id).then(
      () => {
        toast.add({ title: `${recipe.title} ${actions[action].done}`, type: "success" })
        // Refill the page from the backend so it shows a full page again.
        load(pageRef.current, { quiet: true })
      },
      () => {
        setRemovedIds((ids) => {
          const next = new Set(ids)
          next.delete(recipe.id)
          return next
        })
        toast.add({ title: `Couldn't ${action} ${recipe.title}. Try again.`, type: "error" })
      }
    )
  }

  const loading = status === "loading"

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          My recipes
        </h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} ${data.total === 1 ? "recipe" : "recipes"}. ` : null}
          <span className="pointer-coarse:hidden">Use a recipe's actions button to archive or delete it.</span>
          <span className="hidden pointer-coarse:inline">Swipe a recipe left to archive or delete it.</span>
        </p>
      </header>

      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner role="presentation" aria-hidden="true" />
          Loading recipes…
        </p>
      ) : null}

      {status === "error" ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Couldn't load your recipes</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => load(page)}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {status === "ready" && data?.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No recipes yet</EmptyTitle>
            <EmptyDescription>Recipes you save show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {loading ? (
        <ul aria-hidden="true" className="flex flex-col gap-2">
          {Array.from({ length: pageSize }, (_, index) => (
            <RecipeRowSkeleton key={index} />
          ))}
        </ul>
      ) : status === "ready" && recipes.length > 0 ? (
        <ul ref={listRef} aria-label={`Recipes, page ${page}`} className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              revealed={revealedId === recipe.id}
              onRevealedChange={(revealed) => setRevealedId(revealed ? recipe.id : null)}
              onAction={(action) => handleAction(recipe, action)}
            />
          ))}
        </ul>
      ) : null}

      {data && data.pageCount > 1 ? (
        <RecipePagination page={page} pageCount={data.pageCount} onPageChange={goToPage} />
      ) : null}
    </main>
  )
}
