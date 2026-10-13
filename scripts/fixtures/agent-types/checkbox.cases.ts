import { type AgentCase, hint } from "./shared.ts";

/** The checkbox snippets in checkbox.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "checkbox01", habit: "React's onChange on a checkbox", tsc: [hint("() => void", "Use onCheckedChange={setChecked}")], dev: "<Checkbox onCheckedChange={(checked) => setChecked(checked)}>", names: ["tsc", "dev"] },
  { id: "checkbox02", habit: "Chakra's isChecked", tsc: [hint("boolean", "Use <Checkbox checked={agreed}>")], dev: "<Checkbox checked={true}>", names: ["tsc", "dev"] },
  { id: "checkbox03", habit: "defaultValue for a checkbox's starting state", tsc: [hint("boolean", "Use <Checkbox defaultChecked>")], dev: "<Checkbox defaultChecked>", names: ["tsc", "dev"] },
];

/** Valid checkbox snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["checkboxOk01"];
