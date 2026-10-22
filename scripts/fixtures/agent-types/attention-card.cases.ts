import { type AgentCase, hint } from "./shared.ts";

/** The attention-card snippets in attention-card.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "attentionCard01",
    habit: "a text prop for the message",
    tsc: [hint("string", 'Use <AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>')],
    dev: '<AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>',
    names: ["tsc", "dev"],
  },
  { id: "attentionCard02", habit: "onClick to open the card", tsc: [hint("() => void", "Use onOpen={open}")], dev: "<AttentionCard onOpen={open}>", names: ["tsc", "dev"] },
];

/** Valid attention-card snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["attentionCardOk01"];
