import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The tabs snippets in tabs.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "tabs01", habit: "an onChange handler", tsc: [hint("() => void", "Use <Tabs onValueChange={(value) => ...}>")], dev: "<Tabs onValueChange={(value) => …}>", names: ["tsc", "dev"] },
  { id: "tabs02", habit: "Base UI's activateOnFocus", tsc: [hint("boolean", 'Use <Tabs activation="automatic"> or activation="manual"')], dev: '<Tabs activation="manual">', names: ["tsc", "dev"] },
  {
    id: "tabs03",
    habit: "a flex direction as the orientation",
    tsc: [notAssignable('"row"', `"horizontal" | "vertical" | (string & { 'Use "horizontal" or "vertical"': never; }) | undefined`)],
    dev: '<Tabs orientation="horizontal">',
    names: ["tsc", "dev"],
  },
];

/** Valid tabs snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["tabsOk01"];
