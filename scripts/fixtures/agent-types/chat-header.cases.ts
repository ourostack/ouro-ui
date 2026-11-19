import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The chat-header snippets in chat-header.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "chatHeader01",
    habit: "participants for the chat's people",
    tsc: [
      `error TS2741: Property ''Use members={[{ name, src }]}'' is missing in type '{ name: string; }[]' but required in type '{ 'Use members={[{ name, src }]}': never; }'.`,
    ],
    dev: '<ChatHeader title="Crew" members={[{ name: "Ana Lind", src: ana }]} />',
    names: ["tsc", "dev"],
  },
  { id: "chatHeader02", habit: "a description under the title", tsc: [hint("string", 'Use subtitle="..."')], dev: '<ChatHeader subtitle="Planning the voyage" />', names: ["tsc", "dev"] },
  { id: "chatHeader03", habit: "a deeper heading level", tsc: [notAssignable("4", `1 | 2 | 3 | (number & { 'Use 1, 2 or 3': never; }) | undefined`)], dev: "<ChatHeader level={2} />", names: ["tsc", "dev"] },
  { id: "chatHeader04", habit: "a chat with no one in it", tsc: [], dev: '<ChatHeader title="Crew" members={[{ name: "Crew" }]} />', names: ["dev"] },
];

/** Valid chat-header snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["chatHeaderOk01"];
