import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The moment snippets in moment.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "moment01", habit: "a heading prop on Moment", tsc: [hint("string", 'Use <Moment title="No messages yet">')], dev: '<Moment title="No messages">', names: ["tsc", "dev"] },
  {
    id: "moment02",
    habit: "an info kind on Moment",
    tsc: [notAssignable('"info"', `"empty" | "loading" | "error" | "welcome" | "success" | (string & { 'Use "empty", "loading", "error", "welcome" or "success"; info is "empty"': never; }) | undefined`)],
    dev: '<Moment kind="empty">',
    names: ["tsc", "dev"],
  },
  { id: "moment03", habit: "onClose on Moment", tsc: [hint("() => void", "Use onDismiss={() => setOpen(false)}")], dev: "<Moment onDismiss={() => setOpen(false)}>", names: ["tsc", "dev"] },
];

/** Valid moment snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["moment04"];
