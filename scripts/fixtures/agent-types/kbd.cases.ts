import { type AgentCase, notAssignable, hint } from "./shared.ts";

const fix = '<Kbd keys={["mod", "k"]} />';

/** The kbd snippets in kbd.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "kbd01",
    habit: "shadcn's Kbd with the glyphs as children",
    tsc: [
      `error TS2747: 'Kbd' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'Use ${fix}': never; } | undefined'.`,
    ],
    dev: fix,
    names: ["tsc", "dev"],
  },
  {
    id: "kbd02",
    habit: "a shortcut string",
    tsc: [notAssignable("string", `readonly string[] | (string & { 'Use an array: keys={["mod", "k"]}': never; })`)],
    dev: fix,
    names: ["tsc", "dev"],
  },
  { id: "kbd03", habit: "a shortcut prop", tsc: [hint("string", `Use ${fix}`)], dev: fix, names: ["tsc", "dev"] },
];

/** Valid kbd snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["kbdOk01"];
