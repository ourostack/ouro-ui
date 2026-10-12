import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The stack snippets in stack.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "stack01",
    habit: "Chakra's or MUI's numeric spacing as gap",
    tsc: [
      notAssignable(
        "number",
        `LayoutGap | (string & { 'Use "none", "xs", "sm", "md", "lg" or "xl"': never; }) | (number & { 'Use a name: gap="md" is 16px': never; }) | undefined`,
      ),
    ],
    dev: '<Stack gap="md">',
    names: ["tsc", "dev"],
  },
  { id: "stack02", habit: "MUI's spacing prop", tsc: [hint("number", 'Use <Stack gap="sm">')], dev: '<Stack gap="sm">', names: ["tsc", "dev"] },
  { id: "stack03", habit: "a row direction on Stack", tsc: [notAssignable("string", `{ "Use <Row> for a horizontal layout": never; }`)], dev: "<Row>", names: ["tsc", "dev"] },
  {
    id: "stack04",
    habit: "a left alignment on Stack",
    tsc: [notAssignable('"left"', `StackAlign | (string & { 'Use "start", "center", "end" or "stretch": left is "start"': never; }) | undefined`)],
    dev: '<Stack align="start">',
    names: ["tsc", "dev"],
  },
  ...(
    [
      ["stack06", "a hand-written gap class", '<Stack gap="md">'],
      ["stack07", "flex-row to make a Stack horizontal", "<Row>"],
      ["stack08", "items-center in className", '<Stack align="center">'],
      ["stack09", "justify-between in className", '<Stack justify="between">'],
    ] as const
  ).map(
    ([id, habit, dev]): AgentCase => ({ id, habit, tsc: [], hover: { prop: "className", doc: "use `gap`, `align`" }, dev, names: ["hover", "dev"] }),
  ),
];

/** Valid stack snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["stack05"];
