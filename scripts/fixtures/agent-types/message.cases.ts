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
];

/** Valid message snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["messageOk01"];
