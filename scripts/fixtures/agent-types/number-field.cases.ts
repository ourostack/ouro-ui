import { type AgentCase, hint } from "./shared.ts";

/** The number-field snippets in number-field.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "numberField01", habit: "React Aria's minValue", tsc: [hint("number", "Use <NumberField min={1}>")], dev: "<NumberField min={1}>", names: ["tsc", "dev"] },
  {
    id: "numberField02",
    habit: "React Aria's formatOptions",
    tsc: [`error TS2353: Object literal may only specify known properties, and 'style' does not exist in type '{ 'Use <NumberField format={{ style: "percent" }}>': never; }'.`],
    dev: '<NumberField format={{ style: "currency", currency: "USD" }}>',
    names: ["tsc", "dev"],
  },
  { id: "numberField03", habit: "a precision prop", tsc: [hint("number", "Use <NumberField format={{ maximumFractionDigits: 2 }}>")], dev: "<NumberField format={{ maximumFractionDigits: 2 }}>", names: ["tsc", "dev"] },
  { id: "numberField04", habit: 'type="number" from an input', tsc: [hint("string", "NumberField is always a number; for text use <TextField>")], dev: '<NumberField label="Servings">', names: ["tsc", "dev"] },
];

/** Valid number-field snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["numberFieldOk01"];
