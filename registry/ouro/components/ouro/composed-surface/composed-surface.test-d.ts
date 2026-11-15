import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ComposedSurface, type ComposedHandoff, type ComposedSurfaceProps } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import type { ComposedNode, PersonPress } from "@/registry/ouro/lib/ouro/a2ui-core";

// Type tests: `pnpm typecheck` compiles this file.

declare const tree: ComposedNode;

expectTypeOf<{ tree: ComposedNode; onPress: (p: PersonPress) => void; onHandoff: (h: ComposedHandoff) => void }>().toExtend<ComposedSurfaceProps>();
expectTypeOf<{ tree: ComposedNode; onPress: (p: PersonPress, button: ComposedNode) => Promise<void>; onHandoff: (h: ComposedHandoff) => void; className: "max-w-md" }>().toExtend<ComposedSurfaceProps>();
expectTypeOf<ComponentProps<typeof ComposedSurface>>().toEqualTypeOf<ComposedSurfaceProps>();
expectTypeOf<ComposedHandoff>().toEqualTypeOf<{ action: string; how: string }>();

// It draws core's tree, not A2UI messages.
expectTypeOf<{ tree: { messages: unknown[] }; onPress: () => void; onHandoff: () => void }>().not.toExtend<ComposedSurfaceProps>();

// Every button needs somewhere to go: a person-only one hands off, the rest are pressed.
expectTypeOf<{ tree: ComposedNode; onPress: () => void }>().not.toExtend<ComposedSurfaceProps>();

expectTypeOf<{ tree: ComposedNode; onPress: () => void; onHandoff: () => void; onAction: () => void }>().not.toExtend<ComposedSurfaceProps>();

// @ts-expect-error onHandoff is required.
createElement(ComposedSurface, { tree, onPress: () => {} });
