import * as React from "react"

import type { Command } from "@/api/commands"
import { CommandPalette } from "@/components/command-palette"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function App() {
  const [lastCommand, setLastCommand] = React.useState<Command | null>(null)

  React.useEffect(() => {
    document.title = "Kitchen"
  }, [])

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <h1 className="font-heading text-2xl font-semibold">Kitchen</h1>
          <CommandPalette onRun={setLastCommand} />
        </div>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {lastCommand && `Last command: ${lastCommand.label}`}
        </p>
        <Card>
          <CardHeader>
            <CardTitle>Today in the kitchen</CardTitle>
            <CardDescription>
              Your dashboard is coming soon. Press Ctrl+K or ⌘K to jump anywhere.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Recipes, shopping lists and cookbooks will show up here.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
