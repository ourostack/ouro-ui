import { type AgentCase, hint } from "./shared.ts";

/** The skeleton snippets in skeleton.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "skeleton01", habit: "MUI's Skeleton variant", tsc: [hint("string", 'Use <Skeleton shape="circle">')], dev: '<Skeleton shape="circle">', names: ["tsc", "dev"] },
  { id: "skeleton02", habit: "MUI's Skeleton width", tsc: [hint("number", 'Use <Skeleton className="w-32">')], dev: '<Skeleton className="w-[120px]">', names: ["tsc", "dev"] },
];

/** Valid skeleton snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["skeletonValid"];
