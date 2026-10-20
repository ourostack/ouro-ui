import { type AgentCase, hint, notAssignable } from "./shared.ts";

const variants = `"menu" | "segmented" | (string & { 'Use "menu" (an icon button for a header) or "segmented" (for settings)': never; }) | undefined`;

/** The color-scheme-toggle snippets in color-scheme-toggle.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "colorSchemeToggle01", habit: "next-themes' theme value", tsc: [hint("string", "Use <ColorSchemeToggle /> inside <ColorSchemeProvider>")], dev: "<ColorSchemeToggle />", names: ["tsc", "dev"] },
  { id: "colorSchemeToggle02", habit: "shadcn's mode-toggle dropdown", tsc: [notAssignable('"dropdown"', variants)], dev: '<ColorSchemeToggle variant="segmented" />', names: ["tsc", "dev"] },
];

/** Valid color-scheme-toggle snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["colorSchemeToggleOk01"];
