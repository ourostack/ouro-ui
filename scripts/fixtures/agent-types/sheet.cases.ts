import { type AgentCase, notAssignable, hint } from "./shared.ts";

const sheetControl = "<Sheet open={open} onOpenChange={setOpen}>";

/** The sheet snippets in sheet.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "s12",
    habit: "isOpen and onClose",
    tsc: [hint("boolean", `Use ${sheetControl}`), hint("() => void", `Use ${sheetControl}`)],
    // Without onOpenChange the open-mode check throws first, with its own fix.
    dev: "Pass trigger={<Button>…</Button>} for an uncontrolled sheet, or open and onOpenChange to control it",
    names: ["tsc", "dev"],
  },
  {
    id: "s13",
    habit: "open without onOpenChange",
    tsc: [
      `error TS2322: Type '{ children: string; title: string; side: "bottom"; open: true; }' is not assignable to type 'IntrinsicAttributes & SheetProps'.\n  Property 'onOpenChange' is missing in type '{ children: string; title: string; side: "bottom"; open: true; }' but required in type '{ open: boolean; onOpenChange: (open: boolean) => void; trigger?: never; }'.`,
    ],
    dev: "Pass trigger={<Button>…</Button>} for an uncontrolled sheet, or open and onOpenChange to control it",
    names: ["tsc", "dev"],
  },
  {
    id: "s14",
    habit: "a side that is not one of the four",
    tsc: [notAssignable('"left-ish"', `SheetSide | (string & { 'Use "bottom", "top", "left" or "right"': never; }) | undefined`)],
    dev: '<Sheet side="bottom">',
    names: ["tsc", "dev"],
  },
  {
    id: "s30",
    habit: "a side that is not one of the four, on the SheetRoot part",
    tsc: [notAssignable('"left-ish"', `SheetSide | (string & { 'Use "bottom", "top", "left" or "right"': never; }) | undefined`)],
    dev: '<SheetRoot side="bottom">',
    names: ["tsc", "dev"],
  },
];

/** Valid sheet snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = [];
