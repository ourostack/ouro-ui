import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The story each screen-reader spec opens, by Storybook id (`<title>--<export>`, kebab case).
 * `stories.sr.setup.ts` checks each against the built Storybook's index.json before any screen
 * reader starts.
 */
export const storyIds = {
  checkbox: "forms-checkbox--playground",
  checklist: "lists-checklist--in-context",
  colorSchemeToggle: "actions-colorschemetoggle--segmented",
  dialog: "overlays-dialog--playground",
  routeProgress: "feedback-routeprogress--in-context",
  select: "forms-select--playground",
  toast: "feedback-toast--playground",
} as const;

/**
 * Whether Checklist is in this checkout. Its story (`Lists/Checklist`, `InContext`) arrives with the
 * component; until then its spec skips with that reason and the index check leaves its id out.
 * Once the folder exists, a missing story fails the lane like any other.
 */
export const checklistShipped = existsSync(fileURLToPath(new URL("../../components/ouro/checklist/component.json", import.meta.url)));
