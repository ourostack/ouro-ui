/**
 * The site's ship pages, the home page and the Nautilus's page, in the order a docs page links
 * them: the story first, where a component plays a part. site/scripts/ship-components.mts lists
 * the components each one shows, in ship-components.json.
 */
export const SHIP_PAGES = [
  { path: "/nautilus/", label: "The Nautilus's story" },
  { path: "/", label: "The home page" },
] as const;
