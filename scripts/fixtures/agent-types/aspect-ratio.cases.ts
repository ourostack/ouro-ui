import { type AgentCase, notAssignable } from "./shared.ts";

/** The aspect-ratio snippets in aspect-ratio.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "aspectRatio01",
    habit: "a ratio as a string",
    tsc: [notAssignable("string", `number | (string & { "Use a number: ratio={16 / 9}": never; })`)],
    dev: "<AspectRatio ratio={16 / 9}>",
    names: ["tsc", "dev"],
  },
  {
    id: "aspectRatio02",
    habit: "an aspectRatio prop",
    tsc: [notAssignable("number", `{ "Use <AspectRatio ratio={16 / 9}>": never; }`)],
    dev: "<AspectRatio ratio={1.5}>",
    names: ["tsc", "dev"],
  },
];

/** Valid aspect-ratio snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["aspectRatio03"];
