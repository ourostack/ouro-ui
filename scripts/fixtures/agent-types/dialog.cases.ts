import { type AgentCase, notAssignable, hint } from "./shared.ts";

const dialogControl = "<Dialog open={open} onOpenChange={setOpen}>";

/** The dialog snippets in dialog.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "s15",
    habit: "hideTitle without a title",
    tsc: [
      `error TS2322: Type '{ children: string; hideTitle: true; trigger: Element; }' is not assignable to type 'IntrinsicAttributes & DialogProps'.\n  Property 'title' is missing in type '{ children: string; hideTitle: true; trigger: Element; }' but required in type 'DialogBaseProps'.`,
    ],
    names: ["tsc"],
  },
  { id: "s16", habit: "shadcn's or Radix's onClose", tsc: [hint("() => void", `Use ${dialogControl}`)], dev: "Pass trigger={<Button>…</Button>} for an uncontrolled dialog, or open and onOpenChange to control it", names: ["tsc", "dev"] },
  {
    id: "s17",
    habit: "both trigger and open",
    tsc: [
      `error TS2322: Type '{ children: string; title: string; size: "sm"; trigger: Element; open: true; onOpenChange: (open: boolean) => void; }' is not assignable to type 'IntrinsicAttributes & DialogProps'.\n  Types of property 'open' are incompatible.\n    Type 'true' is not assignable to type 'undefined'.`,
    ],
    dev: "Pass trigger={<Button>…</Button>} for an uncontrolled dialog, or open and onOpenChange to control it",
    names: ["dev"],
    hoverLost:
      "trigger and open each rule out the other branch; the mode-exclusion props stay `never` because hint types there lose hover in valid code (AGENTS.md rule 6)",
  },
  { id: "s22", habit: "a position on Dialog", tsc: [hint("string", 'Use <Sheet side="right">')], dev: '<Sheet side="bottom">', names: ["tsc", "dev"] },
  {
    id: "s31",
    habit: "an xs DialogPopup part",
    tsc: [notAssignable('"xs"', `DialogSize | (string & { 'Use "sm", "md", "lg", "xl", "2xl" or "full"': never; }) | undefined`)],
    dev: '<DialogPopup size="md">',
    names: ["tsc", "dev"],
  },
];

/** Valid dialog snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok06"];
