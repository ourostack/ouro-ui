import { useEffect, useRef, useState } from "react"
import { BookOpenIcon, Trash2Icon } from "lucide-react"

import { deleteCookbook, listCookbooks, type Cookbook } from "@/api/cookbooks"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

function recipeCount(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`
}

export function CookbooksPage() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")

  // The cookbook the confirmation is about. Kept after closing so the
  // dialog's text doesn't vanish while it animates out.
  const [target, setTarget] = useState<Cookbook | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const pendingRef = useRef(false)
  const deletedRef = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    document.title = "Cookbooks"
    let cancelled = false
    listCookbooks().then(
      (result) => {
        if (!cancelled) setCookbooks(result)
      },
      () => {
        if (!cancelled) setLoadError("We couldn't load your cookbooks. Refresh the page to try again.")
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  function openConfirmation(cookbook: Cookbook) {
    deletedRef.current = false
    setDeleteError(null)
    setTarget(cookbook)
    setOpen(true)
  }

  function handleOpenChange(next: boolean) {
    // Don't let the dialog close while the delete request is in flight.
    if (!next && pendingRef.current) return
    setOpen(next)
  }

  async function handleDelete() {
    if (!target || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setDeleteError(null)
    try {
      const result = await deleteCookbook(target.id)
      if (result.ok) {
        deletedRef.current = true
        setCookbooks((current) => current?.filter((cookbook) => cookbook.id !== target.id) ?? null)
        setAnnouncement(`${target.name} deleted`)
        pendingRef.current = false
        setOpen(false)
      } else {
        setDeleteError(result.error)
      }
    } catch {
      setDeleteError("Something went wrong and the cookbook wasn't deleted. Try again.")
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">
          Cookbooks
        </h1>
        <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {announcement}
        </div>
      </header>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Cookbooks didn't load</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : cookbooks === null ? (
        <div className="flex flex-col gap-4">
          <span className="sr-only">Loading cookbooks</span>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : cookbooks.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No cookbooks</EmptyTitle>
            <EmptyDescription>Your recipes are still in your library.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup>
          {cookbooks.map((cookbook) => (
            <Item key={cookbook.id} role="listitem" variant="outline">
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full">
                  <span className="truncate">{cookbook.name}</span>
                </ItemTitle>
                <ItemDescription>{recipeCount(cookbook.recipeCount)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button variant="outline" onClick={() => openConfirmation(cookbook)}>
                  <Trash2Icon data-icon="inline-start" />
                  Delete<span className="sr-only"> {cookbook.name}</span>
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <AlertDialog
        open={open}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen) {
            setTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent
          initialFocus={cancelRef}
          finalFocus={() => (deletedRef.current ? headingRef.current : true)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cookbook. Its {target ? recipeCount(target.recipeCount) : "recipes"} stay in
              your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertTitle>The cookbook wasn't deleted</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
              focusableWhenDisabled
              aria-busy={pending}
            >
              {pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
              Delete cookbook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
