import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { AppWindow, type AppWindowProps } from "@/registry/ouro/components/ouro/app-window/app-window";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "tea.tsx" }>().toExtend<AppWindowProps>();
expectTypeOf<{ title: "tea.tsx"; actions: null; builtWith: readonly ["Checklist", "Button"]; builtWithLabel: "Hecho con"; inset: false; className: "mt-8" }>().toExtend<AppWindowProps>();
expectTypeOf<ComponentProps<typeof AppWindow>>().toEqualTypeOf<AppWindowProps>();

// title is required.
expectTypeOf<{ builtWith: ["Button"] }>().not.toExtend<AppWindowProps>();

// Guessed props name the fix.
expectTypeOf<{ title: "T"; label: "tea.tsx" }>().not.toExtend<AppWindowProps>();
expectTypeOf<{ title: "T"; uses: ["Button"] }>().not.toExtend<AppWindowProps>();
expectTypeOf<{ title: "T"; components: ["Button"] }>().not.toExtend<AppWindowProps>();
expectTypeOf<{ title: "T"; footer: null }>().not.toExtend<AppWindowProps>();
expectTypeOf<{ title: "T"; padded: false }>().not.toExtend<AppWindowProps>();
expectTypeOf<{ title: "T"; builtWith: "Button" }>().not.toExtend<AppWindowProps>();

// @ts-expect-error uses is not a prop.
createElement(AppWindow, { title: "T", uses: ["Button"] });
