import { type AgentCase, hint } from "./shared.ts";

/** The code-block snippets in code-block.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "codeBlock01", habit: "lang, as in Markdown fences", tsc: [hint("string", 'Use <CodeBlock language="tsx" />')], dev: '<CodeBlock language="bash" />', names: ["tsc", "dev"] },
  { id: "codeBlock02", habit: "a filename prop for the caption", tsc: [hint("string", 'Use <CodeBlock title="app.tsx" />')], dev: '<CodeBlock title="app.ts" />', names: ["tsc", "dev"] },
];

/** Valid code-block snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["codeBlockOk01"];
