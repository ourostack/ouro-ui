import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The empty snippets in empty.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "empty01", habit: "a heading prop on Empty", tsc: [hint("string", 'Use <Empty title="No recipes yet">')], dev: '<Empty title="No recipes">', names: ["tsc", "dev"] },
  { id: "empty02", habit: "a message prop on Empty", tsc: [hint("string", 'Use <Empty description="Add one.">')], dev: '<Empty description="Add one">', names: ["tsc", "dev"] },
  {
    id: "empty03",
    habit: "a left alignment on Empty",
    tsc: [notAssignable('"left"', `"center" | "start" | (string & { 'Use "center" or "start": left is "start"': never; }) | undefined`)],
    dev: '<Empty align="start">',
    names: ["tsc", "dev"],
  },
];

/** Valid empty snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["empty04"];
