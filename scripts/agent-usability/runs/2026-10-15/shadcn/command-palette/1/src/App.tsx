import { useEffect, useRef, useState } from "react"
import { SearchIcon } from "lucide-react"

import { runCommand, type Command } from "@/api/commands"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { CommandPalette } from "@/CommandPalette"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

export function App() {
  const [open, setOpen] = useState(false)
  const [lastCommand, setLastCommand] = useState<string | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const openRef = useRef(open)

  function changeOpen(next: boolean) {
    if (next && !openRef.current) {
      const active = document.activeElement
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null
    }
    openRef.current = next
    setOpen(next)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault()
        changeOpen(!openRef.current)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function handleRun(command: Command) {
    setLastCommand(command.label)
    void runCommand(command.id)
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <title>Kitchen</title>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-heading text-sm font-semibold">Cooking app</span>
          <Button
            variant="outline"
            className="gap-2 text-muted-foreground"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => changeOpen(true)}
          >
            <SearchIcon aria-hidden="true" />
            <span className="max-sm:sr-only">Search commands</span>
            <KbdGroup aria-hidden="true">
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold">Kitchen</h1>
        <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
          {lastCommand ? `Last command: ${lastCommand}` : ""}
        </p>
        <section aria-labelledby="dashboard-heading" className="mt-6 rounded-xl border border-dashed p-6">
          <h2 id="dashboard-heading" className="font-heading text-base font-medium">
            Dashboard
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your recipes, shopping list and meal plan will appear here. Press{" "}
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd> <Kbd>K</Kbd> to jump anywhere.
          </p>
        </section>
      </main>
      <CommandPalette
        open={open}
        onOpenChange={changeOpen}
        onRun={handleRun}
        returnFocus={returnFocus}
      />
    </div>
  )
}
