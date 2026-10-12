import { type AgentCase, hint } from "./shared.ts";

/** The select snippets in select.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "select01", habit: "React Select's isMulti", tsc: [hint("boolean", "Use <Select multiple>")], dev: "<Select multiple>", names: ["tsc", "dev"] },
  {
    id: "select02",
    habit: "onChange for the chosen value",
    tsc: [hint("() => void", "Use onValueChange={(value) => ...}")],
    dev: "<Select onValueChange={(value) => setValue(value)}>",
    names: ["tsc", "dev"],
  },
  {
    id: "select03",
    habit: "Base UI's items",
    tsc: [
      `error TS2741: Property ''Use options={[{ value: "main", label: "Main" }]}'' is missing in type '{ value: string; label: string; }[]' but required in type '{ 'Use options={[{ value: "main", label: "Main" }]}': never; }'.`,
    ],
    dev: '<Select options={[{ value: "main", label: "Main" }]}>',
    names: ["tsc", "dev"],
  },
  {
    id: "select04",
    habit: "one string as a multiple select's value",
    tsc: [
      `error TS2322: Type '{ label: string; multiple: true; value: string; options: { value: string; label: string; }[]; }' is not assignable to type 'IntrinsicAttributes & SelectProps'.\n  Types of property 'value' are incompatible.\n    Type 'string' is not assignable to type 'string[]'.`,
    ],
    names: ["tsc"],
  },
];

/** Valid select snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["okSelect", "okSelectMultiple"];
