import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { SidebarLayout, type SidebarLayoutProps } from "@/registry/ouro/components/ouro/sidebar/sidebar-layout";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<ComponentProps<typeof SidebarLayout>>().toEqualTypeOf<SidebarLayoutProps>();
expectTypeOf<{ sidebar: "x"; children: "Page" }>().toExtend<SidebarLayoutProps>();
expectTypeOf<{ sidebar: "x"; children: "Page"; header: "Search"; bleed: true; skipLabel: "Skip"; className: "min-h-96" }>().toExtend<SidebarLayoutProps>();

// sidebar and children are required; the guessed prop names the fix.
expectTypeOf<{ children: "Page" }>().not.toExtend<SidebarLayoutProps>();
expectTypeOf<{ sidebar: "x" }>().not.toExtend<SidebarLayoutProps>();
expectTypeOf<{ sidebar: "x"; children: "Page"; navbar: "x" }>().not.toExtend<SidebarLayoutProps>();

// The page's element is main or div.
expectTypeOf<{ sidebar: "x"; children: "Page"; as: "div" }>().toExtend<SidebarLayoutProps>();
expectTypeOf<{ sidebar: "x"; children: "Page"; as: "section" }>().not.toExtend<SidebarLayoutProps>();
// @ts-expect-error sidebar is required.
createElement(SidebarLayout, { children: "Page" });
