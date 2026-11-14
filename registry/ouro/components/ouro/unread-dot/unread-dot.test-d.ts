import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { UnreadDot, type UnreadDotProps } from "@/registry/ouro/components/ouro/unread-dot/unread-dot";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ label: "Unread" }>().toExtend<UnreadDotProps>();
expectTypeOf<{ label: "Unread"; dot: false; className: "ms-2" }>().toExtend<UnreadDotProps>();
expectTypeOf<ComponentProps<typeof UnreadDot>>().toEqualTypeOf<UnreadDotProps>();

// label is required: a dot is never silent.
expectTypeOf<{ dot: true }>().not.toExtend<UnreadDotProps>();

// @ts-expect-error label is required.
createElement(UnreadDot, {});
