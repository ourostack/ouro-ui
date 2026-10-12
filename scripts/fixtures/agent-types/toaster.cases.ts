import { type AgentCase, hint } from "./shared.ts";

/** The toaster snippets in toaster.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "toaster01", habit: "Sonner's position on Toaster", tsc: [hint("string", "Not a prop: toasts show at the bottom. Use <Toaster />")], dev: "<Toaster />", names: ["tsc", "dev"] },
  { id: "toaster02", habit: "Sonner's richColors", tsc: [hint("boolean", 'Use toast("Saved", { tone: "success" })')], dev: 'toast("Saved", { tone: "success" })', names: ["tsc", "dev"] },
];

/** Valid toaster snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["toasterValid"];
