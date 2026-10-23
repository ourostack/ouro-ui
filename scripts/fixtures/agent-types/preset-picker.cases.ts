import { type AgentCase, hint } from "./shared.ts";

/** The preset-picker snippets in preset-picker.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "presetPicker01", habit: "a current prop for the preset in use", tsc: [hint("string", "Use value={current}")], dev: "<PresetPicker value={current}>", names: ["tsc", "dev"] },
  { id: "presetPicker02", habit: "an onSelect callback", tsc: [hint("() => void", "Use onValueChange={(value) => use(value)}")], dev: "<PresetPicker onValueChange={(value) => use(value)}>", names: ["tsc", "dev"] },
];

/** Valid preset-picker snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["presetPickerOk01"];
