// The registry's agent door: the actions an agent may run against Ouro UI's registry. Every one reads; none changes
// anything. `node scripts/ouro-actions/ouro-actions.mts generate actions/registry.actions.mts actions/generated`
// writes the projections in actions/generated, and actions/server/registry-mcp.mts serves them.
import { defineAction, defineActions, field } from "../scripts/ouro-actions/ouro-actions.mts";

export const listRegistryItems = defineAction({
  id: "list_registry_items",
  consent: "read",
  label: "List items",
  description: "List the Ouro UI registry items you can add to an app.",
  agent:
    "List the names of the Ouro UI registry items, in registry order. Pass filter to keep only the names that contain it, such as 'dialog' or 'button'. Use a name from this list with get_item_install or get_item_docs.",
  input: {
    filter: field.string({
      label: "Filter",
      description: "Keep only the items whose name contains this text, ignoring case.",
      optional: true,
      maxLength: 80,
    }),
  },
  output: {
    names: field.string({
      label: "Names",
      description: "The names of the matching registry items, in registry order, separated by commas.",
    }),
  },
  cli: "list",
});

export const getItemInstall = defineAction({
  id: "get_item_install",
  consent: "read",
  label: "Install command",
  description: "Get the command that adds an Ouro UI item to an app.",
  agent:
    "Return the shadcn command that adds one registry item to an app, pinned to the newest Ouro UI release. Run the command as it is; it installs the item and the Ouro items it needs. The name is one from list_registry_items.",
  input: {
    name: field.string({
      label: "Item",
      description: "The registry item's name, such as dialog.",
      arg: true,
      maxLength: 80,
    }),
  },
  output: {
    command: field.string({ label: "Command", description: "The command that adds the item, pinned to a release." }),
    release: field.string({ label: "Release", description: "The release tag the command pins, such as v1.3.204." }),
  },
  cli: "install",
});

export const getItemDocs = defineAction({
  id: "get_item_docs",
  consent: "read",
  label: "Item docs",
  description: "Read the docs for one Ouro UI item.",
  agent:
    "Return the docs page address for one registry item and, when the docs are in the repository, the page's Markdown: its purpose, props, examples and when to use something else. The name is one from list_registry_items.",
  input: {
    name: field.string({
      label: "Item",
      description: "The registry item's name, such as dialog.",
      arg: true,
      maxLength: 80,
    }),
  },
  output: {
    url: field.string({ label: "Docs address", description: "The item's docs page on the Ouro UI site." }),
    markdown: field.string({
      label: "Docs",
      description: "The item's docs in Markdown, or an empty string when the repository has none for it.",
    }),
  },
  cli: "docs",
});

export default defineActions("ouro-ui-registry", [listRegistryItems, getItemInstall, getItemDocs], { tool: "ouro-ui" });
