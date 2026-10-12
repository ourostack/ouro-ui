import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Navbar, type NavbarItem, type NavbarProps } from "@/registry/ouro/components/ouro/navbar/navbar";

// Type tests: `pnpm typecheck` compiles this file.

const items = [{ label: "Recipes", href: "/recipes" }] as const;

expectTypeOf<ComponentProps<typeof Navbar>>().toEqualTypeOf<NavbarProps>();
expectTypeOf<{ label: "Main"; items: typeof items }>().toExtend<NavbarProps>();
expectTypeOf<{ label: "Main"; items: typeof items; currentPath: "/recipes"; brand: "Spoonjoy"; actions: "x"; menuLabel: "Menu"; closeLabel: "Close" }>().toExtend<NavbarProps>();
expectTypeOf<{ label: "Recipes"; href: "/recipes"; current: true }>().toExtend<NavbarItem>();

// label and items are required; an item needs an href; the guessed props name the fix.
expectTypeOf<{ items: typeof items }>().not.toExtend<NavbarProps>();
expectTypeOf<{ label: "Main" }>().not.toExtend<NavbarProps>();
expectTypeOf<{ label: "Recipes" }>().not.toExtend<NavbarItem>();
expectTypeOf<{ label: "Main"; items: typeof items; links: typeof items }>().not.toExtend<NavbarProps>();
expectTypeOf<{ label: "Main"; items: typeof items; logo: "x" }>().not.toExtend<NavbarProps>();
expectTypeOf<{ label: "Main"; items: typeof items; pathname: "/" }>().not.toExtend<NavbarProps>();
expectTypeOf<{ label: "Main"; items: typeof items; children: "x" }>().not.toExtend<NavbarProps>();

// @ts-expect-error label is required.
createElement(Navbar, { items });
