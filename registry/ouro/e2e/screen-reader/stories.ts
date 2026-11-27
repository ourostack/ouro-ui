import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The story each screen-reader spec opens, by Storybook id (`<title>--<export>`, kebab case).
 * `stories.sr.setup.ts` checks each against the built Storybook's index.json before any screen
 * reader starts.
 */
export const storyIds = {
  buttonLoading: "actions-button--loading",
  checkbox: "forms-checkbox--playground",
  celebrate: "feedback-celebrate--in-context",
  checklist: "lists-checklist--in-context",
  composerBasic: "chat-composer--basic",
  colorSchemeToggle: "actions-colorschemetoggle--segmented",
  command: "menus-command--playground",
  dialog: "overlays-dialog--playground",
  formServerErrors: "forms-form--server-errors",
  item: "lists-item--in-context",
  menu: "menus-menu--playground",
  menuBar: "menus-menu--bar",
  patternDashboard: "reference-patterns--dashboard",
  patternListDetail: "reference-patterns--list-detail",
  reorderableDisabled: "lists-reorderable--disabled",
  routeProgress: "feedback-routeprogress--in-context",
  select: "forms-select--playground",
  switch: "forms-switch--playground",
  syncStatus: "feedback-syncstatus--in-context",
  tabsLinks: "navigation-tabs--links",
  textFieldStates: "forms-textfield--states",
  themePicker: "actions-themepicker--playground",
  timeGridDay: "data-timegrid--day",
  timer: "feedback-timer--short",
  toast: "feedback-toast--playground",
  toastAction: "feedback-toast--with-action",
} as const;

/**
 * Whether Checklist is in this checkout. Its story (`Lists/Checklist`, `InContext`) arrives with the
 * component; until then its spec skips with that reason and the index check leaves its id out.
 * Once the folder exists, a missing story fails the lane like any other.
 */
export const checklistShipped = existsSync(fileURLToPath(new URL("../../components/ouro/checklist/component.json", import.meta.url)));
