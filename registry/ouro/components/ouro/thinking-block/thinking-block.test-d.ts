import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ThinkingBlock, type ThinkingBlockProps } from "@/registry/ouro/components/ouro/thinking-block/thinking-block";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ children: "The roast needs an hour." }>().toExtend<ThinkingBlockProps>();
expectTypeOf<{
  children: "The roast needs an hour.";
  streaming: true;
  duration: 12;
  summary: "Planned the oven";
  open: false;
  defaultOpen: true;
  onOpenChange: (open: boolean) => void;
  className: "mt-2";
}>().toExtend<ThinkingBlockProps>();
expectTypeOf<ComponentProps<typeof ThinkingBlock>>().toEqualTypeOf<ThinkingBlockProps>();

// The reasoning is required.
expectTypeOf<{ streaming: true }>().not.toExtend<ThinkingBlockProps>();

// Guessed props name the fix.
expectTypeOf<{ children: "R"; isStreaming: true }>().not.toExtend<ThinkingBlockProps>();
expectTypeOf<{ children: "R"; loading: true }>().not.toExtend<ThinkingBlockProps>();
expectTypeOf<{ children: "R"; isOpen: true }>().not.toExtend<ThinkingBlockProps>();
expectTypeOf<{ children: "R"; title: "Checked" }>().not.toExtend<ThinkingBlockProps>();
expectTypeOf<{ children: "R"; content: "R" }>().not.toExtend<ThinkingBlockProps>();

