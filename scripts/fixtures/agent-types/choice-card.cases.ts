import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The choice-card snippets in choice-card.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "choiceCard01", habit: "label for the group's name", tsc: [hint("string", 'Use <ChoiceCard legend="Cover photo" />')], dev: '<ChoiceCard legend="Plan" />', names: ["tsc", "dev"] },
  { id: "choiceCard02", habit: "more columns than a row holds", tsc: [notAssignable("5", `2 | 3 | 4 | (number & { 'Use 2, 3 or 4': never; }) | undefined`)], dev: "<ChoiceCard columns={3} />", names: ["tsc", "dev"] },
];

/** Valid choice-card snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["choiceCardOk01"];
