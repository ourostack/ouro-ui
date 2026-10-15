import * as React from "react"

import type { Command as PaletteCommand, CommandGroup as GroupName } from "@/api/commands"
import {
  Command,
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

const GROUPS: GroupName[] = ["Navigation", "Recipes", "Account"]

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  onRun,
  returnFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: PaletteCommand[]
  onRun: (command: PaletteCommand) => void
  returnFocusRef: React.RefObject<HTMLElement | null>
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15%] translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
        showCloseButton={false}
        initialFocus={inputRef}
        finalFocus={returnFocusRef}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Type to filter commands, use the arrow keys to move, and press
            Enter to run one.
          </DialogDescription>
        </DialogHeader>
        <PaletteSearch commands={commands} onRun={onRun} inputRef={inputRef} />
      </DialogContent>
    </Dialog>
  )
}

// Mounted only while the dialog is open, so the search starts fresh each time.
function PaletteSearch({
  commands,
  onRun,
  inputRef,
}: {
  commands: PaletteCommand[]
  onRun: (command: PaletteCommand) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState(commands[0]?.id ?? "")

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return commands.filter((command) =>
      command.label.toLowerCase().includes(needle)
    )
  }, [commands, query])

  function handleQueryChange(next: string) {
    setQuery(next)
    const needle = next.trim().toLowerCase()
    const first = commands.find((command) =>
      command.label.toLowerCase().includes(needle)
    )
    setSelected(first?.id ?? "")
  }

  return (
    <Command
      label="Search commands"
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      loop
    >
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={handleQueryChange}
        placeholder="Type a command or search…"
      />
      <CommandList>
        {GROUPS.map((group) => {
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
      {matches.length === 0 && (
        <p role="status" className="py-6 text-center text-sm">
          No commands found.
        </p>
      )}
    </Command>
  )
}
