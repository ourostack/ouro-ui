import { type AgentCase, tones, notAssignable, hint } from "./shared.ts";

const variants = `"solid" | "soft" | "outline" | (string & { 'From shadcn? secondary and destructive are tones; default is tone="primary"; ghost is "soft"': never; }) | undefined`;

/** The badge snippets in badge.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "badge01", habit: "shadcn's destructive variant", tsc: [notAssignable('"destructive"', variants)], dev: '<Badge tone="destructive">', names: ["tsc", "dev"] },
  { id: "badge02", habit: "shadcn's secondary variant", tsc: [notAssignable('"secondary"', variants)], dev: '<Badge tone="secondary">', names: ["tsc", "dev"] },
  { id: "badge03", habit: "a danger tone on Badge", tsc: [notAssignable('"danger"', tones)], dev: '<Badge tone="destructive">', names: ["tsc", "dev"] },
  { id: "badge04", habit: "Radix's asChild on Badge", tsc: [hint("boolean", 'Use <Badge href="/path">')], dev: '<Badge href="/path">', names: ["tsc", "dev"] },
  { id: "badge05", habit: "Catalyst's color on Badge", tsc: [hint("string", 'Use <Badge tone="destructive">')], dev: '<Badge tone="warning">', names: ["tsc", "dev"] },
];

/** Valid badge snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["badgeOk01", "badgeOk02", "badgeOk03"];
