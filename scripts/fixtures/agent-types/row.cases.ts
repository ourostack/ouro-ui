import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The row snippets in row.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "row01",
    habit: "a numeric gap on Row",
    tsc: [
      notAssignable(
        "number",
        `LayoutGap | (string & { 'Use "none", "xs", "sm", "md", "lg" or "xl"': never; }) | (number & { 'Use a name: gap="sm" is 8px': never; }) | undefined`,
      ),
    ],
    dev: '<Row gap="sm">',
    names: ["tsc", "dev"],
  },
  { id: "row02", habit: "CSS's justifyContent as a prop", tsc: [hint("string", 'Use <Row justify="between">')], dev: '<Row justify="between">', names: ["tsc", "dev"] },
  { id: "row03", habit: "a column direction on Row", tsc: [notAssignable("string", `{ "Use <Stack> for a vertical layout": never; }`)], dev: "<Stack>", names: ["tsc", "dev"] },
];

/** Valid row snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["row04"];
