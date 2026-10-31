import { type AgentCase, notAssignable } from "./shared.ts";

/** The navigation-rail snippets in navigation-rail.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "navigationRail01",
    habit: "the router's pathname on NavigationRail",
    tsc: [notAssignable("string", `{ "Use <NavigationRail currentPath={pathname}>": never; }`)],
    dev: "<NavigationRail currentPath={pathname}>",
    names: ["tsc", "dev"],
  },
  {
    id: "navigationRail02",
    habit: "a badge on a rail item",
    tsc: [
      "error TS2322: Type '{ label: string; href: string; icon: JSX.Element; badge: number; }' is not assignable to type 'NavigationRailEntry'.\n" +
        "  Types of property 'badge' are incompatible.\n" +
        `    Type 'number' is not assignable to type '{ "Use count={3}": never; }'.`,
    ],
    dev: '{ label: "Chat", count: 3 }',
    names: ["tsc", "dev"],
  },
  {
    id: "navigationRail03",
    habit: "a selected id on the rail",
    tsc: [notAssignable("string", `{ "Use current: true on the item, and onClick to switch views": never; }`)],
    dev: '{ label: "Chat", onClick: () => setView("chat"), current: view === "chat" }',
    names: ["tsc", "dev"],
  },
];

/** Valid navigation-rail snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["navigationRailOk01"];
