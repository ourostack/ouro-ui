import { type AgentCase, notAssignable } from "./shared.ts";

/** The error for text children where `children` is a hint type. */
const childText = (component: string, fix: string) =>
  `error TS2747: '${component}' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ '${fix}': never; } | undefined'.`;

/** The navigation-menu snippets in navigation-menu.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "navigationMenu01",
    habit: "Base UI's orientation on NavigationMenu",
    tsc: [notAssignable("string", `{ "Use <Sidebar> for a column of links": never; }`)],
    dev: "<Sidebar> for a column of links",
    names: ["tsc", "dev"],
  },
  {
    id: "navigationMenu02",
    habit: "the router's pathname on NavigationMenu",
    tsc: [notAssignable("string", `{ "Use <NavigationMenu currentPath={pathname}>": never; }`)],
    dev: "<NavigationMenu currentPath={pathname}>",
    names: ["tsc", "dev"],
  },
  {
    id: "navigationMenu03",
    habit: "shadcn's navigation menu parts as children",
    tsc: [childText("NavigationMenu", 'Use items={[{ label: "Recipes", links: [...] }, { label: "Pricing", href: "/pricing" }]}')],
    dev: '<NavigationMenu label="Main" items={[{ label: "Recipes", links: [{ label: "Browse", href: "/recipes" }] }, { label: "Pricing", href: "/pricing" }]} />',
    names: ["tsc", "dev"],
  },
];

/** Valid navigation-menu snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["navigationMenuOk01"];
