import { type AgentCase, hint } from "./shared.ts";

/** The message-list snippets in message-list.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "messageList01",
    habit: "a stick-to-bottom switch",
    tsc: [hint("boolean", 'Not a prop: the list follows new messages at the bottom. Use <MessageList label="Conversation">')],
    dev: '<MessageList label="Conversation">',
    names: ["tsc", "dev"],
  },
  {
    id: "messageList02",
    habit: "a list without a name",
    tsc: [`error TS2741: Property 'label' is missing in type '{ children: Element; }' but required in type 'MessageListOwnProps'.`],
    dev: '<MessageList label="Conversation">',
    names: ["tsc", "dev"],
  },
];

/** Valid message-list snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["messageListOk01", "messageListOk02"];
