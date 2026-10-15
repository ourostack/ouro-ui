import * as React from "react"
import { SearchIcon } from "lucide-react"

import { commands, runCommand, type Command as KitchenCommand, type CommandGroup as KitchenCommandGroup } from "@/api/commands"
import { Button } from "@/components/ui/button"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

const GROUPS: KitchenCommandGroup[] = ["Navigation", "Recipes", "Account"]

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

function filterCommands(query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return commands
  return commands.filter((command) => command.label.toLowerCase().includes(needle))
}

export function CommandPalette({ onRun }: { onRun: (command: KitchenCommand) => void }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [highlighted, setHighlighted] = React.useState(commands[0]?.id ?? "")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const matches = React.useMemo(() => filterCommands(query), [query])

  const openPalette = React.useCallback(() => {
    setQuery("")
    setHighlighted(commands[0]?.id ?? "")
    setOpen(true)
  }, [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        if (!open) openPalette()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, openPalette])

  function handleQueryChange(value: string) {
    setQuery(value)
    setHighlighted(filterCommands(value)[0]?.id ?? "")
  }

  function handleSelect(command: KitchenCommand) {
    setOpen(false)
    onRun(command)
    void runCommand(command.id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) openPalette()
        else setOpen(false)
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" aria-keyshortcuts="Control+K Meta+K" />}
      >
        <SearchIcon data-icon="inline-start" />
        Search commands
        <KbdGroup aria-hidden="true" className="ml-1">
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </DialogTrigger>
      <DialogContent
        className="top-1/4 translate-y-0 overflow-hidden rounded-xl! p-0"
        showCloseButton={false}
        initialFocus={inputRef}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Type to filter commands, then press Enter to run one.</DialogDescription>
        </DialogHeader>
        <Command
          label="Search commands"
          shouldFilter={false}
          value={highlighted}
          onValueChange={setHighlighted}
        >
          <CommandInput
            ref={inputRef}
            placeholder="Search commands…"
            value={query}
            onValueChange={handleQueryChange}
          />
          <CommandEmpty>No commands found.</CommandEmpty>
          <CommandList className="max-h-[min(24rem,60svh)]">
            {GROUPS.map((group) => {
              const items = matches.filter((command) => command.group === group)
              if (items.length === 0) return null
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((command) => (
                    <CommandItem
                      key={command.id}
                      value={command.id}
                      onSelect={() => handleSelect(command)}
                    >
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
