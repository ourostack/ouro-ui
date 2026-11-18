import { type AgentCase, hint, notAssignable } from "./shared.ts";

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
  { id: "checklist04", habit: "a sequential flag for steps done in order", tsc: [hint("boolean", "Use <Checklist ordered>")], dev: "<Checklist ordered>", names: ["tsc", "dev"] },
  { id: "checklist05", habit: "a card look by name", tsc: [notAssignable('"card"', `ChecklistVariant | (string & { 'Use "plain" or "outline"': never; }) | undefined`)], dev: '<Checklist variant="outline">', names: ["tsc", "dev"] },
  { id: "checklist06", habit: "an icon field for a row's picture", tsc: ["error TS2741: Property ''Use media: <Icon />'' is missing in type 'ReactElement<any, any>' but required in type '{ 'Use media: <Icon />': never; }'."], dev: 'items={[{ id: "boil", label: "Boil the water", media: <KettleIcon />, checked: false }]}', names: ["tsc", "dev"] },
];

/** Valid checklist snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["checklistOk01", "checklistOk02", "checklistOk03"];
