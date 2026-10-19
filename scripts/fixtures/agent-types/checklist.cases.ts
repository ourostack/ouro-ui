import { type AgentCase, hint } from "./shared.ts";

/** The checklist snippets in checklist.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "checklist01",
    habit: "React's onChange on a list of checkboxes",
    tsc: [hint("() => void", "Use onCheckedChange={(id, checked) => setChecked(id, checked)}")],
    dev: "<Checklist onCheckedChange={(id, checked) => setChecked(id, checked)}>",
    names: ["tsc", "dev"],
  },
  {
    id: "checklist02",
    habit: "onToggle for a todo row",
    tsc: [hint("() => void", "Use onCheckedChange={(id, checked) => setChecked(id, checked)}")],
    dev: "<Checklist onCheckedChange={(id, checked) => setChecked(id, checked)}>",
    names: ["tsc", "dev"],
  },
  { id: "checklist03", habit: "CheckboxGroup's legend for a checklist's name", tsc: [hint("string", 'Use <Checklist label="Ingredients">')], dev: '<Checklist label="Ingredients">', names: ["tsc", "dev"] },
];

/** Valid checklist snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["checklistOk01"];
