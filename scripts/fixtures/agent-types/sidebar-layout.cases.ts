import { type AgentCase, notAssignable } from "./shared.ts";

/** The sidebar-layout snippets in sidebar-layout.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "sidebarLayout01",
    habit: "Catalyst's navbar slot on SidebarLayout",
    tsc: [notAssignable("string", `{ "Use <SidebarLayout sidebar={...} header={...}>": never; }`)],
    dev: "<SidebarLayout sidebar={<Sidebar … />} header={…}>",
    names: ["tsc", "dev"],
  },
];

/** Valid sidebar-layout snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["sidebarLayoutOk01"];
