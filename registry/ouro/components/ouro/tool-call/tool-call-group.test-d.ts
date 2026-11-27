import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ToolCallGroup, type ToolCallGroupItem, type ToolCallGroupProps } from "@/registry/ouro/components/ouro/tool-call/tool-call-group";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ calls: [] }>().toExtend<ToolCallGroupProps>();
expectTypeOf<{ id: "1"; name: "Read file"; status: "done"; detail: "roast.md"; duration: 0.4; output: "# Roast"; outputLanguage: "md" }>().toExtend<ToolCallGroupItem>();
expectTypeOf<{
  calls: ToolCallGroupItem[];
  summary: "Read the recipe";
  open: true;
  defaultOpen: false;
  onOpenChange: (open: boolean) => void;
  className: "mt-2";
}>().toExtend<ToolCallGroupProps>();
expectTypeOf<ComponentProps<typeof ToolCallGroup>>().toEqualTypeOf<ToolCallGroupProps>();

// Each call needs an id, a name and a status; calls are required.
expectTypeOf<{ name: "Read file"; status: "done" }>().not.toExtend<ToolCallGroupItem>();
expectTypeOf<{ summary: "S" }>().not.toExtend<ToolCallGroupProps>();

// Guessed props name the fix.
expectTypeOf<{ calls: []; tools: [] }>().not.toExtend<ToolCallGroupProps>();
expectTypeOf<{ calls: []; title: "Read the recipe" }>().not.toExtend<ToolCallGroupProps>();
