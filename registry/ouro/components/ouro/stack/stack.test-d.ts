import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Stack, type StackProps } from "@/registry/ouro/components/ouro/stack/stack";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<ComponentProps<typeof Stack>>().toEqualTypeOf<StackProps>();
expectTypeOf<{ gap: "lg"; align: "center"; justify: "between"; as: "ul" }>().toExtend<StackProps>();

// Numbers are other libraries' spacing units; the type names the scale.
expectTypeOf<{ gap: 4 }>().not.toExtend<StackProps>();
expectTypeOf<{ gap: "large" }>().not.toExtend<StackProps>();
expectTypeOf<{ align: "left" }>().not.toExtend<StackProps>();
expectTypeOf<{ direction: "row" }>().not.toExtend<StackProps>();
expectTypeOf<{ spacing: 2 }>().not.toExtend<StackProps>();
expectTypeOf<{ alignItems: "center" }>().not.toExtend<StackProps>();
expectTypeOf<{ as: "article" }>().not.toExtend<StackProps>();
