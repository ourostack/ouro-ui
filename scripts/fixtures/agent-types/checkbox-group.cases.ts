import { type AgentCase, hint } from "./shared.ts";

const items = `'Use options={[{ value: "basil", label: "Basil" }]}'`;

/** The checkbox-group snippets in checkbox-group.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "checkboxGroup01", habit: "a label on a group", tsc: [hint("string", 'Use <CheckboxGroup legend="Herbs">')], dev: '<CheckboxGroup legend="Herbs">', names: ["tsc", "dev"] },
  {
    id: "checkboxGroup02",
    habit: "an items prop for the choices",
    tsc: [`error TS2741: Property '${items}' is missing in type '{ value: string; label: string; }[]' but required in type '{ ${items}: never; }'.`],
    dev: '<CheckboxGroup options={[{ value: "basil", label: "Basil" }]}>',
    names: ["tsc", "dev"],
  },
];

/** Valid checkbox-group snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["checkboxGroupOk01"];
