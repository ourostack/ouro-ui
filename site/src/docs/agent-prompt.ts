import { claim } from "@/registry/ouro/lib/ouro/claims";

// The line a component page hands to a reader's coding agent, as the home page hands it Ouro UI as a whole (copy.ts,
// HANDOFF): what to add, and the page to read first, as Markdown, which an agent reads best.

/** The site's address, as head.ts names it; a test holds the two together. */
export const PROMPT_SITE = "https://ui.ouroboros.bot";

/** What to paste into a coding agent's chat to add one component: "Add Dialog from Ouro UI to this app. Read …dialog.md first and follow it." */
export function componentPrompt(title: string, name: string): string {
  return `Add ${title} from Ouro UI to this app. Read ${PROMPT_SITE}/docs/${name}.md first and follow it.`;
}

/**
 * A component's published Markdown (/docs/<name>.md) with its install steps, the commands its HTML page shows, put before
 * the import line, so an agent that follows the page installs the component before it imports it.
 */
export function withInstall(markdown: string, name: string, latestRelease: string): string {
  const steps = [
    "## Install",
    "",
    `${claim("Once per app, with Tailwind CSS v4", { source: { file: "test/install-fixture/package.json" }, verify: { fileLine: "test/install-fixture/package.json", pattern: '"tailwindcss": "\\^4\\.' } })} and an \`@/*\` path alias (skip \`init\` in an existing shadcn app), then the component:`,
    "",
    "```sh",
    "npx shadcn@latest init --base base --preset nova --yes --no-monorepo",
    `npx shadcn@latest add ourostack/ouro-ui/ouro-base#${latestRelease}`,
    `npx shadcn@latest add ourostack/ouro-ui/${name}#${latestRelease}`,
    "```",
    "",
    `More: [Installing](${PROMPT_SITE}/docs/installing.md).`,
    "",
    "",
  ].join("\n");
  const at = markdown.indexOf("```tsx\nimport ");
  if (at === -1) throw new Error(`Put the install steps for ${name} before its import line: the Markdown for ${name} must start its code with one.`);
  return markdown.slice(0, at) + steps + markdown.slice(at);
}
