import type { AgentCase } from "./shared.ts";

/** The ouro-mcp-app snippets in ouro-mcp-app.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "ouroMcpApp01",
    habit: "an onAction handler, as A2UISurface takes",
    tsc: [`error TS2322: Type '() => void' is not assignable to type '{ "OuroMcpApp calls each action's own tool through the host; pass catalog": never; }'.`],
    dev: "<OuroMcpApp catalog={catalog} />",
    names: ["tsc", "dev"],
  },
];

/** Valid ouro-mcp-app snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ouroMcpAppOk01"];
