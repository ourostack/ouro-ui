import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { StackedLayout, type StackedLayoutProps } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<ComponentProps<typeof StackedLayout>>().toEqualTypeOf<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; footer: "x"; bleed: true; skipLabel: "Skip"; className: "min-h-96" }>().toExtend<StackedLayoutProps>();

// navbar and children are required; the guessed props name the fix.
expectTypeOf<{ children: "Page" }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x" }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; sidebar: "x" }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; header: "x" }>().not.toExtend<StackedLayoutProps>();

// The page's element is main or div.
expectTypeOf<{ navbar: "x"; children: "Page"; as: "div" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; as: "section" }>().not.toExtend<StackedLayoutProps>();
// @ts-expect-error navbar is required.
createElement(StackedLayout, { children: "Page" });
