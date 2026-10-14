/**
 * The words the homepage, the head tags (routes.ts), README.md and site/public/llms.txt
 * share. Change them here; site.test.tsx fails when README.md or llms.txt disagree.
 */
export const HERO_TITLE = "Designed down to the last tap and the last prop.";

export const HERO_SUBLINE =
  "Interactions that feel right to the humans using them. Code that's obvious to the agents building with them.";

/** The homepage's meta description, and the first lines of README.md and llms.txt. */
export const HERO_COPY = `${HERO_TITLE} ${HERO_SUBLINE}`;

export const SHADCN_BADGE = "Works with shadcn/ui";

export const SHADCN_LINE =
  "Installs with the shadcn CLI, uses shadcn's theme tokens, and sits alongside the shadcn/ui components you already have.";

/** AX's product scope is not established; the concept is not a shipped kit. */
export const AGENTS_COMING_SOON = {
  title: "Coming soon: Ouro AX",
  intro:
    "Ouro AX is the agent-facing direction within Ouro UI. Its scope is still being defined.",
} as const;
