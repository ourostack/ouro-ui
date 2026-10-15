import * as React from "react";

import { type Command as KitchenCommand, type CommandGroup as KitchenCommandGroup, commands } from "@/api/commands";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const groups = commands.reduce<KitchenCommandGroup[]>(
  (acc, command) => (acc.includes(command.group) ? acc : [...acc, command.group]),
  [],
);

function filterCommands(search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return commands;
  return commands.filter((command) => command.label.toLowerCase().includes(query));
}

export function CommandPalette({
  open,
  onOpenChange,
  onRun,
  finalFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (command: KitchenCommand) => void;
  finalFocus: () => HTMLElement | boolean;
  children?: React.ReactNode;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [search, setSearch] = React.useState("");
  const [value, setValue] = React.useState(commands[0]?.id ?? "");

  const matches = filterCommands(search);

  function handleSearchChange(next: string) {
    setSearch(next);
    setValue(filterCommands(next)[0]?.id ?? "");
  }

  // Start every opening with an empty search.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) handleSearchChange("");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      {children}
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0"
        showCloseButton={false}
        initialFocus={inputRef}
        finalFocus={finalFocus}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Type to filter commands, then press Enter to run one.</DialogDescription>
        </DialogHeader>
        <Command
          label="Search commands"
          shouldFilter={false}
          vimBindings={false}
          value={value}
          onValueChange={setValue}
        >
          <CommandInput
            ref={inputRef}
            autoFocus
            placeholder="Search commands…"
            value={search}
            onValueChange={handleSearchChange}
          />
          <CommandList label="Commands">
            <CommandEmpty>No commands found.</CommandEmpty>
            {groups.map((group) => {
              const items = matches.filter((command) => command.group === group);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((command) => (
                    <CommandItem key={command.id} value={command.id} onSelect={() => onRun(command)}>
                      {command.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
