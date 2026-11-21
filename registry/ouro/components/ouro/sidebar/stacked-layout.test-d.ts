import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { StackedLayout, type StackedLayoutProps } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";

// A call site's props, typed as the component takes them. A case below keeps children in the props object because it
// checks the props a call passes, children among them, and a .ts file has no JSX to put children in; an app's lint
// (react(no-children-prop)) flags children passed in createElement's props, so the check doesn't call createElement.
const propsOf = <P>(value: P): P => value;

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<ComponentProps<typeof StackedLayout>>().toEqualTypeOf<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; footer: "x"; bleed: true; skipLabel: "Skip"; className: "min-h-96" }>().toExtend<StackedLayoutProps>();

// navbar and children are required; the guessed props name the fix.
expectTypeOf<{ children: "Page" }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x" }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; sidebar: "x" }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; header: "x" }>().not.toExtend<StackedLayoutProps>();

// The toolbar takes any node; navbarBehavior is one of three, and the guessed props name the fix.
expectTypeOf<{ navbar: "x"; children: "Page"; toolbar: "Tools"; toolbarLabel: "Week tools" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; navbarBehavior: "sticky" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; navbarBehavior: "static" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; navbarBehavior: "auto-hide" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; navbarBehavior: "fixed" }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; hideOnScroll: true }>().not.toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; sticky: false }>().not.toExtend<StackedLayoutProps>();

// The page's element is main or div.
expectTypeOf<{ navbar: "x"; children: "Page"; as: "div" }>().toExtend<StackedLayoutProps>();
expectTypeOf<{ navbar: "x"; children: "Page"; as: "section" }>().not.toExtend<StackedLayoutProps>();
// @ts-expect-error navbar is required.
propsOf<ComponentProps<typeof StackedLayout>>({ children: "Page" });
