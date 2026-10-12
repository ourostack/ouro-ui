import { type AgentCase, notAssignable, hint } from "./shared.ts";

const control = "<Popover open={open} onOpenChange={setOpen} anchor={buttonRef}>";

/** The popover snippets in popover.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "popover01", habit: "Floating UI's or Radix's placement", tsc: [hint("string", 'Use side="bottom" align="start"')], dev: '<Popover side="bottom" align="start">', names: ["tsc", "dev"] },
  {
    id: "popover02",
    habit: "a controlled popover with nothing to point at",
    tsc: [
      `error TS2322: Type '{ children: string; title: string; open: true; onOpenChange: (open: boolean) => void; }' is not assignable to type 'IntrinsicAttributes & PopoverProps'.\n  Property 'anchor' is missing in type '{ children: string; title: string; open: true; onOpenChange: (open: boolean) => void; }' but required in type '{ open: boolean; onOpenChange: (open: boolean) => void; anchor: RefObject<HTMLElement | null>; trigger?: never; }'.`,
    ],
    dev: control,
    names: ["tsc", "dev"],
  },
  {
    id: "popover03",
    habit: "a side that is not one",
    tsc: [notAssignable('"above"', `FloatingSide | (string & { 'Use "top", "bottom", "left" or "right"': never; }) | undefined`)],
    dev: '<Popover side="bottom">',
    names: ["tsc", "dev"],
  },
  {
    id: "popover04",
    habit: "a content prop for the body",
    tsc: [hint("string", 'Use children: <Popover title="..." trigger={...}>...</Popover>')],
    dev: '<Popover title="…" trigger={…}>…</Popover>',
    names: ["tsc", "dev"],
  },
];

/** Valid popover snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["popoverOk01"];
