import { type AgentCase, hint } from "./shared.ts";

/** The button-group snippets in button-group.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "buttonGroup01",
    habit: "MUI's variant on ButtonGroup",
    tsc: [hint("string", 'Set it on each Button: <Button variant="outline">')],
    dev: '<Button variant="outline">',
    names: ["tsc", "dev"],
  },
  {
    id: "buttonGroup02",
    habit: "Chakra's isAttached",
    tsc: [hint("boolean", "A ButtonGroup always joins its buttons")],
    dev: '<ButtonGroup label="Pages">',
    names: ["tsc", "dev"],
  },
];

/** Valid button-group snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["buttonGroupOk"];
