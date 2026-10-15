import { useEffect, useRef, useState } from "react";
import { BookOpenIcon, CircleAlertIcon, CircleCheckIcon, Trash2Icon } from "lucide-react";
import { cn } from "cn";

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
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

function recipeCount(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function CookbooksPage() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

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
    // Keep the dialog open while the delete request is in flight.
    if (!next && pendingRef.current) return;
    setOpen(next);
  }

  async function handleDelete() {
    if (!target || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await deleteCookbook(target.id);
      if (result.ok) {
        setCookbooks((current) => current?.filter((cookbook) => cookbook.id !== target.id) ?? null);
        setStatus(`${target.name} deleted`);
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

  return (
    <main className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">
          Cookbooks
        </h1>
        <p className="text-sm text-muted-foreground">Group your recipes into collections.</p>
      </header>

      <Alert role="status" aria-live="polite" className={cn(!status && "sr-only")}>
        {status && <CircleCheckIcon aria-hidden="true" />}
        {status && <AlertTitle>{status}</AlertTitle>}
      </Alert>

      {cookbooks === null ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading cookbooks">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : cookbooks.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No cookbooks</EmptyTitle>
            <EmptyDescription>Your recipes are still in your library.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup aria-label="Your cookbooks">
          {cookbooks.map((cookbook) => (
            <Item key={cookbook.id} role="listitem" variant="outline">
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full">
                  <h2 className="truncate">{cookbook.name}</h2>
                </ItemTitle>
                <ItemDescription>{recipeCount(cookbook.recipeCount)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button variant="outline" onClick={(event) => openConfirm(cookbook, event.currentTarget)}>
                  <Trash2Icon data-icon="inline-start" aria-hidden="true" />
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
          finalFocus={() => (triggerRef.current?.isConnected ? triggerRef.current : headingRef.current)}
        >
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cookbook. The {target ? recipeCount(target.recipeCount) : "recipes"} in it
              stay in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Couldn't delete this cookbook</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
              {pending && <Spinner data-icon="inline-start" role="presentation" aria-hidden="true" />}
              Delete cookbook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
