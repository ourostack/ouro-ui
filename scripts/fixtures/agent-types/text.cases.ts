import { type AgentCase, tones, align, notAssignable, hint } from "./shared.ts";

/** The text snippets in text.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "s06",
    habit: "a danger tone on Text",
    tsc: [notAssignable('"danger"', tones.replace(" | undefined", ' | "default" | "muted" | undefined'))],
    dev: '<Text tone="destructive">',
    names: ["tsc", "dev"],
  },
  { id: "s07", habit: "a color prop on Text", tsc: [hint("string", 'Use <Text tone="muted">')], dev: '<Text tone="muted">', names: ["tsc", "dev"] },
  { id: "s08", habit: "MUI's or Chakra's Text variant", tsc: [hint("string", 'Use <Text size="sm" tone="muted">')], dev: '<Text size="sm" tone="muted">', names: ["tsc", "dev"] },
  {
    id: "s24",
    habit: "a left alignment on Text",
    tsc: [notAssignable('"left"', `TextAlign | ${align} | undefined`)],
    dev: '<Text align="start">',
    names: ["tsc", "dev"],
  },
  {
    id: "s26",
    habit: "a heading tag on Text",
    tsc: [notAssignable('"h2"', `"p" | "span" | "div" | (string & { 'Use "p", "span" or "div"; for a title use Heading': never; }) | undefined`)],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
  {
    id: "s27",
    habit: "an xl Text",
    tsc: [notAssignable('"xl"', `"sm" | "md" | "lg" | (string & { 'Use "sm", "md" or "lg"; for a title use Heading': never; }) | undefined`)],
    dev: "<Heading level={2}>",
    names: ["tsc", "dev"],
  },
];

/** Valid text snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok01", "ok02", "ok03"];
