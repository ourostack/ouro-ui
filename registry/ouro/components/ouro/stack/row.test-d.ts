import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Row, type RowProps } from "@/registry/ouro/components/ouro/stack/row";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<ComponentProps<typeof Row>>().toEqualTypeOf<RowProps>();
expectTypeOf<{ gap: "xs"; align: "baseline"; justify: "between"; wrap: true; stackBelow: "sm"; as: "nav" }>().toExtend<RowProps>();

expectTypeOf<{ gap: 2 }>().not.toExtend<RowProps>();
expectTypeOf<{ align: "top" }>().not.toExtend<RowProps>();
expectTypeOf<{ stackBelow: "xs" }>().not.toExtend<RowProps>();
expectTypeOf<{ direction: "column" }>().not.toExtend<RowProps>();
expectTypeOf<{ flexWrap: "wrap" }>().not.toExtend<RowProps>();
expectTypeOf<{ justifyContent: "space-between" }>().not.toExtend<RowProps>();
