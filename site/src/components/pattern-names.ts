/** The page patterns that have a story, by the name `registry/ouro/patterns/<name>` gives them. */
export const patternStories = { "settings-page": "settings", "dashboard-page": "dashboard", "list-detail-page": "list-detail" } as const;

export type PatternName = keyof typeof patternStories;
