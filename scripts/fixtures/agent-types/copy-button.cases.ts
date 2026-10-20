import { type AgentCase, hint } from "./shared.ts";

/** The copy-button snippets in copy-button.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "copyButton01", habit: "a text prop for the value", tsc: [hint("string", "Use <CopyButton value={text} />")], dev: "<CopyButton value={text} />", names: ["tsc", "dev"] },
  {
    id: "copyButton02",
    habit: "the label as children",
    tsc: [
      `error TS2747: 'CopyButton' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'Use <CopyButton value={text} label="Copy link" />': never; } | undefined'.`,
    ],
    dev: '<CopyButton value={text} label="Copy key" />',
    names: ["tsc", "dev"],
  },
];

/** Valid copy-button snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["copyButtonOk01"];
