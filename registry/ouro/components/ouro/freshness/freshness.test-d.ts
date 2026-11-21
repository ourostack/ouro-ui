import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Freshness, type FreshnessProps } from "@/registry/ouro/components/ouro/freshness/freshness";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ updatedAt: Date }>().toExtend<FreshnessProps>();
expectTypeOf<{ updatedAt: number; refreshing: boolean; className: "mt-3" }>().toExtend<FreshnessProps>();
expectTypeOf<ComponentProps<typeof Freshness>>().toEqualTypeOf<FreshnessProps>();

// updatedAt is required: an age needs a time.
expectTypeOf<{ refreshing: true }>().not.toExtend<FreshnessProps>();

// @ts-expect-error updatedAt is required.
createElement(Freshness, {});
// @ts-expect-error not a prop; the prop is updatedAt.
createElement(Freshness, { updatedAt: 1, lastUpdated: 1 });
