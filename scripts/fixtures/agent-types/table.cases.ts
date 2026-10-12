import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The table snippets in table.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "table01",
    habit: "TanStack's data prop in place of rows",
    tsc: [
      `error TS2741: Property '"Use rows={recipes}"' is missing in type '{ id: string; name: string; serves: number; }[]' but required in type '{ "Use rows={recipes}": never; }'.`,
    ],
    dev: "<Table rows={recipes} columns={…}>",
    names: ["tsc", "dev"],
  },
  {
    id: "table02",
    habit: "an onRowClick handler in place of a row link",
    tsc: [notAssignable("() => void", '{ "Use rowHref={(row) => `/recipes/${row.id}`}": never; }')],
    dev: "<Table rowHref={(row) => `/recipes/${row.id}`}>",
    names: ["tsc", "dev"],
  },
  { id: "table03", habit: "a title in place of the caption", tsc: [hint("string", 'Use <Table caption="Recipes">')], dev: '<Table caption="Recipes">', names: ["tsc", "dev"] },
  { id: "table04", habit: "TanStack's accessorKey on a column", tsc: [hint("string", 'Use key: "name"')], dev: '{ key: "name", header: "…" }', names: ["tsc", "dev"] },
  {
    id: "table05",
    habit: "align right on a number column",
    tsc: [notAssignable('"right"', `TableAlign | (string & { 'Use "start", "center" or "end": right is "end"': never; }) | undefined`)],
    dev: '{ align: "end" }',
    names: ["tsc", "dev"],
  },
];

/** Valid table snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["table06", "table07"];
