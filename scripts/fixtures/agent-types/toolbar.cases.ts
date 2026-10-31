import { type AgentCase, hint } from "./shared.ts";

/** The toolbar snippets in toolbar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "toolbar01",
    habit: "a vertical toolbar",
    tsc: [hint("string", "A Toolbar is a row; what does not fit moves into its More menu")],
    dev: '<Toolbar label="Formatting" items={…}>',
    names: ["tsc", "dev"],
  },
  {
    id: "toolbar02",
    habit: "a shortcut written as one string",
    tsc: ["error TS2322: Type 'string' is not assignable to type 'ToolbarShortcut | undefined'."],
    dev: '{ shortcut: ["mod", "b"] }',
    names: ["dev"],
  },
  {
    id: "toolbar03",
    habit: "a toolbar with no name",
    tsc: ["error TS2741: Property 'label' is missing in type '{ items: { label: string; }[]; }' but required in type 'ToolbarProps'."],
    names: ["tsc"],
  },
];

/** Valid toolbar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["toolbarOk"];
