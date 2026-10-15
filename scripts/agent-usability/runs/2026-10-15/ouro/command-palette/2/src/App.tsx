import { useEffect, useMemo, useState } from "react";
import { commands, runCommand, type CommandGroup as ApiCommandGroup } from "@/api/commands";
import { Button } from "@/components/ouro/button/button";
import { Command, type CommandGroup } from "@/components/ouro/command/command";
import { Kbd } from "@/components/ouro/kbd/kbd";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { usePaletteShortcut } from "@/hooks/use-palette-shortcut";

const groupOrder: readonly ApiCommandGroup[] = ["Navigation", "Recipes", "Account"];

export function App() {
  const [open, setOpen] = usePaletteShortcut();
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  // Below 640px the palette is a bottom sheet, which focuses itself on opening; move focus
  // to the search field there too, so typing starts at once at every width.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let count = 0;
    const focusSearch = () => {
      const input = document.querySelector<HTMLInputElement>('[data-ouro="command"] input');
      if (input && document.activeElement !== input) input.focus();
      if (++count < 20) frame = requestAnimationFrame(focusSearch);
    };
    frame = requestAnimationFrame(focusSearch);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const items = useMemo<CommandGroup[]>(
    () =>
      groupOrder.map((group) => ({
        label: group,
        items: commands
          .filter((command) => command.group === group)
          .map((command) => ({
            label: command.label,
            onSelect: () => {
              setLastCommand(command.label);
              void runCommand(command.id);
            },
          })),
      })),
    [],
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-lg font-semibold">Cooking app</span>
          <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">
            Search commands
            <Kbd keys={["mod", "k"]} aria-hidden="true" className="ms-2" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Heading level={1}>Kitchen</Heading>
        <div role="status" className="mt-1">
          {lastCommand !== null && <Text tone="muted">Last command: {lastCommand}</Text>}
        </div>
        <section aria-labelledby="dashboard-heading" className="mt-8 rounded-lg border border-dashed border-border p-6">
          <Heading level={2} size="md" id="dashboard-heading">
            Your dashboard
          </Heading>
          <Text tone="muted" className="mt-2">
            Today's meals, your shopping list and recent recipes will show here. Press the shortcut to jump anywhere.
          </Text>
        </section>
      </main>

      <Command
        title="Command palette"
        open={open}
        onOpenChange={setOpen}
        items={items}
        emptyLabel="No commands found."
      />
    </div>
  );
}
