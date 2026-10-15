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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

function recipeCount(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function CookbooksPage() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [status, setStatus] = useState("");

  // The cookbook the confirmation is about. Kept after closing so the closing animation still shows its name.
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef(false);
  const deletedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    let active = true;
    listCookbooks().then((result) => {
      if (active) setCookbooks(result);
    });
    return () => {
      active = false;
    };
  }, []);

  function openConfirmation(cookbook: Cookbook) {
    deletedRef.current = false;
    setTarget(cookbook);
    setError(null);
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    // The request can't be taken back, so the dialog stays until it answers.
    if (!nextOpen && pendingRef.current) return;
    setOpen(nextOpen);
  }

  async function confirmDelete() {
    if (!target || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await deleteCookbook(target.id);
      if (result.ok) {
        deletedRef.current = true;
        setCookbooks((current) => current?.filter((cookbook) => cookbook.id !== target.id) ?? null);
        setStatus(`${target.name} deleted`);
        setOpen(false);
      } else {
        setError(result.error);
      }
    } catch {
      setError("The cookbook couldn't be deleted. Check your connection and try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function finalFocus() {
    if (deletedRef.current) return headingRef.current;
    return (target && triggerRefs.current.get(target.id)) ?? true;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">
          Cookbooks
        </h1>
        <p className="text-sm text-muted-foreground">Collections of recipes from your library.</p>
      </header>

      <p role="status" className="text-sm">
        {status}
      </p>

      {cookbooks === null ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <span className="sr-only">Loading cookbooks</span>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14 w-full" />
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
        <ItemGroup aria-label="Cookbooks">
          {cookbooks.map((cookbook) => (
            <Item key={cookbook.id} role="listitem" variant="outline">
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full">
                  <span className="truncate">{cookbook.name}</span>
                </ItemTitle>
                <ItemDescription>{recipeCount(cookbook.recipeCount)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  ref={(element) => {
                    if (element) triggerRefs.current.set(cookbook.id, element);
                    else triggerRefs.current.delete(cookbook.id);
                  }}
                  variant="outline"
                  onClick={() => openConfirmation(cookbook)}
                >
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
          if (!isOpen) setTarget(null);
        }}
      >
        <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the cookbook permanently. Its {target ? recipeCount(target.recipeCount) : "recipes"} stay in
              your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>The cookbook wasn't deleted</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              focusableWhenDisabled
              aria-busy={pending}
              onClick={confirmDelete}
            >
              {pending && <Spinner data-icon="inline-start" aria-hidden="true" role={undefined} />}
              Delete cookbook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
