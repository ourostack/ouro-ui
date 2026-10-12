import { type AgentCase, notAssignable } from "./shared.ts";

/** The pagination snippets in pagination.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "pagination01",
    habit: "a currentPage prop",
    tsc: [notAssignable("number", `{ "Use <Pagination page={1} pageCount={12}>": never; }`)],
    dev: "<Pagination page={1} pageCount={12}>",
    names: ["tsc", "dev"],
  },
  {
    id: "pagination02",
    habit: "a totalPages prop",
    tsc: [notAssignable("number", `{ "Use <Pagination page={1} pageCount={12}>": never; }`)],
    dev: "<Pagination page={1} pageCount={12}>",
    names: ["tsc", "dev"],
  },
  {
    id: "pagination03",
    habit: "an onChange handler on Pagination",
    tsc: [notAssignable("() => void", `{ "Use <Pagination onPageChange={(page) => ...}>": never; }`)],
    dev: "<Pagination onPageChange={(page) => …}>",
    names: ["tsc", "dev"],
  },
  {
    id: "pagination04",
    habit: "a count of rows as total",
    tsc: [notAssignable("number", `{ "Use pageCount={Math.ceil(total / pageSize)}": never; }`)],
    dev: "<Pagination page={1} pageCount={Math.ceil(total / pageSize)}>",
    names: ["tsc", "dev"],
  },
];

/** Valid pagination snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["paginationOk01", "paginationOk02"];
