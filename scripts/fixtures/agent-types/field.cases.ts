import { type AgentCase, hint } from "./shared.ts";

/** The field snippets in field.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "s32",
    habit: "htmlFor on Field",
    tsc: [hint("string", 'Field connects the label itself: <Field label="Email"><FieldControl /></Field>')],
    dev: '<Field label="Email"><FieldControl /></Field>',
    names: ["tsc", "dev"],
  },
  { id: "s33", habit: "an errorMessage prop", tsc: [hint("string", 'Use <Field error="Required.">')], dev: '<Field error="Required.">', names: ["tsc", "dev"] },
  { id: "s34", habit: "MUI's helperText", tsc: [hint("string", 'Use <Field description="...">')], dev: '<Field description="We never share it.">', names: ["tsc", "dev"] },
  { id: "s35", habit: "React Aria's or Chakra's isInvalid", tsc: [hint("boolean", 'Use <Field error="What is wrong">')], dev: '<Field error="What is wrong">', names: ["tsc", "dev"] },
  { id: "s36", habit: "React Aria's or Chakra's isRequired", tsc: [hint("boolean", "Use <Field required>")], dev: "<Field required>", names: ["tsc", "dev"] },
  { id: "s37", habit: "React Aria's or Chakra's isDisabled", tsc: [hint("boolean", "Use <Field disabled>")], dev: "<Field disabled>", names: ["tsc", "dev"] },
  {
    id: "s38",
    habit: "a placeholder as the label",
    tsc: [hint("string", 'Use label="Email"; a placeholder example goes on the control')],
    dev: '<Field label="Email"><FieldControl placeholder="you@example.com" /></Field>',
    names: ["tsc", "dev"],
  },
];

/** Valid field snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok08"];
