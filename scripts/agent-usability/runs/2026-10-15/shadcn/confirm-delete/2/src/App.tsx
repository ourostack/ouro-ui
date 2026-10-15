import { useEffect, useRef, useState } from "react";
import { BookOpenIcon, Trash2Icon } from "lucide-react";

import { type Cookbook, deleteCookbook, listCookbooks } from "@/api/cookbooks";
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
import { Spinner } from "@/components/ui/spinner";

function recipeCountLabel(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function App() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const pendingRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    listCookbooks().then((result) => {
      if (active) setCookbooks(result);
    });
    return () => {
      active = false;
    };
  }, []);

  function openConfirm(cookbook: Cookbook, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setTarget(cookbook);
    setError(null);
    setOpen(true);
  }

  function handleOpenChange(next: boolean) {
    // Keep the dialog up while the request runs, so the outcome is visible.
    if (!next && pendingRef.current) return;
    setOpen(next);
  }

  async function confirmDelete() {
    if (!target || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await deleteCookbook(target.id);
      if (result.ok) {
        setCookbooks((current) => current?.filter((cookbook) => cookbook.id !== target.id) ?? current);
        setAnnouncement(`${target.name} deleted`);
        pendingRef.current = false;
        setOpen(false);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function finalFocus() {
    const trigger = triggerRef.current;
    if (trigger && trigger.isConnected) return trigger;
    return headingRef.current;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold tracking-tight outline-none">
        Cookbooks
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Group your recipes into collections.</p>

      <p role="status" className="mt-4 text-sm font-medium empty:hidden">
        {announcement}
      </p>

      {cookbooks === null ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner role="presentation" aria-hidden="true" /> Loading cookbooks…
        </p>
      ) : cookbooks.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          You don't have any cookbooks.
        </p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-card text-card-foreground">
          {cookbooks.map((cookbook) => (
            <li key={cookbook.id} className="flex items-center gap-3 p-4">
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
                variant="outline"
                size="icon"
                aria-label={`Delete ${cookbook.name}`}
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
            <AlertDialogTitle>Delete {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cookbook. Its recipes stay in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert className="border-destructive/40 text-[color-mix(in_oklch,var(--destructive)_80%,var(--foreground))]">
              <AlertTitle>Couldn't delete the cookbook</AlertTitle>
              <AlertDescription className="text-inherit">{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="bg-[color-mix(in_oklch,var(--destructive)_85%,black)] text-white hover:bg-[color-mix(in_oklch,var(--destructive)_75%,black)] dark:bg-destructive dark:text-black dark:hover:bg-[color-mix(in_oklch,var(--destructive)_85%,white)]"
              disabled={pending}
              focusableWhenDisabled
              aria-busy={pending}
              onClick={confirmDelete}
            >
              {pending && <Spinner role="presentation" aria-hidden="true" />}
              Delete cookbook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
