import { useMemo, useState, type RefObject } from "react"

import { commands, type Command, type CommandGroup as Group } from "@/api/commands"
import {
  Command as CommandRoot,
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
  DialogTitle,
} from "@/components/ui/dialog"

const groups: Group[] = ["Navigation", "Recipes", "Account"]

export function CommandPalette({
  open,
  onOpenChange,
  onRun,
  returnFocus,
}: {
  open: boolean
  /** Where focus was before the palette opened; closing the palette puts it back there. */
  returnFocus: RefObject<HTMLElement | null>
  onOpenChange: (open: boolean) => void
  onRun: (command: Command) => void
}) {
  const [search, setSearch] = useState("")

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase()
    return commands.filter((command) => command.label.toLowerCase().includes(query))
  }, [search])

  function handleOpenChange(next: boolean) {
    if (!next) setSearch("")
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-[15%] translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
        showCloseButton={false}
        finalFocus={() => returnFocus.current ?? true}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter commands, use the arrow keys to choose one and press Enter to run it.
        </DialogDescription>
        <CommandRoot label="Search commands" shouldFilter={false} vimBindings={false}>
          <CommandInput
            autoFocus
            placeholder="Search commands…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
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
                      onSelect={() => {
                        handleOpenChange(false)
                        onRun(command)
                      }}
                    >
                      {command.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </CommandRoot>
      </DialogContent>
    </Dialog>
  )
}
