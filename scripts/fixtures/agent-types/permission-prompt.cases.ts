import { type AgentCase, hint } from "./shared.ts";

/** The permission-prompt snippets in permission-prompt.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "permissionPrompt01", habit: "onApprove, as in approval UIs", tsc: [hint("() => void", "Use <PermissionPrompt onAllow={allow}>")], dev: "<PermissionPrompt onAllow={allow}>", names: ["tsc", "dev"] },
  { id: "permissionPrompt02", habit: "a command prop for what it would run", tsc: [hint("string", 'Use <PermissionPrompt detail="npm install">')], dev: '<PermissionPrompt detail="npm install">', names: ["tsc", "dev"] },
  { id: "permissionPrompt03", habit: "a description prop for why it asks", tsc: [hint("string", 'Use <PermissionPrompt reason="To add the package">')], dev: '<PermissionPrompt reason="To add the package">', names: ["tsc", "dev"] },
];

/** Valid permission-prompt snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["permissionPromptOk01"];
