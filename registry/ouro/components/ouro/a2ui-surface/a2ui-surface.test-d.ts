import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { A2UISurface, type A2UIActionMessage, type A2UIHandoff, type A2UISurfaceProps } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";

// Type tests: `pnpm typecheck` compiles this file.

declare const catalog: unknown;
declare const messages: unknown[];

expectTypeOf<{ catalog: unknown; messages: unknown[]; onAction: (m: A2UIActionMessage) => void; onHandoff: (h: A2UIHandoff) => void }>().toExtend<A2UISurfaceProps>();
expectTypeOf<{ catalog: unknown; messages: unknown[]; onAction: (m: A2UIActionMessage) => Promise<void>; onHandoff: (h: A2UIHandoff) => void; surfaceId: "card"; className: "max-w-md" }>().toExtend<A2UISurfaceProps>();
expectTypeOf<ComponentProps<typeof A2UISurface>>().toEqualTypeOf<A2UISurfaceProps>();
expectTypeOf<A2UIHandoff>().toEqualTypeOf<{ action: string; how: string }>();

// Every button needs somewhere to go: a person-only one hands off, the rest run.
expectTypeOf<{ catalog: unknown; messages: unknown[]; onAction: () => void }>().not.toExtend<A2UISurfaceProps>();

expectTypeOf<{ catalog: unknown; messages: unknown[]; onAction: () => void; onHandoff: () => void; onPress: () => void }>().not.toExtend<A2UISurfaceProps>();

// @ts-expect-error onHandoff is required.
createElement(A2UISurface, { catalog, messages, onAction: () => {} });
