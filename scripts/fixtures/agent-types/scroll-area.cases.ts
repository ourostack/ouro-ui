import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The scroll-area snippets in scroll-area.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "scrollArea01",
    habit: "Radix's type prop on ScrollArea",
    tsc: [notAssignable("string", `{ "Use <ScrollArea>; the scrollbar shows on hover and scroll": never; }`)],
    dev: "<ScrollArea>",
    names: ["tsc", "dev"],
  },
  { id: "scrollArea02", habit: "a maxHeight prop", tsc: [hint("number", 'Use <ScrollArea className="max-h-80">')], dev: '<ScrollArea className="max-h-80">', names: ["tsc", "dev"] },
  {
    id: "scrollArea03",
    habit: "an x orientation",
    tsc: [notAssignable('"x"', `ScrollAreaOrientation | (string & { 'Use "vertical", "horizontal" or "both"': never; }) | undefined`)],
    dev: '<ScrollArea orientation="horizontal">',
    names: ["tsc", "dev"],
  },
];

/** Valid scroll-area snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["scrollArea04"];
