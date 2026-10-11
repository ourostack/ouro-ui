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

/** The "Coming soon: Ouro UI for agents" section (spec section 12). No dates. */
export const AGENTS_COMING_SOON = {
  title: "Coming soon: Ouro UI for agents",
  intro:
    "Ouro UI has two halves, named for who they serve: for humans, this library, and for agents, the CLIs, MCP servers and other interfaces whose user is an agent. The agent half arrives as copy-in kits through the same registry.",
  cli: "The CLI kit: one definition gives human output and --json, errors that name the fix, stable exit codes, and help that parses.",
  mcp: "The MCP kit: tool schemas that reject bad calls with the fix, paginated and truncated results, and one error shape.",
} as const;
