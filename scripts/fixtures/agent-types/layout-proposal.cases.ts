import { type AgentCase, hint } from "./shared.ts";

/** The layout-proposal snippets in layout-proposal.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "layoutProposal01", habit: "an onAccept callback", tsc: [hint("() => void", "Use onApply={(id, event) => apply(id, event)}")], dev: "<LayoutProposal onApply={(id, event) => apply(id, event)}>", names: ["tsc", "dev"] },
  { id: "layoutProposal02", habit: "a note for the reason", tsc: [hint("string", 'Use reason="You open customer chats first."')], dev: '<LayoutProposal reason="You open customer chats first.">', names: ["tsc", "dev"] },
];

/** Valid layout-proposal snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["layoutProposalOk01"];
