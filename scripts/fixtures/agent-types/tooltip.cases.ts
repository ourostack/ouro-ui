import { type AgentCase, hint } from "./shared.ts";

/** The tooltip snippets in tooltip.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "tooltip01",
    habit: "Radix's delayDuration",
    tsc: ['error TS2322: Type \'number\' is not assignable to type \'{ "Ouro UI sets the delay; wrap the app in <OuroProvider> to group tooltips": never; }\'.'],
    dev: "<OuroProvider><App /></OuroProvider>",
    names: ["tsc", "dev"],
  },
  {
    id: "tooltip02",
    habit: "Radix's asChild",
    tsc: [hint("boolean", 'The child is the trigger: <Tooltip content="..."><Button>...</Button></Tooltip>')],
    dev: '<Tooltip content="…"><Button>…</Button></Tooltip>',
    names: ["tsc", "dev"],
  },
  { id: "tooltip03", habit: "the HTML title attribute for the text", tsc: [hint("string", 'Use <Tooltip content="...">')], dev: '<Tooltip content="…">', names: ["tsc", "dev"] },
];

/** Valid tooltip snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["tooltipOk01"];
