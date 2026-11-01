import { type AgentCase, hint } from "./shared.ts";

/** The autocomplete snippets in autocomplete.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "autocomplete01",
    habit: "one trigger character as a prop",
    tsc: [hint("string", 'Use triggers={[{ char: "@", label: "People", items }]}')],
    dev: '<Autocomplete triggers={[{ char: "@", label: "People", items }]}>',
    names: ["tsc", "dev"],
  },
  {
    id: "autocomplete02",
    habit: "a trigger whose list has no name",
    tsc: ["error TS2741: Property 'label' is missing in type '{ char: string; items: { value: string; label: string; }[]; }' but required in type 'AutocompleteTrigger'."],
    names: ["tsc"],
  },
];

/** Valid autocomplete snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["autocompleteOk", "autocompleteOk02"];
