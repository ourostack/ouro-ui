import { type AgentCase, notAssignable } from "./shared.ts";

/** The error for an array passed to a hint type: the hint's key is the property it lacks. */
const missing = (value: string, fix: string) => `error TS2741: Property ''${fix}'' is missing in type '${value}' but required in type '{ '${fix}': never; }'.`;

/** The sidebar snippets in sidebar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "sidebar01",
    habit: "a flat items list on Sidebar",
    tsc: [missing("{ label: string; href: string; }[]", 'Use sections={[{ items: [{ label: "Recipes", href: "/recipes" }] }]}')],
    dev: '<Sidebar label="Main" sections={[{ items: [{ label: "Recipes", href: "/recipes" }] }]} />',
    names: ["tsc", "dev"],
  },
  {
    id: "sidebar02",
    habit: "an isCollapsed flag",
    tsc: [notAssignable("boolean", `{ "Use <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed}>": never; }`)],
    dev: "<Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed}>",
    names: ["tsc", "dev"],
  },
  {
    id: "sidebar03",
    habit: "the router's pathname on Sidebar",
    tsc: [notAssignable("string", `{ "Use <Sidebar currentPath={pathname}>": never; }`)],
    dev: "<Sidebar currentPath={pathname}>",
    names: ["tsc", "dev"],
  },
];

/** Valid sidebar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["sidebarOk01", "sidebarOk02"];
