import { type AgentCase, hint } from "./shared.ts";

const fix = '<FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }]} />';

/** The family-bar snippets in family-bar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "familyBar01", habit: "a path for the current site, as Navbar takes", tsc: [hint("string", 'Use <FamilyBar current="docs">, the id of the site shown')], dev: '<FamilyBar current="docs">', names: ["tsc", "dev"] },
  {
    id: "familyBar02",
    habit: "an items prop, as Navbar takes",
    tsc: [`error TS2741: Property ''Use ${fix}'' is missing in type '{ id: string; label: string; href: string; }[]' but required in type '{ 'Use ${fix}': never; }'.`],
    dev: fix,
    names: ["tsc", "dev"],
  },
  {
    id: "familyBar03",
    habit: "the links as children",
    tsc: [
      `error TS2747: 'FamilyBar' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ "Use links={[{ id, label, href }]} and brand={...}": never; } | undefined'.`,
    ],
    dev: fix,
    names: ["tsc", "dev"],
  },
];

/** Valid family-bar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["familyBarOk01"];
