import { type AgentCase, hint } from "./shared.ts";

/** The install-prompt snippets in install-prompt.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "installPrompt01", habit: "open to show the offer", tsc: [hint("boolean", "InstallPrompt shows itself when the app can be installed")], dev: "<InstallPrompt />", names: ["tsc", "dev"] },
  { id: "installPrompt02", habit: "onAccept for the answer", tsc: [hint("() => void", "Use onInstall={(outcome) => ...}")], dev: "<InstallPrompt onInstall={(outcome) => {}} />", names: ["tsc", "dev"] },
];

/** Valid install-prompt snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["installPromptOk01"];
