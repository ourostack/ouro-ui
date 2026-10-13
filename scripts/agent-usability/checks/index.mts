import type { Screen } from "../screens.mts";
import { appShell } from "./app-shell.mts";
import { commandPalette } from "./command-palette.mts";
import { confirmDelete } from "./confirm-delete.mts";
import type { ScreenChecks } from "./helpers.mts";
import { recipeList } from "./recipe-list.mts";
import { settingsForm } from "./settings-form.mts";

const all: Record<Screen, ScreenChecks> = {
  "settings-form": settingsForm,
  "recipe-list": recipeList,
  "command-palette": commandPalette,
  "confirm-delete": confirmDelete,
  "app-shell": appShell,
};

export function checksFor(screen: Screen): ScreenChecks {
  return all[screen];
}
