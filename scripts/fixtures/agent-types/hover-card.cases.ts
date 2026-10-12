import { type AgentCase, align, notAssignable } from "./shared.ts";

/** The hover card snippets in hover-card.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "hoverCard01",
    habit: "Radix's openDelay",
    tsc: ['error TS2322: Type \'number\' is not assignable to type \'{ "Ouro UI sets the delays": never; }\'.'],
    dev: "<HoverCard trigger={…}>",
    names: ["tsc", "dev"],
  },
  { id: "hoverCard02", habit: "left for start", tsc: [notAssignable('"left"', `FloatingAlign | ${align} | undefined`)], dev: '<HoverCard align="start">', names: ["tsc", "dev"] },
];

/** Valid hover card snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["hoverCardOk01"];
