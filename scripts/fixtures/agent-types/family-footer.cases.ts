import { type AgentCase, hint } from "./shared.ts";

/** The family-footer snippets in family-footer.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "familyFooter01", habit: "a path for the current site, as Navbar takes", tsc: [hint("string", 'Use <FamilyFooter current="docs">, the id of the site shown')], dev: '<FamilyFooter current="docs">', names: ["tsc", "dev"] },
];

/** Valid family-footer snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["familyFooterOk01"];
