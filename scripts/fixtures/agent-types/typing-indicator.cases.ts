import { type AgentCase, hint } from "./shared.ts";

/** The typing-indicator snippets in typing-indicator.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "typingIndicator01",
    habit: "users for who is writing",
    tsc: [
      `error TS2741: Property ''Use people={[{ name, src }]}'' is missing in type '{ name: string; }[]' but required in type '{ 'Use people={[{ name, src }]}': never; }'.`,
    ],
    dev: '<TypingIndicator people={[{ name: "Ned Land", src: ned }]} />',
    names: ["tsc", "dev"],
  },
  { id: "typingIndicator02", habit: "a visible flag", tsc: [hint("boolean", "It shows while people has anyone in it")], dev: "<TypingIndicator people={writing ? [ned] : []} />", names: ["tsc", "dev"] },
];

/** Valid typing-indicator snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["typingIndicatorOk01"];
