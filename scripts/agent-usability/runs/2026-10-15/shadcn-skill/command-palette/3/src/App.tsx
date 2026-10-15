import * as React from "react"
import { SearchIcon } from "lucide-react"

import { runCommand, type Command } from "@/api/commands"
import { CommandPalette } from "@/components/command-palette"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

export function App() {
  const [open, setOpen] = React.useState(false)
  const [lastCommand, setLastCommand] = React.useState<string | null>(null)
  const returnFocusTo = React.useRef<HTMLElement | null>(null)

  const openPalette = React.useCallback(() => {
    const active = document.activeElement
    returnFocusTo.current =
      active instanceof HTMLElement && active !== document.body ? active : null
    setOpen(true)
  }, [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault()
        if (!open) openPalette()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, openPalette])

  function run(command: Command) {
    setOpen(false)
    setLastCommand(command.label)
    void runCommand(command.id)
  }

  return (
    <div className="flex min-h-svh flex-col">
      <title>Kitchen</title>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-semibold">Kitchen</h1>
          <Button
            variant="outline"
            onClick={openPalette}
            aria-keyshortcuts="Control+K Meta+K"
          >
            <SearchIcon data-icon="inline-start" />
            Search commands
            <KbdGroup aria-hidden="true" className="ml-1">
              <Kbd className="text-foreground">{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd className="text-foreground">K</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <p role="status" className="text-sm">
          {lastCommand ? `Last command: ${lastCommand}` : null}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Today</h2>
              </CardTitle>
              <CardDescription>Your dashboard is coming soon.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Press {isMac ? "⌘K" : "Ctrl+K"} to jump anywhere or start an
                action.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Recipes</h2>
              </CardTitle>
              <CardDescription>Recent recipes will show up here.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Nothing cooked yet.</p>
            </CardContent>
          </Card>
        </div>
      </main>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        onRun={run}
        returnFocusTo={returnFocusTo}
      />
    </div>
  )
}
