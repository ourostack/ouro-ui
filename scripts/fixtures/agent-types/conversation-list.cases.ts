import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The conversation-list snippets in conversation-list.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "conversationList01", habit: "a select's value for the open row", tsc: [hint("string", "Use selectedId={openId}")], dev: "<ConversationList selectedId={openId}>", names: ["tsc", "dev"] },
  {
    id: "conversationList02",
    habit: "a density from another kit",
    tsc: [notAssignable('"cozy"', `ConversationListDensity | (string & { 'Use "comfortable" or "compact"': never; }) | undefined`)],
    dev: '<ConversationList density="compact">',
    names: ["tsc", "dev"],
  },
  {
    id: "conversationList03",
    habit: "groups for the sections",
    tsc: [
      "error TS2741: Property ''Use sections={sections}, and section on each item'' is missing in type '{ label: string; items: never[]; }[]' but required in type '{ 'Use sections={sections}, and section on each item': never; }'.",
    ],
    dev: '<ConversationList sections={[{ id: "pinned", title: "Pinned" }]} items={[{ ...row, section: "pinned" }]}>',
    names: ["tsc", "dev"],
  },
];

/** Valid conversation-list snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["conversationListOk01", "conversationListOk02"];
