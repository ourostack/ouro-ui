import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react"

import { archiveRecipe, deleteRecipe, listRecipes, pageSize, type Recipe } from "@/api/recipes"
import { RecipeRow, type RecipeAction } from "@/components/recipe-row"
import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"

/** Page numbers to show, with `null` standing for a gap. */
function visiblePages(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const pages = new Set([1, count, current - 1, current, current + 1])
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p))
  if (current >= count - 2) [count - 3, count - 2, count - 1].forEach((p) => pages.add(p))
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b)
  const result: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(null)
    result.push(p)
  })
  return result
}

export function App() {
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set())
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  const requestId = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const messageTimer = useRef<number | undefined>(undefined)

  // Callers that want the loading state set it before calling.
  const fetchPage = useCallback(async (target: number) => {
    const id = ++requestId.current
    try {
      const result = await listRecipes(target)
      if (id !== requestId.current) return
      setRecipes(result.recipes)
      setPageCount(result.pageCount)
      setPage(result.page)
      setError(false)
    } catch {
      if (id === requestId.current) setError(true)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPage(page)
  }, [page, fetchPage])

  useEffect(() => () => window.clearTimeout(messageTimer.current), [])

  // Keep keyboard focus in the list after the focused row goes away.
  useEffect(() => {
    if (focusIndex === null) return
    const frame = requestAnimationFrame(() => {
      const triggers = listRef.current?.querySelectorAll<HTMLElement>("[data-row-actions]")
      const target = triggers?.[Math.min(focusIndex, triggers.length - 1)] ?? headingRef.current
      target?.focus()
      setFocusIndex(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusIndex])

  function announce(text: string) {
    window.clearTimeout(messageTimer.current)
    setMessage(text)
    messageTimer.current = window.setTimeout(() => setMessage(""), 8000)
  }

  const shown = recipes.filter((recipe) => !removing.has(recipe.id))

  async function runAction(recipe: Recipe, action: RecipeAction) {
    const index = shown.findIndex((r) => r.id === recipe.id)
    setRemoving((prev) => new Set(prev).add(recipe.id))
    setRevealedId((id) => (id === recipe.id ? null : id))
    setFocusIndex(Math.max(0, index))
    try {
      await (action === "archive" ? archiveRecipe(recipe.id) : deleteRecipe(recipe.id))
      announce(`${recipe.title} ${action === "archive" ? "archived" : "deleted"}`)
      // Refill the page from the server so it stays at a full page of recipes.
      await fetchPage(page)
    } catch {
      announce(`Couldn't ${action} ${recipe.title}. Try again.`)
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev)
        next.delete(recipe.id)
        return next
      })
    }
  }

  function goTo(target: number) {
    if (target === page || target < 1 || target > pageCount) return
    setRevealedId(null)
    setLoading(true)
    setError(false)
    setPage(target)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:py-10">
      <header className="flex items-baseline justify-between gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          My recipes
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        {loading ? (
          <div aria-busy="true" className="overflow-hidden rounded-xl border bg-card">
            <p role="status" className="flex items-center gap-2 border-b px-4 py-3 text-sm text-muted-foreground">
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
              Loading recipes…
            </p>
            <ul aria-hidden="true">
              {Array.from({ length: pageSize }, (_, i) => (
                <li key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                  <Skeleton className="size-8" />
                </li>
              ))}
            </ul>
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4">
            <p>Your recipes couldn't be loaded.</p>
            <Button variant="outline" onClick={() => {
                setLoading(true)
                setError(false)
                void fetchPage(page)
              }}>
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
            No recipes here yet.
          </p>
        ) : (
          <ul ref={listRef} className="overflow-hidden rounded-xl border bg-card">
            {shown.map((recipe) => (
              <RecipeRow
                key={recipe.id}
                recipe={recipe}
                revealed={revealedId === recipe.id}
                onRevealedChange={(revealed) => setRevealedId(revealed ? recipe.id : null)}
                onAction={(r, action) => void runAction(r, action)}
              />
            ))}
          </ul>
        )}

        <Pagination aria-label="Pagination">
          <PaginationContent className="flex-wrap justify-center gap-1">
            <PaginationItem>
              <Button variant="ghost" disabled={page <= 1} onClick={() => goTo(page - 1)} className="pl-1.5">
                <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
                <span className="sr-only sm:not-sr-only">Previous</span>
              </Button>
            </PaginationItem>
            {visiblePages(page, pageCount).map((p, i) =>
              p === null ? (
                <PaginationItem key={`gap-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <Button
                    variant={p === page ? "outline" : "ghost"}
                    size="icon"
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? "page" : undefined}
                    onClick={() => goTo(p)}
                  >
                    {p}
                  </Button>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <Button variant="ghost" disabled={page >= pageCount} onClick={() => goTo(page + 1)} className="pr-1.5">
                <span className="sr-only sm:not-sr-only">Next</span>
                <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

      <div
        role="status"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm justify-center"
      >
        {message && (
          <p className="rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg">
            {message}
          </p>
        )}
      </div>
    </main>
  )
}
