import { useState, type JSX } from "react";
import { Pagination } from "@/registry/ouro/components/ouro/pagination/pagination";

// The live demo at the top of docs/pagination/: the component as an app would use it, with its props, nothing else.
// It pages in place with onPageChange; an app with a page per address passes href instead.

export default function PaginationDemo(): JSX.Element {
  const [page, setPage] = useState(6);
  return <Pagination className="w-full" page={page} pageCount={12} onPageChange={setPage} />;
}
