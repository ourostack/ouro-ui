import * as React from "react";
import { SearchIcon } from "lucide-react";

import { type Command, runCommand } from "@/api/commands";
import { CommandPalette } from "@/components/command-palette";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogTrigger } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const dashboardCards = [
  { title: "Today's menu", description: "Your planned meals will show up here." },
  { title: "Shopping list", description: "Items you still need to buy will show up here." },
  { title: "Recent recipes", description: "Recipes you cooked lately will show up here." },
];

export function App() {
  const [open, setOpen] = React.useState(false);
  const [lastCommand, setLastCommand] = React.useState<string | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (next) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    setOpen(next);
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      handleOpenChange(!open);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleOpenChange]);

  async function handleRun(command: Command) {
    setOpen(false);
    await runCommand(command.id);
    setLastCommand(command.label);
  }

  function finalFocus() {
    const target = returnFocusRef.current;
    return target?.isConnected ? target : true;
  }

  return (
    <div className="min-h-svh">
      <title>Kitchen</title>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold">Kitchen</h1>
            <p role="status" className="text-sm text-muted-foreground">
              {lastCommand ? `Last command: ${lastCommand}` : null}
            </p>
          </div>
          <CommandPalette open={open} onOpenChange={handleOpenChange} onRun={handleRun} finalFocus={finalFocus}>
            <DialogTrigger render={<Button variant="outline" className="transition-none" aria-keyshortcuts="Control+K Meta+K" />}>
              <SearchIcon data-icon="inline-start" />
              Search commands
              <Kbd aria-hidden="true" className="text-foreground">
                {isMac ? "⌘K" : "Ctrl K"}
              </Kbd>
            </DialogTrigger>
          </CommandPalette>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <h2 className="font-heading text-lg font-medium">Dashboard</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {dashboardCards.map((card) => (
            <Card key={card.title}>
              <CardHeader>
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
