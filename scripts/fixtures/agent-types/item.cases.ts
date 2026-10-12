import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The item snippets in item.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "item01", habit: "a subtitle on Item", tsc: [hint("string", 'Use <Item description="Four hours">')], dev: '<Item description="Four hours">', names: ["tsc", "dev"] },
  {
    id: "item02",
    habit: "an icon prop on Item",
    tsc: [
      `error TS2741: Property ''Use <Item media={<Icon />} mediaSize="icon">'' is missing in type 'ReactElement<any, any>' but required in type '{ 'Use <Item media={<Icon />} mediaSize="icon">': never; }'.`,
    ],
    dev: '<Item media={<Icon />} mediaSize="icon">',
    names: ["tsc", "dev"],
  },
  { id: "item03", habit: "shadcn's ItemAction as a singular prop", tsc: [notAssignable("string", `{ "Use <Item actions={<Button>...</Button>}>": never; }`)], dev: "<Item actions={<Button>…</Button>}>", names: ["tsc", "dev"] },
  { id: "item04", habit: "a label in place of the title", tsc: [hint("string", 'Use <Item title="Braised short ribs">')], dev: '<Item title="Ribs">', names: ["tsc", "dev"] },
  {
    id: "item05",
    habit: "an xl media size",
    tsc: [notAssignable('"xl"', `ItemMediaSize | (string & { 'Use "icon", "sm" (40px), "md" (64px) or "lg" (112px)': never; }) | undefined`)],
    dev: '<Item mediaSize="lg">',
    names: ["tsc", "dev"],
  },
];

/** Valid item snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["item06", "item07"];
