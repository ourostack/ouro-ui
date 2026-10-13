import { type AgentCase, hint } from "./shared.ts";

/** The radio-group snippets in radio-group.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "radioGroup01", habit: "a label on a group", tsc: [hint("string", 'Use <RadioGroup legend="Size">')], dev: '<RadioGroup legend="Size">', names: ["tsc", "dev"] },
  { id: "radioGroup02", habit: "React's onChange on a radio group", tsc: [hint("() => void", "Use onValueChange={setValue}")], dev: "<RadioGroup onValueChange={(value) => setValue(value)}>", names: ["tsc", "dev"] },
  { id: "radioGroup03", habit: "checked on one radio", tsc: [hint("boolean", 'Use <RadioGroup value="small">')], dev: '<RadioGroup value="small">', names: ["tsc", "dev"] },
];

/** Valid radio-group snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["radioGroupOk01"];
