import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { FamilyFooter, type FamilyFooterProps } from "@/registry/ouro/components/ouro/family-bar/family-footer";

// Type tests: `pnpm typecheck` compiles this file.

const links = [{ id: "home", label: "Lantern", href: "https://example.com/" }, { id: "docs", label: "Docs", href: "https://docs.example.com/" }] as const;

expectTypeOf<ComponentProps<typeof FamilyFooter>>().toEqualTypeOf<FamilyFooterProps>();
expectTypeOf<{ links: typeof links }>().toExtend<FamilyFooterProps>();
expectTypeOf<{ links: typeof links; current: "docs"; label: "All sites"; children: "Privacy"; className: "mt-auto" }>().toExtend<FamilyFooterProps>();

// links is required, and the guessed props name the fix.
expectTypeOf<{ current: "docs" }>().not.toExtend<FamilyFooterProps>();
expectTypeOf<{ links: typeof links; items: typeof links }>().not.toExtend<FamilyFooterProps>();
expectTypeOf<{ links: typeof links; currentPath: "/docs" }>().not.toExtend<FamilyFooterProps>();

// @ts-expect-error links is required.
createElement(FamilyFooter, {});
createElement(FamilyFooter, { links });
