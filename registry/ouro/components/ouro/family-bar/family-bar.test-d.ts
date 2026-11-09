import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { FamilyBar, type FamilyBarProps, type FamilyLink } from "@/registry/ouro/components/ouro/family-bar/family-bar";

// Type tests: `pnpm typecheck` compiles this file.

const links = [{ id: "home", label: "Lantern", href: "https://example.com/" }, { id: "docs", label: "Docs", href: "https://docs.example.com/" }] as const;

expectTypeOf<ComponentProps<typeof FamilyBar>>().toEqualTypeOf<FamilyBarProps>();
expectTypeOf<{ links: typeof links }>().toExtend<FamilyBarProps>();
expectTypeOf<{ links: typeof links; current: "docs"; label: "Sites"; brand: "Lantern"; className: "sticky top-0" }>().toExtend<FamilyBarProps>();
expectTypeOf<{ id: "docs"; label: "Docs"; href: "/" }>().toExtend<FamilyLink>();

// links is required, a link needs its id, label and href, and the guessed props name the fix.
expectTypeOf<{ current: "docs" }>().not.toExtend<FamilyBarProps>();
expectTypeOf<{ label: "Docs"; href: "/" }>().not.toExtend<FamilyLink>();
expectTypeOf<{ id: "docs"; href: "/" }>().not.toExtend<FamilyLink>();
expectTypeOf<{ id: "docs"; label: "Docs" }>().not.toExtend<FamilyLink>();
expectTypeOf<{ links: typeof links; items: typeof links }>().not.toExtend<FamilyBarProps>();
expectTypeOf<{ links: typeof links; currentPath: "/docs" }>().not.toExtend<FamilyBarProps>();
expectTypeOf<{ links: typeof links; children: "Docs" }>().not.toExtend<FamilyBarProps>();

// @ts-expect-error links is required.
createElement(FamilyBar, {});
createElement(FamilyBar, { links });
