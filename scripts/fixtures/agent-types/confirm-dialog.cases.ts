import { type AgentCase, notAssignable, hint } from "./shared.ts";

const confirmControl = "<ConfirmDialog open={open} onOpenChange={setOpen}>";

/** The confirm-dialog snippets in confirm-dialog.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "s18", habit: "Radix's onCancel", tsc: [hint("() => void", `Use ${confirmControl}`)], dev: confirmControl, names: ["tsc", "dev"] },
  { id: "s19", habit: "a confirmText guess", tsc: [hint("string", 'Use <ConfirmDialog confirmLabel="Delete">')], dev: '<ConfirmDialog confirmLabel="Delete">', names: ["tsc", "dev"] },
  { id: "s20", habit: "shadcn's destructive variant on a confirmation", tsc: [hint("string", 'Use <ConfirmDialog tone="destructive">')], dev: '<ConfirmDialog tone="destructive">', names: ["tsc", "dev"] },
  {
    id: "s21",
    habit: "a danger tone on a confirmation",
    tsc: [notAssignable('"danger"', `"primary" | "destructive" | (string & { 'danger is "destructive"; accent is "primary"': never; }) | undefined`)],
    dev: '<ConfirmDialog tone="destructive">',
    names: ["tsc", "dev"],
  },
];

/** Valid confirm-dialog snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok07"];
