import { Pagination } from "@/components/ouro/pagination/pagination";

// expect: data-ouro="pagination"
// A Server Component passes href as a string with {page}: every page is a plain link.
// expect: href="/ouro-pagination[?]page=2"
// expect: href="/ouro-pagination[?]page=12"
// expect: aria-current="page"
// expect: Page 3 of 12
export default function PaginationSection() {
  return <Pagination page={3} pageCount={12} href="/ouro-pagination?page={page}" />;
}
