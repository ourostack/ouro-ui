// The catalog groups, by job, in catalog order: one shared, fixed vocabulary, declared up front
// so a component names its group in its JSDoc (`@group Forms`) without editing a shared list.
// scripts/gen-docs.mts, the site (site/src/docs/items.ts) and its tests read it. No imports,
// so the site can bundle it.

/** The groups of components an app composes; each component's docs must say what to use instead. */
export const groupOrder = ["Actions", "Text", "Forms", "Overlays", "Menus", "Feedback", "Display", "Lists", "Layout", "Navigation", "Data", "Chat"] as const;

/** A component's catalog group. */
export type CatalogGroup = (typeof groupOrder)[number];

/** The group after the components in README's catalog, for exports that set up the app (OuroProvider). */
export const APP_SETUP = "App setup";
