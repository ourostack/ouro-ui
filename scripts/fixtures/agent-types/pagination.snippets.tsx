// What agents write with pagination: snippets whose cases are in pagination.cases.ts.
import { Pagination } from "@/registry/ouro/components/ouro/pagination/pagination";

export const pagination01 = <Pagination page={1} pageCount={12} href="?page={page}" currentPage={1} />;
export const pagination02 = <Pagination page={1} pageCount={12} href="?page={page}" totalPages={12} />;
export const pagination03 = <Pagination page={1} pageCount={12} href="?page={page}" onChange={() => {}} />;
export const pagination04 = <Pagination page={1} pageCount={12} href="?page={page}" total={120} />;
export const paginationOk01 = <Pagination page={2} pageCount={12} href="?page={page}" siblings={1} label="Pagination" previousLabel="Previous" nextLabel="Next" />;
export const paginationOk02 = <Pagination page={2} pageCount={12} onPageChange={() => {}} pageLabel="Page {page}" summaryLabel="Page {page} of {pageCount}" />;
