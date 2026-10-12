import { type AgentCase, notAssignable } from "./shared.ts";

/** The error for an array passed to a hint type: the hint's key is the property it lacks. */
const missing = (value: string, fix: string) => `error TS2741: Property ''${fix}'' is missing in type '${value}' but required in type '{ '${fix}': never; }'.`;

/** The navbar snippets in navbar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "navbar01",
    habit: "a links prop on Navbar",
    tsc: [missing("{ label: string; href: string; }[]", 'Use <Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]} />')],
    dev: '<Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]} />',
    names: ["tsc", "dev"],
  },
  { id: "navbar02", habit: "a logo prop on Navbar", tsc: [notAssignable("string", `{ "Use <Navbar brand={<Logo />}>": never; }`)], dev: "<Navbar brand={<Logo />}>", names: ["tsc", "dev"] },
  {
    id: "navbar03",
    habit: "the router's pathname on Navbar",
    tsc: [notAssignable("string", `{ "Use <Navbar currentPath={pathname}>": never; }`)],
    dev: "<Navbar currentPath={pathname}>",
    names: ["tsc", "dev"],
  },
];

/** Valid navbar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["navbarOk01"];
