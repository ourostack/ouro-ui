import { useEffect, useRef, useState } from "react";
import { deleteCookbook, listCookbooks, type Cookbook } from "@/api/cookbooks";
import { Button } from "@/components/ouro/button/button";
import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog";
import { Item } from "@/components/ouro/item/item";
import { ItemGroup } from "@/components/ouro/item/item-group";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";

function recipeCount(count: number): string {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function App() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The cookbook the confirmation is about. It stays set while the dialog animates closed.
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let current = true;
    listCookbooks().then(
      (result) => {
        if (current) setCookbooks(result);
      },
      () => {
        if (current) setLoadError("Your cookbooks couldn't be loaded. Reload the page to try again.");
      },
    );
    return () => {
      current = false;
    };
  }, []);

  const askToDelete = (cookbook: Cookbook) => {
    setTarget(cookbook);
    setDeleteError(null);
    setOpen(true);
  };

  const confirmDelete = async () => {
    if (!target) return;
    setDeleteError(null);
    let result;
    try {
      result = await deleteCookbook(target.id);
    } catch {
      result = { ok: false as const, error: "The cookbook couldn't be deleted. Check your connection and try again." };
    }
    if (!result.ok) {
      setDeleteError(result.error);
      // Rejecting keeps the confirmation open so the cook can read why.
      throw new Error(result.error);
    }
    const { id, name } = target;
    setCookbooks((list) => list?.filter((cookbook) => cookbook.id !== id) ?? null);
    setStatus(`${name} deleted`);
  };

  return (
    <main className="mx-auto box-border w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Heading level={1} ref={headingRef} tabIndex={-1} className="outline-none">
        Cookbooks
      </Heading>

      <div role="status" aria-live="polite" aria-atomic="true" className="mt-2 min-h-5">
        {status && (
          <Text size="sm" tone="success">
            {status}
          </Text>
        )}
      </div>

      {loadError ? (
        <Text role="alert" tone="destructive" className="mt-4">
          {loadError}
        </Text>
      ) : cookbooks === null ? (
        <Text tone="muted" className="mt-4">
          Loading cookbooks…
        </Text>
      ) : (
        <ItemGroup aria-label="Your cookbooks" empty={<Text tone="muted">You have no cookbooks.</Text>} className="mt-4">
          {cookbooks.map((cookbook) => (
            <Item
              key={cookbook.id}
              title={cookbook.name}
              description={recipeCount(cookbook.recipeCount)}
              actions={
                <Button
                  variant="outline"
                  tone="destructive"
                  aria-label={`Delete ${cookbook.name}`}
                  onClick={() => askToDelete(cookbook)}
                >
                  Delete
                </Button>
              }
            />
          ))}
        </ItemGroup>
      )}

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={target ? `Delete ${target.name}?` : "Delete cookbook?"}
        description={
          <>
            The cookbook is deleted for good. Its recipes stay in your library.
            <Text as="span" role="alert" size="sm" tone="destructive" className="mt-2 block empty:hidden">
              {deleteError}
            </Text>
          </>
        }
        confirmLabel="Delete cookbook"
        tone="destructive"
        onConfirm={confirmDelete}
        finalFocus={headingRef}
      />
    </main>
  );
}
