import { createElement, type ReactNode } from "react";
import { expectTypeOf } from "vitest";
import { Table, type TableColumn, type TableProps } from "@/registry/ouro/components/ouro/table/table";

// Type tests: `pnpm typecheck` compiles this file.

interface Recipe {
  id: string;
  name: string;
  serves: number;
  href?: string;
  added: Date;
}

// A column shows a field whose value React renders, or any key with `cell`.
expectTypeOf<{ key: "name"; header: "Recipe" }>().toExtend<TableColumn<Recipe>>();
expectTypeOf<{ key: "serves"; header: "Serves"; align: "end" }>().toExtend<TableColumn<Recipe>>();
expectTypeOf<{ key: "save"; header: "Save"; hideHeader: true; cell: (row: Recipe) => ReactNode }>().toExtend<TableColumn<Recipe>>();
// A Date is not a ReactNode, so its column needs `cell`.
expectTypeOf<{ key: "added"; header: "Added" }>().not.toExtend<TableColumn<Recipe>>();
expectTypeOf<{ key: "added"; header: "Added"; cell: (row: Recipe) => string }>().toExtend<TableColumn<Recipe>>();
// The header is required, and the habits from other libraries are hint types.
expectTypeOf<{ key: "name" }>().not.toExtend<TableColumn<Recipe>>();
expectTypeOf<{ key: "name"; header: "Recipe"; accessorKey: "name" }>().not.toExtend<TableColumn<Recipe>>();
expectTypeOf<{ key: "name"; header: "Recipe"; align: "right" }>().not.toExtend<TableColumn<Recipe>>();

// The caption is required; rowHref and rowKey take a function or the name of a field.
expectTypeOf<{ caption: "Recipes"; columns: TableColumn<Recipe>[]; rows: Recipe[]; rowHref: "href"; rowKey: "id" }>().toExtend<TableProps<Recipe>>();
expectTypeOf<{ caption: "Recipes"; columns: TableColumn<Recipe>[]; rows: Recipe[]; rowHref: (row: Recipe) => string }>().toExtend<TableProps<Recipe>>();
expectTypeOf<{ columns: TableColumn<Recipe>[]; rows: Recipe[] }>().not.toExtend<TableProps<Recipe>>();
expectTypeOf<{ caption: "Recipes"; columns: TableColumn<Recipe>[]; rows: Recipe[]; rowHref: "serves" }>().not.toExtend<TableProps<Recipe>>();
expectTypeOf<{ caption: "Recipes"; columns: TableColumn<Recipe>[]; rows: Recipe[]; data: Recipe[] }>().not.toExtend<TableProps<Recipe>>();
expectTypeOf<{ caption: "Recipes"; columns: TableColumn<Recipe>[]; rows: Recipe[]; onRowClick: () => void }>().not.toExtend<TableProps<Recipe>>();

// Parts as children, or columns and rows: not both.
expectTypeOf<{ caption: "Pantry"; children: ReactNode }>().toExtend<TableProps>();
expectTypeOf<{ caption: "Pantry"; children: ReactNode; columns: TableColumn<Recipe>[]; rows: Recipe[] }>().not.toExtend<TableProps<Recipe>>();

// The row type flows from `rows` into `cell` and `rowHref`.
createElement(Table<Recipe>, {
  caption: "Recipes",
  columns: [{ key: "added", header: "Added", cell: (row) => row.added.toLocaleDateString() }],
  rows: [] as Recipe[],
  rowHref: (row) => `/recipes/${row.id}`,
});

// @ts-expect-error caption is required.
createElement(Table<Recipe>, { columns: [{ key: "name", header: "Recipe" }], rows: [] as Recipe[] });
