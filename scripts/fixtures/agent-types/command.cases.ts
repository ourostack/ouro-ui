import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The command snippets in command.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "command01", habit: "onClick on a command", tsc: [hint("() => void", 'Use onSelect: { label: "New recipe", onSelect: create }')], dev: '{ label: "New recipe", onSelect: run }', names: ["tsc", "dev"] },
  {
    id: "command02",
    habit: "cmdk's children for the commands",
    tsc: [
      `error TS2747: 'Command' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'Use items={[{ label: "New recipe", onSelect: create }]}': never; } | undefined'.`,
    ],
    dev: '<Command items={[{ label: "New recipe", onSelect: create }]}>',
    names: ["tsc", "dev"],
  },
  { id: "command03", habit: "isOpen for the open state", tsc: [notAssignable("boolean", `{ "Use <Command open={open} onOpenChange={setOpen}>": never; }`)], dev: "<Command open={open} onOpenChange={setOpen}>", names: ["tsc", "dev"] },
  { id: "command04", habit: "cmdk's forceMount for a row shown whatever the search", tsc: [notAssignable("boolean", `{ "Use alwaysShown: true": never; }`)], dev: '{ label: "Jump to chat", onSelect: run, alwaysShown: true }', names: ["tsc", "dev"] },
  { id: "command05", habit: "cmdk's forceMount for a group shown whatever the search", tsc: [notAssignable("boolean", `{ "Use alwaysShown: true": never; }`)], dev: '{ label: "Go to", items, alwaysShown: true }', names: ["tsc", "dev"] },
];

/** Valid command snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["commandOk01", "commandOk02", "commandOk03"];
