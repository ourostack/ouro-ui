import { type AgentCase, notAssignable, hint } from "./shared.ts";

const orientations = `"horizontal" | "vertical" | (string & { 'Use "horizontal" or "vertical"': never; }) | undefined`;

/** The separator snippets in separator.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "separator01", habit: "a vertical boolean", tsc: [hint("boolean", 'Use <Separator orientation="vertical" />')], dev: '<Separator orientation="vertical" />', names: ["tsc", "dev"] },
  { id: "separator02", habit: "a flex direction as orientation", tsc: [notAssignable('"column"', orientations)], dev: '<Separator orientation="vertical" />', names: ["tsc", "dev"] },
  { id: "separator03", habit: "the label as children", tsc: [
      `error TS2747: 'Separator' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'Use <Separator label="or" />': never; } | undefined'.`,
    ], dev: '<Separator label="or" />', names: ["tsc", "dev"] },
];

/** Valid separator snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["separatorOk01", "separatorOk02"];
