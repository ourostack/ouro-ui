// The line a component page hands to a reader's coding agent, as the home page hands it Ouro UI as a whole (copy.ts,
// HANDOFF): what to add, and the page to read first, as Markdown, which an agent reads best.

/** The site's address, as head.ts names it; a test holds the two together. */
export const PROMPT_SITE = "https://ui.ouroboros.bot";

/** What to paste into a coding agent's chat to add one component: "Add Dialog from Ouro UI to this app. Read …dialog.md first and follow it." */
export function componentPrompt(title: string, name: string): string {
  return `Add ${title} from Ouro UI to this app. Read ${PROMPT_SITE}/docs/${name}.md first and follow it.`;
}
