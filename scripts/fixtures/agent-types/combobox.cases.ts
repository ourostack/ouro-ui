import { type AgentCase, hint } from "./shared.ts";

/** The combobox snippets in combobox.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "combobox01", habit: "React Select's or MUI's options", tsc: [`error TS2741: Property ''Use <Combobox items={["Basil", "Dill"]}>'' is missing in type 'string[]' but required in type '{ 'Use <Combobox items={["Basil", "Dill"]}>': never; }'.`], dev: "<Combobox items={[…]}>", names: ["tsc", "dev"] },
  { id: "combobox02", habit: "React Select's isMulti", tsc: [hint("boolean", "Use <Combobox multiple>")], dev: "<Combobox multiple>", names: ["tsc", "dev"] },
  { id: "combobox03", habit: "MUI Autocomplete's freeSolo", tsc: [hint("boolean", "Use <Combobox allowCustomValue>")], dev: "<Combobox allowCustomValue>", names: ["tsc", "dev"] },
  { id: "combobox04", habit: "an onSearch callback", tsc: [hint("() => void", "Use <Combobox onInputChange={(text) => ...}>")], dev: "<Combobox onInputChange={(text) => …}>", names: ["tsc", "dev"] },
  { id: "combobox05", habit: "React Select's isLoading", tsc: [hint("boolean", "Use <Combobox loading>")], dev: "<Combobox loading>", names: ["tsc", "dev"] },
];

/** Valid combobox snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["comboboxOk01", "comboboxOk02"];
