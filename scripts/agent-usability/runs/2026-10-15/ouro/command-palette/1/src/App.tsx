import { useEffect, useMemo, useState } from "react";
import { commands, runCommand, type Command as KitchenCommand, type CommandGroup as KitchenGroup } from "@/api/commands";
import { Button } from "@/components/ouro/button/button";
import { Command, type CommandGroup } from "@/components/ouro/command/command";
import { Kbd } from "@/components/ouro/kbd/kbd";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { useFocusPaletteSearch, usePaletteShortcut } from "@/use-palette-shortcut";

const groupOrder: readonly KitchenGroup[] = ["Navigation", "Recipes", "Account"];

export function App() {
  const [open, setOpen] = usePaletteShortcut();
  useFocusPaletteSearch(open);
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Kitchen";
  }, []);

  const [query, setQuery] = useState("");
  const items = useMemo<CommandGroup[]>(() => {
    const run = (command: KitchenCommand) => {
      void runCommand(command.id).then(() => setLastCommand(command.label));
    };
    // Matches the label as typed, ignoring case; the matches keep their order.
    const text = query.trim().toLowerCase();
    return groupOrder
      .map((group) => ({
        label: group,
        items: commands
          .filter((command) => command.group === group && command.label.toLowerCase().includes(text))
          .map((command) => ({ label: command.label, onSelect: () => run(command) })),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <Heading level={1}>Kitchen</Heading>
            {lastCommand !== null && (
              <Text tone="muted" size="sm" className="mt-1" role="status">
                Last command: {lastCommand}
              </Text>
            )}
          </div>
          <Button variant="outline" tone="secondary" onClick={() => setOpen(true)} aria-keyshortcuts="Control+K Meta+K">
            Search commands
            <Kbd keys={["mod", "k"]} aria-hidden="true" className="ms-2" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section aria-labelledby="dashboard-heading" className="rounded-lg border border-dashed border-border p-6">
          <Heading level={2} size="md" id="dashboard-heading">
            Dashboard
          </Heading>
          <Text tone="muted" className="mt-2">
            Your recipes, cookbooks and shopping list will show here. Press <Kbd keys={["mod", "k"]} /> to jump anywhere.
          </Text>
        </section>
      </main>
      <Command
        title="Command palette"
        open={open}
        onOpenChange={setOpen}
        items={items}
        onQueryChange={setQuery}
        emptyLabel="No commands found."
      />
    </div>
  );
}
