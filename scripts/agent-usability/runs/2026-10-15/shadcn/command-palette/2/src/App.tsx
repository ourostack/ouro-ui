import * as React from "react"
import { SearchIcon } from "lucide-react"

import { commands, runCommand, type Command } from "@/api/commands"
import { CommandPalette } from "@/components/command-palette"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

export function App() {
  const [open, setOpen] = React.useState(false)
  const [lastCommand, setLastCommand] = React.useState<string | null>(null)
  const returnFocusRef = React.useRef<HTMLElement | null>(null)

  const openPalette = React.useCallback(() => {
    const active = document.activeElement
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null
    setOpen(true)
  }, [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      if (open) {
        setOpen(false)
      } else {
        openPalette()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, openPalette])

  function handleRun(command: Command) {
    setOpen(false)
    void runCommand(command.id).then(() => setLastCommand(command.label))
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-heading text-sm font-semibold">Cooking app</span>
          <Button
            variant="outline"
            onClick={openPalette}
            aria-keyshortcuts="Control+K Meta+K"
            aria-haspopup="dialog"
            className="text-muted-foreground"
          >
            <SearchIcon aria-hidden="true" />
            Search commands
            <KbdGroup aria-hidden="true" className="ml-1">
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Kitchen</h1>
        <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
          {lastCommand ? `Last command: ${lastCommand}` : null}
        </p>
        <section
          aria-labelledby="dashboard-heading"
          className="mt-6 rounded-xl border border-dashed p-6"
        >
          <h2 id="dashboard-heading" className="font-medium">
            Today in your kitchen
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your dashboard is on its way. Press{" "}
            <Kbd className="text-foreground">{isMac ? "⌘K" : "Ctrl+K"}</Kbd> to jump to recipes, your
            shopping list or settings.
          </p>
        </section>
      </main>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        commands={commands}
        onRun={handleRun}
        returnFocusRef={returnFocusRef}
      />
    </div>
  )
}
