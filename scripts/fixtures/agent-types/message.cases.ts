import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The message snippets in message.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "message01",
    habit: "a chat API's { role, content } spread as props",
    tsc: [hint("string", 'Use <Message role="user" name="Ada">Hi</Message>')],
    dev: '<Message role="user" name="Ada">Hi</Message>',
    names: ["tsc", "dev"],
  },
  {
    id: "message02",
    habit: "a bot role",
    tsc: [notAssignable('"bot"', `MessageRole | (string & { 'Use "user", "assistant" or "system"': never; })`)],
    dev: '<Message role="assistant" name="Ouro">',
    names: ["tsc", "dev"],
  },
  {
    id: "message03",
    habit: "AI Elements' from",
    tsc: [hint("string", 'Use <Message role="user" name="Ada">')],
    dev: '<Message role="user" name="Ada">',
    names: ["tsc", "dev"],
  },
  {
    id: "message04",
    habit: "an own flag for the user's messages",
    tsc: [hint("boolean", 'Use <Message role="user" variant="chat">')],
    dev: '<Message role="user" variant="chat">',
    names: ["tsc", "dev"],
  },
  {
    id: "message05",
    habit: "a timestamp prop",
    tsc: [hint("string", 'Use <Message time="9:41 AM" dateTime={iso}>')],
    dev: '<Message time="9:41 AM" dateTime={iso}>',
    names: ["tsc", "dev"],
  },
  {
    id: "message06",
    habit: "a presence with no words for it",
    tsc: [
      `error TS2322: Type '{ children: string; variant: "chat"; role: "assistant"; name: string; presence: "busy"; }' is not assignable to type 'IntrinsicAttributes & MessageProps'.\n  Property 'presenceLabel' is missing in type '{ children: string; variant: "chat"; role: "assistant"; name: string; presence: "busy"; }' but required in type 'MessagePresenceProps'.`,
    ],
    dev: '<Message presence="busy" presenceLabel="Busy">',
    names: ["tsc", "dev"],
  },
  {
    id: "message07",
    habit: "replyTo for the message a reply quotes",
    tsc: [hint("string", 'Use <Message quote={{ author: "Ada", excerpt: "Lunch?" }}>')],
    dev: '<Message quote={{ author: "Ada", excerpt: "Lunch?" }}>',
    names: ["tsc", "dev"],
  },
  {
    id: "message08",
    habit: "a side for the action bar",
    tsc: [notAssignable('"right"', `MessageActionsPlacement | (string & { 'Use "corner" or "beside"': never; }) | undefined`)],
    dev: '<Message variant="chat" actionsPlacement="beside">',
    names: ["tsc", "dev"],
  },
  {
    id: "message09",
    habit: "a status for a message that did not send",
    tsc: [hint("string", 'Use <Message role="user" failed={{ onRetry: retry }}>')],
    dev: '<Message role="user" failed={{ onRetry: retry }}>',
    names: ["tsc", "dev"],
  },
];

/** Valid message snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["messageOk01", "messageOk02", "messageOk03", "messageOk04", "messageOk05", "messageOk06", "messageOk07"];
