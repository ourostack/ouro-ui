import { useEffect, useRef, useState } from "react";
import { BookOpenIcon, CircleAlertIcon, Trash2Icon } from "lucide-react";

import { deleteCookbook, listCookbooks, type Cookbook } from "@/api/cookbooks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

function recipeCountLabel(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function App() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const pendingRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

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

  function openConfirm(cookbook: Cookbook, opener: HTMLElement) {
    openerRef.current = opener;
    setTarget(cookbook);
    setDeleteError(null);
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    // Keep the dialog up while the request runs so its outcome is never lost.
    if (!nextOpen && pendingRef.current) return;
    setOpen(nextOpen);
  }

  async function confirmDelete() {
    if (!target || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setDeleteError(null);
    try {
      const result = await deleteCookbook(target.id);
      if (result.ok) {
        setCookbooks((current) => current?.filter((cookbook) => cookbook.id !== target.id) ?? current);
        setAnnouncement(`${target.name} deleted`);
        pendingRef.current = false;
        setOpen(false);
      } else {
        setDeleteError(result.error);
      }
    } catch {
      setDeleteError("Something went wrong. Check your connection and try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function finalFocus() {
    const opener = openerRef.current;
    if (opener?.isConnected) return opener;
    return headingRef.current;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold tracking-tight outline-none">
          Cookbooks
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Collections of recipes from your library.</p>
      </header>

      <p
        role="status"
        className={announcement ? "mb-4 rounded-lg border bg-muted/50 px-3 py-2 text-sm" : "sr-only"}
      >
        {announcement}
      </p>

      {loadError ? (
        <Alert variant="destructive" className="*:data-[slot=alert-description]:text-destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Couldn’t load your cookbooks</AlertTitle>
          <AlertDescription>Refresh the page to try again.</AlertDescription>
        </Alert>
      ) : cookbooks === null ? (
        <div aria-busy="true" aria-label="Loading cookbooks" className="grid gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-18 w-full rounded-xl" />
          ))}
        </div>
      ) : cookbooks.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          You don’t have any cookbooks yet.
        </p>
      ) : (
        <ul className="grid gap-3">
          {cookbooks.map((cookbook) => (
            <li
              key={cookbook.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <BookOpenIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium">{cookbook.name}</h2>
                <p className="text-sm text-muted-foreground">{recipeCountLabel(cookbook.recipeCount)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${cookbook.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={(event) => openConfirm(cookbook, event.currentTarget)}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>{target ? `Delete ${target.name}?` : "Delete cookbook?"}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cookbook. Its recipes stay in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <Alert variant="destructive" className="*:data-[slot=alert-description]:text-destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Couldn’t delete the cookbook</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40 dark:bg-red-700 dark:hover:bg-red-700/90"
              aria-busy={pending}
              disabled={pending}
              focusableWhenDisabled
              onClick={confirmDelete}
            >
              {pending && <Spinner aria-hidden="true" />}
              Delete cookbook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
