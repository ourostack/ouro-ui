import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The draft-editor snippets in draft-editor.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "draftEditor01", habit: "a provenance prop for who wrote what", tsc: [hint("string", "Use segments={segments}")], dev: "<DraftEditor segments={segments}>", names: ["tsc", "dev"] },
  {
    id: "draftEditor02",
    habit: "a done readiness",
    tsc: [notAssignable('"done"', `"approved" | "drafting" | "needs-input" | "ready-for-review" | (string & { 'Use "drafting", "needs-input", "ready-for-review" or "approved"': never; }) | undefined`)],
    dev: '<DraftEditor readiness="ready-for-review">',
    names: ["tsc", "dev"],
  },
];

/** Valid draft-editor snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["draftEditorOk01"];
