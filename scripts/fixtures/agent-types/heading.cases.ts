import { type AgentCase, align, notAssignable, hint } from "./shared.ts";

/** The heading snippets in heading.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "s09",
    habit: "a Heading with no level",
    tsc: [
      `error TS2741: Property 'level' is missing in type '{ children: string; align: "center"; }' but required in type 'HeadingProps'.`,
    ],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
  {
    id: "s10",
    habit: "a 3xl Heading",
    tsc: [notAssignable('"3xl"', `HeadingSize | (string & { 'Use "sm", "md", "lg", "xl", "2xl" or, larger, "display"': never; }) | undefined`)],
    hover: { prop: "size", doc: "`display` is the hero headline" },
    dev: '<Heading level={1} size="display">',
    names: ["tsc", "hover", "dev"],
  },
  { id: "s11", habit: "a polymorphic as", tsc: [hint("string", "Use <Heading level={2}>")], dev: "<Heading level={2}>", names: ["tsc", "dev"] },
  { id: "s23", habit: "a color on Heading", tsc: [hint("string", 'Use <Text tone="primary">')], dev: '<Text tone="destructive">', names: ["tsc", "dev"] },
  {
    id: "s25",
    habit: "a left alignment on Heading",
    tsc: [notAssignable('"left"', `TextAlign | ${align} | undefined`)],
    dev: '<Heading align="start">',
    names: ["tsc", "dev"],
  },
  {
    id: "s28",
    habit: "a level past 6",
    tsc: [notAssignable("7", `1 | 2 | 3 | 4 | 5 | 6 | (number & { 'Use 1 to 6; size sets the look': never; })`)],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
];

/** Valid heading snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok05"];
