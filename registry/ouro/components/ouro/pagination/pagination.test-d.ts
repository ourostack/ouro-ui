import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Pagination, type PaginationProps } from "@/registry/ouro/components/ouro/pagination/pagination";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<ComponentProps<typeof Pagination>>().toEqualTypeOf<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: "?page={page}" }>().toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: (page: number) => string }>().toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; onPageChange: (page: number) => void }>().toExtend<PaginationProps>();
expectTypeOf<{
  page: 1;
  pageCount: 12;
  href: "?page={page}";
  siblings: 2;
  label: "Pages";
  previousLabel: "Back";
  nextLabel: "Forward";
  pageLabel: "Page {page}";
  summaryLabel: "{page} / {pageCount}";
}>().toExtend<PaginationProps>();

// One way to change page: href or onPageChange, not neither and not both.
expectTypeOf<{ page: 1; pageCount: 12 }>().not.toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: "?page={page}"; onPageChange: (page: number) => void }>().not.toExtend<PaginationProps>();
// page and pageCount are required, and the guessed props name the fix.
expectTypeOf<{ pageCount: 12; href: "?page={page}" }>().not.toExtend<PaginationProps>();
expectTypeOf<{ page: 1; href: "?page={page}" }>().not.toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: "?page={page}"; currentPage: 1 }>().not.toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: "?page={page}"; totalPages: 12 }>().not.toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: "?page={page}"; total: 120 }>().not.toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: "?page={page}"; count: 12 }>().not.toExtend<PaginationProps>();
expectTypeOf<{ page: 1; pageCount: 12; href: "?page={page}"; onChange: () => void }>().not.toExtend<PaginationProps>();

// @ts-expect-error needs href or onPageChange.
createElement(Pagination, { page: 1, pageCount: 12 });
