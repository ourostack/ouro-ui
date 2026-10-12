import { type AgentCase, hint } from "./shared.ts";

/** The native-select snippets in native-select.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "nativeSelect01",
    habit: "a native multiple select",
    tsc: [hint("boolean", "Use <Select multiple>")],
    dev: '<Select label="Countries" multiple options={options} />',
    names: ["tsc", "dev"],
  },
  { id: "nativeSelect02", habit: "MUI's helperText", tsc: [hint("string", 'Use <NativeSelect description="...">')], dev: '<NativeSelect description="', names: ["tsc", "dev"] },
];

/** Valid native-select snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["okNativeSelect"];
