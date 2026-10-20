import { type AgentCase, notAssignable } from "./shared.ts";

const breakpoints = `"sm" | "md" | "lg" | "xl" | "never" | (string & { 'Use "sm", "md", "lg", "xl" or "never"': never; }) | undefined`;

/** The tab-bar snippets in tab-bar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "tabBar01", habit: "the router's pathname on TabBar", tsc: [notAssignable("string", `{ "Use <TabBar currentPath={pathname}>": never; }`)], dev: "<TabBar currentPath={pathname}>", names: ["tsc", "dev"] },
  { id: "tabBar02", habit: "a device name as the breakpoint", tsc: [notAssignable('"desktop"', breakpoints)], dev: '<TabBar hideFrom="lg">', names: ["tsc", "dev"] },
];

/** Valid tab-bar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["tabBarOk01"];
