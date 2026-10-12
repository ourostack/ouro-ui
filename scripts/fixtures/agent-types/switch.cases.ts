import { type AgentCase, hint } from "./shared.ts";

/** The switch snippets in switch.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "switch01", habit: "React's onChange on a switch", tsc: [hint("() => void", "Use onCheckedChange={setChecked}")], dev: "<Switch onCheckedChange={(checked) => setOn(checked)}>", names: ["tsc", "dev"] },
  { id: "switch02", habit: "Chakra's isChecked", tsc: [hint("boolean", "Use <Switch checked={on}>")], dev: "<Switch checked={true}>", names: ["tsc", "dev"] },
];

/** Valid switch snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["switchOk01"];
