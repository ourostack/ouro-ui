import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import {
  NavigationMenu,
  type NavigationMenuItem,
  type NavigationMenuLink,
  type NavigationMenuProps,
} from "@/registry/ouro/components/ouro/navigation-menu/navigation-menu";

// Type tests: `pnpm typecheck` compiles this file.

const items = [{ label: "Recipes", links: [{ label: "Browse", href: "/recipes" }] }, { label: "Pricing", href: "/pricing" }] as const;

expectTypeOf<ComponentProps<typeof NavigationMenu>>().toEqualTypeOf<NavigationMenuProps>();
expectTypeOf<{ label: "Main"; items: typeof items }>().toExtend<NavigationMenuProps>();
expectTypeOf<{ label: "Main"; items: typeof items; currentPath: "/recipes"; className: "ms-4" }>().toExtend<NavigationMenuProps>();
expectTypeOf<{ label: "Pricing"; href: "/pricing"; current: true }>().toExtend<NavigationMenuItem>();
expectTypeOf<{ label: "Browse"; href: "/recipes"; description: "All of them" }>().toExtend<NavigationMenuLink>();

// An item is a link or a panel, not both and not neither; a panel's link needs an href.
expectTypeOf<{ label: "Recipes"; href: "/recipes"; links: [] }>().not.toExtend<NavigationMenuItem>();
expectTypeOf<{ label: "Recipes" }>().not.toExtend<NavigationMenuItem>();
expectTypeOf<{ label: "Browse" }>().not.toExtend<NavigationMenuLink>();
// label and items are required, and the guessed props name the fix.
expectTypeOf<{ items: typeof items }>().not.toExtend<NavigationMenuProps>();
expectTypeOf<{ label: "Main" }>().not.toExtend<NavigationMenuProps>();
expectTypeOf<{ label: "Main"; items: typeof items; links: [] }>().not.toExtend<NavigationMenuProps>();
expectTypeOf<{ label: "Main"; items: typeof items; pathname: "/" }>().not.toExtend<NavigationMenuProps>();
expectTypeOf<{ label: "Main"; items: typeof items; orientation: "vertical" }>().not.toExtend<NavigationMenuProps>();
expectTypeOf<{ label: "Main"; items: typeof items; children: "x" }>().not.toExtend<NavigationMenuProps>();

// @ts-expect-error label is required.
createElement(NavigationMenu, { items });
