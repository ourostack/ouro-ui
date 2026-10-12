import { type AgentCase, hint } from "./shared.ts";

const control = "Use <EditSheet open={open} onOpenChange={setOpen}>";

/** The edit-sheet snippets in edit-sheet.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "editSheet01",
    habit: "an onSave callback",
    tsc: [hint("(data: FormData) => Promise<{ name: string; } | undefined>", "Use <EditSheet onSubmit={(data) => save(data)}>")],
    dev: "<EditSheet onSubmit={(data) => save(data)}>",
    names: ["tsc", "dev"],
  },
  { id: "editSheet02", habit: "a saveLabel prop", tsc: [hint("string", 'Use <EditSheet submitLabel="Save">')], dev: '<EditSheet submitLabel="Save">', names: ["tsc", "dev"] },
  {
    id: "editSheet03",
    habit: "errors passed in as a prop",
    tsc: [
      `error TS2353: Object literal may only specify known properties, and 'name' does not exist in type '{ 'Return errors from onSubmit: onSubmit={async (data) => (await save(data)).errors}': never; }'.`,
    ],
    dev: "<EditSheet onSubmit={async (data) => (await save(data)).errors}>",
    names: ["tsc", "dev"],
  },
  {
    id: "editSheet04",
    habit: "isOpen and onClose",
    tsc: [hint("boolean", control), hint("() => void", control)],
    dev: "Pass trigger={<Button>…</Button>} for an uncontrolled edit sheet, or open and onOpenChange to control it",
    names: ["tsc", "dev"],
  },
];

/** Valid edit-sheet snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["okEditSheet"];
