import { type AgentCase, hint } from "./shared.ts";

/** The composer snippets in composer.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "composer01",
    habit: "onSubmit for sending",
    tsc: [hint("() => void", "Use <Composer onSend={(text) => send(text)}>")],
    dev: "<Composer onSend={(text) => send(text)}>",
    names: ["tsc", "dev"],
  },
  {
    id: "composer02",
    habit: "submitOnEnter for the send key",
    tsc: [hint("boolean", 'Use <Composer sendOn="enter"> or sendOn="mod-enter"')],
    dev: '<Composer sendOn="enter">',
    names: ["tsc", "dev"],
  },
  {
    id: "composer03",
    habit: "loading while it sends",
    tsc: [hint("boolean", "Use <Composer sending>")],
    dev: "<Composer sending>",
    names: ["tsc", "dev"],
  },
  {
    id: "composer04",
    habit: "sendDisabled with no reason",
    tsc: [hint("boolean", 'Use <Composer sendDisabledReason="Sending is off">')],
    dev: '<Composer sendDisabledReason="Sending is off">',
    names: ["tsc", "dev"],
  },
  {
    id: "composer05",
    habit: "replyTo for the message a reply quotes",
    tsc: [hint("string", 'Use <Composer quote={{ author: "Ada", excerpt: "Lunch?", onRemove }}>')],
    dev: '<Composer quote={{ author: "Ada", excerpt: "Lunch?", onRemove }}>',
    names: ["tsc", "dev"],
  },
];

/** Valid composer snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["composerOk01", "composerOk02"];
