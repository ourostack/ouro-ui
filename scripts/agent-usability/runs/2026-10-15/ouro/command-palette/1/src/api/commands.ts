import { request } from "./fake-backend";

export type CommandGroup = "Navigation" | "Recipes" | "Account";

export interface Command {
  id: string;
  label: string;
  group: CommandGroup;
}

/** Every command, in the order the palette lists them. */
export const commands: Command[] = [
  { id: "go-home", label: "Go to Home", group: "Navigation" },
  { id: "go-recipes", label: "Go to Recipes", group: "Navigation" },
  { id: "go-shopping-list", label: "Go to Shopping list", group: "Navigation" },
  { id: "go-settings", label: "Go to Settings", group: "Navigation" },
  { id: "new-recipe", label: "New recipe", group: "Recipes" },
  { id: "new-cookbook", label: "New cookbook", group: "Recipes" },
  { id: "import-recipe", label: "Import a recipe from a link", group: "Recipes" },
  { id: "invite-cook", label: "Invite a cook", group: "Account" },
  { id: "sign-out", label: "Sign out", group: "Account" },
];

/** Runs a command on the server. */
export function runCommand(id: string): Promise<void> {
  return request("runCommand", [id], () => undefined, 150);
}
