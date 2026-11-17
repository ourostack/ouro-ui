import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The cover snippets in cover.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "cover01", habit: "an image prop", tsc: [hint("string", "Use src={url}")], dev: "<Cover src={url} />", names: ["tsc", "dev"] },
  {
    id: "cover02",
    habit: "a size past lg",
    tsc: [notAssignable('"xl"', `"sm" | "md" | "lg" | "fill" | (string & { 'Use "sm", "md", "lg" or "fill"': never; }) | undefined`)],
    dev: '<Cover size="md" />',
    names: ["tsc", "dev"],
  },
];

/** Valid cover snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["coverOk01"];
