import { type AgentCase, hint } from "./shared.ts";

/** The draft-review snippets in draft-review.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "draftReview01",
    habit: "an onApprove callback for accepting",
    tsc: [hint("() => void", "Use onAccept={(id) => accept(id)}, and actions for a whole-draft Approve")],
    dev: "<DraftReview onAccept={(id) => accept(id)}>",
    names: ["tsc", "dev"],
  },
];

/** Valid draft-review snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["draftReviewOk01"];
