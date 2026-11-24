import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { BuildChip, type BuildChipProps } from "@/registry/ouro/components/ouro/build-chip/build-chip";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ builds: readonly { id: string; label: string }[]; current: string }>().toExtend<BuildChipProps>();
expectTypeOf<{ builds: []; current: string; onSelect: (id: string) => void; skew: { message: string; fixLabel: string; onFix: () => void } }>().toExtend<BuildChipProps>();
expectTypeOf<ComponentProps<typeof BuildChip>>().toEqualTypeOf<BuildChipProps>();

// builds and current are required: a picker needs its choices and the one running.
expectTypeOf<{ current: string }>().not.toExtend<BuildChipProps>();
expectTypeOf<{ builds: [] }>().not.toExtend<BuildChipProps>();

// @ts-expect-error builds and current are required.
createElement(BuildChip, {});
// @ts-expect-error not a prop; the choices are builds.
createElement(BuildChip, { builds: [], current: "a", options: [] });
