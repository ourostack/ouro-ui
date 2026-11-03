import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The skeleton snippets in skeleton.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "skeleton01", habit: "MUI's Skeleton variant", tsc: [hint("string", 'Use <Skeleton shape="circle">')], dev: '<Skeleton shape="circle">', names: ["tsc", "dev"] },
  { id: "skeleton02", habit: "MUI's Skeleton width", tsc: [hint("number", 'Use <Skeleton className="w-32">')], dev: '<Skeleton className="w-[120px]">', names: ["tsc", "dev"] },
  {
    id: "skeleton03",
    habit: "an avatar shape",
    tsc: [notAssignable('"avatar"', '"rect" | "text" | "circle" | "row" | "card"')],
    dev: '<Skeleton shape="circle">',
    names: ["dev"],
    hoverLost:
      'no shape is "avatar", so no branch holds the prop; a hint member on shape would leave the shapes undiscriminated, and a lone shape="text" would lose its hover in valid code (AGENTS.md rule 6)',
  },
];

/** Valid skeleton snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["skeletonValid", "skeletonValidRows", "skeletonValidText"];
