import { type AgentCase, notAssignable, hint } from "./shared.ts";

const textFieldTypes = `"text" | "email" | "password" | "tel" | "url" | "search" | "date" | "time" | (string & { 'number is <NumberField> (digit codes: inputMode="numeric"); a calendar or datetime-local is <DatePicker>; file is <FileField>': never; }) | undefined`;

/** The text-field snippets in text-field.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "s43",
    habit: "a number input",
    tsc: [notAssignable('"number"', textFieldTypes)],
    dev: '<NumberField label="Servings" />, or <TextField inputMode="numeric"> for digit codes',
    names: ["tsc", "dev"],
  },
  { id: "s44", habit: "MUI's helperText on TextField", tsc: [hint("string", 'Use <TextField description="...">')], dev: '<TextField description="We never share it.">', names: ["tsc", "dev"] },
  { id: "s45", habit: "a prefix prop", tsc: [hint("string", 'Use <TextField startAdornment="$">')], dev: '<TextField startAdornment="$">', names: ["tsc", "dev"] },
  { id: "s46", habit: "MUI's multiline", tsc: [hint("boolean", 'Use <TextArea label="Notes" autoGrow />')], dev: '<TextArea label="Notes" autoGrow />', names: ["tsc", "dev"] },
  { id: "s47", habit: "React Select's isClearable", tsc: [hint("boolean", "Use <TextField clearable>")], dev: "<TextField clearable>", names: ["tsc", "dev"] },
  {
    id: "s50",
    habit: "a placeholder as the label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ placeholder: string; }' but required in type 'TextFieldOwnProps'.`],
    dev: '<TextField label="Email" hideLabel> to hide a label you still need',
    names: ["tsc", "dev"],
  },
];

/** Valid text-field snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok11"];
