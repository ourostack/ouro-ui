import type { AgentCase } from "./shared.ts";

/** The thread-layout snippets in thread-layout.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "threadLayout01",
    habit: "a rail prop for the thread",
    tsc: ["error TS2741: Property '\"Pass the ThreadRail as thread, or null when closed\"' is missing in type 'ReactElement<any, any>' but required in type '{ \"Pass the ThreadRail as thread, or null when closed\": never; }'."],
    dev: '<ThreadLayout conversation={list} thread={open ? <ThreadRail label="Thread" onClose={close} /> : null} />',
    names: ["tsc", "dev"],
  },
  {
    id: "threadLayout02",
    habit: "a layout with no conversation",
    tsc: ["error TS2741: Property 'conversation' is missing in type '{ thread: Element; }' but required in type 'ThreadLayoutProps'."],
    names: ["tsc"],
  },
  {
    id: "threadLayout03",
    habit: "a background colour in className",
    tsc: [],
    hover: { prop: "className", doc: "Appearance classes warn in development" },
    dev: 'remove "bg-red-500"; the theme sets the colors of the panes ThreadLayout holds',
    names: ["hover", "dev"],
  },
];

/** Valid thread-layout snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["threadLayoutOk01", "threadLayoutOk02"];
