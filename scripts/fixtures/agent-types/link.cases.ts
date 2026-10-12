import { type AgentCase, tones, notAssignable, hint } from "./shared.ts";

/** The link snippets in link.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "s40", habit: "React Router's to", tsc: [hint("string", 'Use <Link href="/recipes">')], dev: '<Link href="/recipes">', names: ["tsc", "dev"] },
  { id: "s41", habit: "Chakra's isExternal", tsc: [hint("boolean", 'Use <Link href="https://..." external>')], dev: '<Link href="https://…" external>', names: ["tsc", "dev"] },
  { id: "s42", habit: "a danger tone on Link", tsc: [notAssignable('"danger"', tones)], dev: '<Link tone="destructive">', names: ["tsc", "dev"] },
];

/** Valid link snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok10"];
