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
  {
    id: "table06",
    habit: "sortable on the Table in place of on a column",
    tsc: [notAssignable("boolean", '{ "Put sortable on a column: { key, header, sortable: true }": never; }')],
    dev: '{ key: "name", header: "Recipe", sortable: true }',
    names: ["tsc", "dev"],
  },
  {
    id: "table07",
    habit: "desc for a descending sort",
    tsc: [`error TS2322: Type '"desc"' is not assignable to type 'TableSortDirection | (string & { 'Use "ascending" or "descending": asc is "ascending"': never; })'.`],
    dev: '{ key: "name", direction: "descending" }',
    names: ["tsc", "dev"],
  },
  { id: "table08", habit: "TanStack's enableSorting on a column", tsc: [notAssignable("boolean", '{ "Use sortable: true": never; }')], dev: '{ key: "name", header: "…", sortable: true }', names: ["tsc", "dev"] },
];

/** Valid table snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["table09", "table10", "table11", "table12"];
