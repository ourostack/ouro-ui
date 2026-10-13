import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The screens every arm builds, in the order tables list them. Each is a folder in screens/. */
export const screens = ["settings-form", "recipe-list", "command-palette", "confirm-delete", "app-shell"] as const;
export type Screen = (typeof screens)[number];

export const screensDir = join(dirname(fileURLToPath(import.meta.url)), "screens");

export function isScreen(value: string): value is Screen {
  return (screens as readonly string[]).includes(value);
}

/** The task as the agent reads it: screens/<screen>/task.md. */
export function taskText(screen: Screen): string {
  return readFileSync(join(screensDir, screen, "task.md"), "utf8").trim();
}

/** The numbered items under the task's "## Acceptance" heading. */
export function acceptanceItems(screen: Screen): { number: number; text: string }[] {
  const section = taskText(screen).split(/^## Acceptance\s*$/m)[1] ?? "";
  return [...section.split(/^## /m)[0]!.matchAll(/^(\d+)\. (.+)$/gm)].map((match) => ({ number: Number(match[1]), text: match[2]! }));
}
