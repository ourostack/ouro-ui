import * as React from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { commands, type Command as AppCommand, type CommandGroup as AppCommandGroup } from "@/api/commands"

const groups: AppCommandGroup[] = ["Navigation", "Recipes", "Account"]

export function CommandPalette({
  open,
  onOpenChange,
  onRun,
  returnFocusTo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRun: (command: AppCommand) => void
  returnFocusTo: React.RefObject<HTMLElement | null>
}) {
  const [search, setSearch] = React.useState("")
  const [highlighted, setHighlighted] = React.useState(commands[0]?.id ?? "")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [wasOpen, setWasOpen] = React.useState(open)

  // Start each opening with an empty search and the first command highlighted.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSearch("")
      setHighlighted(commands[0]?.id ?? "")
    }
  }

  const query = search.trim().toLowerCase()
  const matches = query
    ? commands.filter((command) => command.label.toLowerCase().includes(query))
    : commands

  function handleSearchChange(value: string) {
    setSearch(value)
    const q = value.trim().toLowerCase()
    const first = commands.find((command) => command.label.toLowerCase().includes(q))
    setHighlighted(first?.id ?? "")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        // Hand focus back to whatever had it before the palette opened.
        if (!isOpen) returnFocusTo.current?.focus({ preventScroll: true })
      }}
    >
      <DialogContent
        className="top-1/4 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
        showCloseButton={false}
        initialFocus={inputRef}
        finalFocus={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Type to filter commands, then press Enter to run one.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} value={highlighted} onValueChange={setHighlighted} loop>
          <CommandInput
            ref={inputRef}
            autoFocus
            aria-label="Search commands"
            placeholder="Type a command or search…"
            value={search}
            onValueChange={handleSearchChange}
          />
          <CommandList aria-label="Commands">
            <CommandEmpty>No commands found.</CommandEmpty>
            {groups.map((group) => {
              const items = matches.filter((command) => command.group === group)
              if (items.length === 0) return null
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((command) => (
                    <CommandItem key={command.id} value={command.id} onSelect={() => onRun(command)}>
                      {command.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
