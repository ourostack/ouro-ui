import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { TypingIndicator, type TypingIndicatorProps } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ people: [] }>().toExtend<TypingIndicatorProps>();
expectTypeOf<{ people: [{ name: "Ned Land"; src: "/ned.webp"; idForColor: "u-1"; initials: "N" }]; label: (names: readonly string[]) => string; className: "px-4" }>().toExtend<TypingIndicatorProps>();
expectTypeOf<ComponentProps<typeof TypingIndicator>>().toEqualTypeOf<TypingIndicatorProps>();

// people is required, and each needs a name.
expectTypeOf<{ label: (names: readonly string[]) => string }>().not.toExtend<TypingIndicatorProps>();
expectTypeOf<{ people: [{ src: "/ned.webp" }] }>().not.toExtend<TypingIndicatorProps>();

// Guessed props name the fix.
expectTypeOf<{ people: []; users: [] }>().not.toExtend<TypingIndicatorProps>();
expectTypeOf<{ people: []; typing: [] }>().not.toExtend<TypingIndicatorProps>();
expectTypeOf<{ people: []; visible: true }>().not.toExtend<TypingIndicatorProps>();
