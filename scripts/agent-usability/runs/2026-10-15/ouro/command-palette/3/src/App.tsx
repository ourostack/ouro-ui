import { useMemo, useState } from "react";
import { commands, runCommand, type CommandGroup as CommandGroupName } from "@/api/commands";
import { Button } from "@/components/ouro/button/button";
import { Command, type CommandGroup } from "@/components/ouro/command/command";
import { Kbd } from "@/components/ouro/kbd/kbd";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { useCommandShortcut } from "@/hooks/use-command-shortcut";

const groupOrder: CommandGroupName[] = ["Navigation", "Recipes", "Account"];

export function App() {
  const [open, setOpen] = useCommandShortcut();
  const [lastCommand, setLastCommand] = useState<string | null>(null);

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
    <div className="min-h-dvh">
      <title>Kitchen</title>
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <Heading level={1}>Kitchen</Heading>
            <Text size="sm" tone="muted" role="status" className="mt-1 min-h-5">
              {lastCommand !== null ? `Last command: ${lastCommand}` : ""}
            </Text>
          </div>
          <Button
            variant="outline"
            tone="secondary"
            aria-keyshortcuts="Control+K Meta+K"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            Search commands
            <Kbd keys={["mod", "k"]} aria-hidden="true" className="ms-2" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Heading level={2} size="md">
          Dashboard
        </Heading>
        <Text tone="muted" className="mt-2 max-w-prose">
          Your recipes, shopping list and cooking plans will show here. Press the shortcut or use Search commands to jump
          anywhere.
        </Text>
      </main>

      <Command
        title="Command palette"
        open={open}
        onOpenChange={setOpen}
        items={items}
        placeholder="Search commands…"
        emptyLabel="No commands found."
      />
    </div>
  );
}
