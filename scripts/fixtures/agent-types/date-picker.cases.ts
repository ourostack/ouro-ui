import { type AgentCase, hint } from "./shared.ts";

/** The date-picker snippets in date-picker.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "datePicker01", habit: "an input's onChange", tsc: [hint("(date: string) => void", "Use onValueChange={setDate}; it gets the ISO date")], dev: "<DatePicker onValueChange={setDate}>", names: ["tsc", "dev"] },
  { id: "datePicker02", habit: "react-datepicker's dateFormat", tsc: [hint("string", 'The locale sets it: locale="en-GB"')], dev: '<DatePicker locale="en-GB">', names: ["tsc", "dev"] },
  { id: "datePicker03", habit: "MUI's helperText", tsc: [hint("string", 'Use <DatePicker description="...">')], dev: '<DatePicker description="Weekdays only.">', names: ["tsc", "dev"] },
];

/** Valid date-picker snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["datePickerOk01"];
