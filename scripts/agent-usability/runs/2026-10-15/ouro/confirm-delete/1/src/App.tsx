import { useEffect, useRef, useState } from "react";
import { deleteCookbook, listCookbooks, type Cookbook } from "@/api/cookbooks";
import { Alert } from "@/components/ouro/alert/alert";
import { Button } from "@/components/ouro/button/button";
import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog";
import { Item } from "@/components/ouro/item/item";
import { ItemGroup } from "@/components/ouro/item/item-group";
import { Stack } from "@/components/ouro/stack/stack";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";

function recipeCount(count: number): string {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function App() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The cookbook being confirmed. Kept after the dialog closes so its title doesn't
  // change while the dialog animates out.
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let current = true;
    listCookbooks().then(
      (list) => {
        if (current) setCookbooks(list);
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
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!target) return;
    setDeleteError(null);
    const result = await deleteCookbook(target.id);
    if (!result.ok) {
      setDeleteError(result.error);
      // Rejecting keeps the confirmation open.
      throw new Error(result.error);
    }
    setCookbooks((list) => list?.filter((cookbook) => cookbook.id !== target.id) ?? null);
    setStatus(`${target.name} deleted`);
  };

  return (
    <main className="mx-auto box-border w-full max-w-2xl px-4 py-8 sm:px-6">
      <Stack gap="lg">
        <Heading level={1} ref={headingRef} tabIndex={-1} className="outline-none">
          Cookbooks
        </Heading>

        {/* Always mounted, so screen readers announce the message when it appears. */}
        <div role="status" aria-live="polite" aria-atomic="true">
          {status && <Text tone="success">{status}</Text>}
        </div>

        {loadError ? (
          <Alert tone="destructive" title="Couldn't load cookbooks" description={loadError} />
        ) : cookbooks === null ? (
          <Text tone="muted">Loading cookbooks…</Text>
        ) : (
          <ItemGroup label="Your cookbooks" empty="You have no cookbooks.">
            {cookbooks.map((cookbook) => (
              <Item
                key={cookbook.id}
                title={cookbook.name}
                description={recipeCount(cookbook.recipeCount)}
                actions={
                  <Button
                    tone="destructive"
                    variant="soft"
                    size="sm"
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
      </Stack>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={target ? `Delete ${target.name}?` : "Delete cookbook?"}
        description={
          <>
            The cookbook is deleted for good. Its recipes stay in your library.
            {deleteError && (
              <Text as="span" tone="destructive" className="mt-3 block" role="alert">
                {deleteError}
              </Text>
            )}
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
