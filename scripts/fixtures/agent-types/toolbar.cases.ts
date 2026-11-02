import { type AgentCase, hint, notAssignable } from "./shared.ts";

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
  {
    id: "toolbar04",
    habit: "autoHide as a flag, with no time",
    tsc: [notAssignable("true", "number | (boolean & { 'Pass the milliseconds of rest: autoHide={3000}': never; }) | undefined")],
    dev: "<Toolbar autoHide={3000}>",
    names: ["tsc", "dev"],
  },
  {
    id: "toolbar05",
    habit: "a glass flag for the floating look",
    tsc: [hint("boolean", "Use <Toolbar floating>")],
    dev: "<Toolbar floating>",
    names: ["tsc", "dev"],
  },
  {
    id: "toolbar06",
    habit: "autoHideDuration, as other libraries name the delay",
    tsc: [hint("number", "Use <Toolbar autoHide={3000}>")],
    dev: "<Toolbar autoHide={3000}>",
    names: ["tsc", "dev"],
  },
  {
    id: "toolbar07",
    habit: "area for the element whose pointer moves bring the bar back",
    tsc: ["error TS2741: Property ''Use <Toolbar autoHideArea={stageRef}>'' is missing in type 'HTMLElement' but required in type '{ 'Use <Toolbar autoHideArea={stageRef}>': never; }'."],
    dev: "<Toolbar autoHide={3000} autoHideArea={stageRef}>",
    names: ["tsc", "dev"],
  },
];

/** Valid toolbar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["toolbarOk", "toolbarOk02", "toolbarOk03"];
