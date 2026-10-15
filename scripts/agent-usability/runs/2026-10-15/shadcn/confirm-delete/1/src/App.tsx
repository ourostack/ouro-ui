import { useEffect, useRef, useState } from "react";
import { Loader2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { deleteCookbook, listCookbooks, type Cookbook } from "@/api/cookbooks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";

function recipeCount(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function App() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // The cookbook the dialog is about. Kept after closing so the closing animation still has its text.
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pendingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const deletedRef = useRef(false);

  useEffect(() => {
    let active = true;
    listCookbooks().then(
      (result) => {
        if (active) setCookbooks(result);
      },
      () => {
        if (active) setLoadError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  function openDialog(cookbook: Cookbook, opener: HTMLElement) {
    openerRef.current = opener;
    deletedRef.current = false;
    setTarget(cookbook);
    setDeleteError(null);
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    // Keep the dialog open while the delete request runs.
    if (!nextOpen && pendingRef.current) return;
    setOpen(nextOpen);
  }

  async function handleDelete() {
    if (!target || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setDeleteError(null);
    try {
      const result = await deleteCookbook(target.id);
      if (result.ok) {
        deletedRef.current = true;
        setOpen(false);
        setCookbooks((current) => current?.filter((cookbook) => cookbook.id !== target.id) ?? current);
        setAnnouncement(`${target.name} deleted`);
      } else {
        setDeleteError(result.error);
      }
    } catch {
      setDeleteError("Something went wrong and the cookbook wasn't deleted. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold tracking-tight outline-none">
        Cookbooks
      </h1>

      <p role="status" className="text-sm empty:hidden">
        {announcement}
      </p>

      {loadError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>Your cookbooks couldn't be loaded. Refresh the page to try again.</AlertDescription>
        </Alert>
      ) : cookbooks === null ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading cookbooks">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : cookbooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no cookbooks.</p>
      ) : (
        <ItemGroup className="gap-3">
          {cookbooks.map((cookbook) => (
            <Item key={cookbook.id} role="listitem" variant="outline" className="flex-nowrap">
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full truncate text-base">{cookbook.name}</ItemTitle>
                <ItemDescription>{recipeCount(cookbook.recipeCount)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button variant="outline" onClick={(event) => openDialog(cookbook, event.currentTarget)}>
                  <Trash2Icon aria-hidden="true" />
                  Delete<span className="sr-only"> {cookbook.name}</span>
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent
          initialFocus={cancelRef}
          finalFocus={() => (deletedRef.current ? headingRef.current : openerRef.current)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cookbook and can't be undone. Its{" "}
              {target ? recipeCount(target.recipeCount) : "recipes"} stay in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
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
              {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              Delete cookbook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
