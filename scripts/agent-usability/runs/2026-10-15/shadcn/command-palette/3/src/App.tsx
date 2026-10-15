import * as React from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { CommandPalette } from "@/components/command-palette"
import { runCommand, type Command } from "@/api/commands"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

export function App() {
  const [open, setOpen] = React.useState(false)
  const [lastCommand, setLastCommand] = React.useState<string | null>(null)
  const returnFocusTo = React.useRef<HTMLElement | null>(null)

  const openPalette = React.useCallback(() => {
    const active = document.activeElement
    returnFocusTo.current = active instanceof HTMLElement && active !== document.body ? active : null
    setOpen(true)
  }, [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault()
        if (!open) openPalette()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, openPalette])

  function handleRun(command: Command) {
    setOpen(false)
    setLastCommand(command.label)
    void runCommand(command.id)
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <title>Kitchen</title>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="font-heading text-xl font-semibold">Kitchen</h1>
          <Button
            variant="outline"
            className="gap-2 transition-none"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={openPalette}
          >
            <SearchIcon aria-hidden="true" />
            <span>Search commands</span>
            <KbdGroup aria-hidden="true">
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div role="status" className="min-h-5 text-sm text-muted-foreground">
          {lastCommand ? `Last command: ${lastCommand}` : null}
        </div>
        <section aria-labelledby="dashboard-heading" className="mt-4 rounded-xl border border-dashed p-6">
          <h2 id="dashboard-heading" className="font-heading text-base font-medium">
            Dashboard
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your recipes, shopping list and meal plan will show up here. Press{" "}
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd> <Kbd>K</Kbd> to jump anywhere.
          </p>
        </section>
      </main>
      <CommandPalette open={open} onOpenChange={setOpen} onRun={handleRun} returnFocusTo={returnFocusTo} />
    </div>
  )
}
