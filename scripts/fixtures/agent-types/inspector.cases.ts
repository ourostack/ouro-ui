import { type AgentCase, hint } from "./shared.ts";

/** The inspector snippets in inspector.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "inspector01", habit: "onClose for an overlay that turns off", tsc: [hint("() => void", "Use onOpenChange={setXray}")], dev: "<Inspector open={xray} onOpenChange={setXray}>", names: ["tsc", "dev"] },
];

/** Valid inspector snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["inspectorOk01"];
