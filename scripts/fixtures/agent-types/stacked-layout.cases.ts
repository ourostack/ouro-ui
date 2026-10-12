import { type AgentCase, notAssignable } from "./shared.ts";

/** The stacked-layout snippets in stacked-layout.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "stackedLayout01",
    habit: "Catalyst's sidebar slot on StackedLayout",
    tsc: [notAssignable("string", `{ "Use <StackedLayout navbar={<Navbar ... />}>, or <SidebarLayout sidebar={...}>": never; }`)],
    dev: "<StackedLayout navbar={<Navbar … />}>, or <SidebarLayout sidebar={<Sidebar … />}> for a sidebar",
    names: ["tsc", "dev"],
  },
  {
    id: "stackedLayout02",
    habit: "a header slot on StackedLayout",
    tsc: [notAssignable("string", `{ "Use <StackedLayout navbar={<Navbar ... />}>": never; }`)],
    dev: "<StackedLayout navbar={<Navbar … />}>",
    names: ["tsc", "dev"],
  },
];

/** Valid stacked-layout snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["stackedLayoutOk01"];
