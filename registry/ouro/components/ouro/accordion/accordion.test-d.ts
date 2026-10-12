import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Accordion, type AccordionProps } from "@/registry/ouro/components/ouro/accordion/accordion";

// Type tests: `pnpm typecheck` compiles this file.

type Items = Array<{ value: string; title: string; content: string }>;

expectTypeOf<{ items: Items }>().toExtend<AccordionProps>();
expectTypeOf<{ items: Items; value: "a" | null; onValueChange: (value: string | null) => void }>().toExtend<AccordionProps>();
expectTypeOf<{ items: Items; multiple: true; value: string[]; onValueChange: (value: string[]) => void }>().toExtend<AccordionProps>();
expectTypeOf<{ items: Items; headingLevel: 2 }>().toExtend<AccordionProps>();
expectTypeOf<ComponentProps<typeof Accordion>>().toEqualTypeOf<AccordionProps>();

// The value follows the mode: a list needs multiple, and multiple takes a list.
expectTypeOf<{ items: Items; value: string[] }>().not.toExtend<AccordionProps>();
expectTypeOf<{ items: Items; multiple: true; defaultValue: "a" }>().not.toExtend<AccordionProps>();
expectTypeOf<{ items: Items; multiple: true; onValueChange: (value: string | null) => void }>().not.toExtend<AccordionProps>();

// The guessed props name the fix.
expectTypeOf<{ items: Items; type: "multiple" }>().not.toExtend<AccordionProps>();
expectTypeOf<{ items: Items; collapsible: true }>().not.toExtend<AccordionProps>();
expectTypeOf<{ items: Items; onChange: () => void }>().not.toExtend<AccordionProps>();
expectTypeOf<{ items: Items; headingLevel: 1 }>().not.toExtend<AccordionProps>();

// @ts-expect-error items is required.
createElement(Accordion, {});
