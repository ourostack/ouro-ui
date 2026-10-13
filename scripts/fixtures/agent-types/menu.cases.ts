import { type AgentCase, hint, notAssignable } from "./shared.ts";

const control = "<Menu open={open} onOpenChange={setOpen} trigger={…}>";
const items = '<Menu trigger={…} items={[{ label: "Edit", onClick: edit }]} />';

/** The menu snippets in menu.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "menu01", habit: "Floating UI's or Radix's placement", tsc: [hint("string", 'Use side="bottom" align="start"')], dev: '<Menu side="bottom" align="start">', names: ["tsc", "dev"] },
  { id: "menu02", habit: "a variant for a destructive item", tsc: [hint("string", 'Use <MenuItem tone="destructive">')], dev: '<MenuItem tone="destructive">', names: ["tsc", "dev"] },
  { id: "menu03", habit: "Radix's onSelect on an item", tsc: [notAssignable("() => void", `{ "Use <MenuItem onClick={edit}>": never; }`)], dev: "<MenuItem onClick={edit}>", names: ["tsc", "dev"] },
  { id: "menu04", habit: "a shortcut as one string", tsc: [notAssignable("string", "MenuShortcut | undefined")], dev: '<MenuItem shortcut={["mod", "k"]}>', names: ["dev"] },
  {
    id: "menu05",
    habit: "options for the entries",
    tsc: [
      `error TS2741: Property ''Use items={[{ label: "Edit", onClick: edit }]}'' is missing in type '{ label: string; onClick: () => void; }[]' but required in type '{ 'Use items={[{ label: "Edit", onClick: edit }]}': never; }'.`,
    ],
    dev: items,
    names: ["tsc", "dev"],
  },
  { id: "menu06", habit: "isOpen for the open state", tsc: [hint("boolean", "Use <Menu open={open} onOpenChange={setOpen} trigger={...}>")], dev: control, names: ["tsc", "dev"] },
];

/** Valid menu snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["menuOk01"];
