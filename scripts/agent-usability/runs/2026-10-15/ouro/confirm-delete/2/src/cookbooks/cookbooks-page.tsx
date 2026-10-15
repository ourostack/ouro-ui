import { useEffect, useRef, useState } from "react";
import { deleteCookbook, listCookbooks, type Cookbook } from "@/api/cookbooks";
import { Button } from "@/components/ouro/button/button";
import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog";
import { Item } from "@/components/ouro/item/item";
import { ItemGroup } from "@/components/ouro/item/item-group";
import { Spinner } from "@/components/ouro/spinner/spinner";
import { Stack } from "@/components/ouro/stack/stack";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";

function recipeCount(count: number): string {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

export function CookbooksPage() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  // The cookbook being confirmed. It stays set after the dialog closes so the
  // title does not change while the dialog animates out.
  const [target, setTarget] = useState<Cookbook | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let current = true;
    listCookbooks().then((list) => {
      if (current) setCookbooks(list);
    });
    return () => {
      current = false;
    };
  }, []);

  const askToDelete = (cookbook: Cookbook) => {
    setTarget(cookbook);
    setError(null);
    setOpen(true);
  };

  const confirmDelete = async () => {
    if (!target) return;
    setError(null);
    const result = await deleteCookbook(target.id);
    if (!result.ok) {
      setError(result.error);
      // A rejection keeps the dialog open so the cook can read why, then cancel.
      throw new Error(result.error);
    }
    setCookbooks((list) => list?.filter((cookbook) => cookbook.id !== target.id) ?? null);
    setStatus(`${target.name} deleted`);
  };

  return (
    <main className="mx-auto box-border w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Stack gap="lg">
        <Heading level={1} ref={headingRef} tabIndex={-1} className="outline-none">
          Cookbooks
        </Heading>

        <Text role="status" size="sm" tone="muted" className="min-h-5">
          {status}
        </Text>

        {cookbooks === null ? (
          <Stack gap="sm" align="center" className="py-8">
            <Spinner label="Loading cookbooks" />
          </Stack>
        ) : (
          <ItemGroup
            aria-label="Your cookbooks"
            variant="outline"
            empty={<Text tone="muted">You have no cookbooks.</Text>}
          >
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
        open={open}
        onOpenChange={setOpen}
        title={target ? `Delete ${target.name}?` : "Delete cookbook?"}
        description={
          <>
            {target
              ? `The ${recipeCount(target.recipeCount)} in it stay in your library. Only the cookbook is deleted, and this can't be undone.`
              : null}
            {error && (
              <span role="alert" className="mt-3 block font-medium text-destructive">
                {error}
              </span>
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
