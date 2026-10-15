import * as React from "react"

import { commands, type Command as AppCommand } from "@/api/commands"
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

const groups = ["Navigation", "Recipes", "Account"] as const

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
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-1/4 translate-y-0 overflow-hidden rounded-xl! p-0"
        showCloseButton={false}
        initialFocus={inputRef}
        finalFocus={() => {
          const target = returnFocusTo.current
          return target && target.isConnected ? target : true
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Type to filter commands, use the arrow keys to move and Enter to
            run one.
          </DialogDescription>
        </DialogHeader>
        <CommandSearch inputRef={inputRef} onRun={onRun} />
      </DialogContent>
    </Dialog>
  )
}

function CommandSearch({
  inputRef,
  onRun,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onRun: (command: AppCommand) => void
}) {
  const [search, setSearch] = React.useState("")

  const query = search.trim().toLowerCase()
  const matches = commands.filter((command) =>
    command.label.toLowerCase().includes(query)
  )

  return (
    <Command label="Search commands" shouldFilter={false} vimBindings={false}>
      <CommandInput
        ref={inputRef}
        placeholder="Type a command or search…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList aria-label="Commands">
        <CommandEmpty>No commands found.</CommandEmpty>
        {groups.map((group) => {
          const items = matches.filter((command) => command.group === group)
          if (items.length === 0) return null
          return (
            <CommandGroup key={group} heading={group}>
              {items.map((command) => (
                <CommandItem
                  key={command.id}
                  value={command.id}
                  onSelect={() => onRun(command)}
                >
                  {command.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </Command>
  )
}
