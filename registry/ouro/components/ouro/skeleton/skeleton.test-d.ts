import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Skeleton, type SkeletonProps } from "@/registry/ouro/components/ouro/skeleton/skeleton";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<Record<string, never>>().toExtend<SkeletonProps>();
expectTypeOf<{ shape: "circle"; className: "size-12"; id: "avatar" }>().toExtend<SkeletonProps>();
expectTypeOf<ComponentProps<typeof Skeleton>>().toEqualTypeOf<SkeletonProps>();

// Shapes are named; size comes from layout classes; it has no children.
expectTypeOf<{ shape: "square" }>().not.toExtend<SkeletonProps>();
expectTypeOf<{ variant: "circular" }>().not.toExtend<SkeletonProps>();
expectTypeOf<{ animation: false }>().not.toExtend<SkeletonProps>();
expectTypeOf<{ width: 120 }>().not.toExtend<SkeletonProps>();
expectTypeOf<{ height: 20 }>().not.toExtend<SkeletonProps>();
expectTypeOf<{ children: "Loading" }>().not.toExtend<SkeletonProps>();
// @ts-expect-error MUI's variant is shape here.
createElement(Skeleton, { variant: "circular" });
