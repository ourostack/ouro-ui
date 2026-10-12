import { type AgentCase, hint } from "./shared.ts";

/** The toggle-group snippets in toggle-group.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "toggleGroup01",
    habit: "Radix's type=\"multiple\"",
    tsc: [hint("string", "Use <ToggleGroup multiple> for several; one at a time is the default")],
    dev: "<ToggleGroup multiple>",
    names: ["tsc", "dev"],
  },
  {
    id: "toggleGroup02",
    habit: "an options prop",
    tsc: [
      "error TS2741: Property ''Use <ToggleGroup items={[{ value, label }]}>'' is missing in type '{ value: string; label: string; }[]' but required in type '{ 'Use <ToggleGroup items={[{ value, label }]}>': never; }'.",
    ],
    dev: "<ToggleGroup items={[{ value, label }]}>",
    names: ["tsc", "dev"],
  },
];

/** Valid toggle-group snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["toggleGroupOk"];
