import { type AgentCase, hint } from "./shared.ts";

/** An array where a hint type stands: the compiler says the hint is missing from it. */
const missing = (value: string, fix: string) => `error TS2741: Property ''${fix}'' is missing in type '${value}' but required in type '{ '${fix}': never; }'.`;

/** The app-window snippets in app-window.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "appWindow01", habit: "a uses prop for the components it is built with", tsc: [missing("string[]", 'Use builtWith={["Button", "Checklist"]}')], dev: '<AppWindow builtWith={["Checklist"]} />', names: ["tsc", "dev"] },
  { id: "appWindow02", habit: "a padded prop", tsc: [hint("boolean", "Use inset, or inset={false} for edge to edge")], dev: "<AppWindow inset={false} />", names: ["tsc", "dev"] },
];

/** Valid app-window snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["appWindowOk01"];
