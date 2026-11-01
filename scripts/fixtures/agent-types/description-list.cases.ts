import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The description-list snippets in description-list.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "descriptionList01",
    habit: "label and value in place of term and details",
    tsc: [hint("string", 'Use term: "Prep time"'), hint("string", 'Use details: "20 minutes"')],
    dev: '{ term: "Prep time", details: … }',
    names: ["tsc", "dev"],
  },
  {
    id: "descriptionList02",
    habit: "a data prop in place of items",
    tsc: [
      `error TS2741: Property '"Use items={[{ term: ..., details: ... }]}"' is missing in type '{ term: string; details: string; }[]' but required in type '{ "Use items={[{ term: ..., details: ... }]}": never; }'.`,
    ],
    dev: "<DescriptionList items={[{ term: …, details: … }]}>",
    names: ["tsc", "dev"],
  },
  {
    id: "descriptionList03",
    habit: "an lg breakpoint",
    tsc: [notAssignable('"lg"', `"sm" | "md" | (string & { 'Use "sm" (448px) or "md" (512px)': never; }) | undefined`)],
    dev: '<DescriptionList stackBelow="sm">',
    names: ["tsc", "dev"],
  },
];

/** Valid description-list snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["descriptionList04"];
