import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ToolCall, type ToolCallProps } from "@/registry/ouro/components/ouro/tool-call/tool-call";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ name: "Read file"; status: "done" }>().toExtend<ToolCallProps>();
expectTypeOf<{
  name: "Ran command";
  status: "failed";
  detail: "npm test";
  duration: 4.2;
  output: "1 failed";
  outputLanguage: "ansi";
  defaultOpen: true;
  open: false;
  onOpenChange: (open: boolean) => void;
  className: "mt-1";
}>().toExtend<ToolCallProps>();
expectTypeOf<ComponentProps<typeof ToolCall>>().toEqualTypeOf<ToolCallProps>();

// name and status are required.
expectTypeOf<{ status: "done" }>().not.toExtend<ToolCallProps>();
expectTypeOf<{ name: "Read file" }>().not.toExtend<ToolCallProps>();

// A status that is not one of ToolCall's is a type error, as are guessed props.
expectTypeOf<{ name: "N"; status: "output-error" }>().not.toExtend<ToolCallProps>();
expectTypeOf<{ name: "N"; status: "done"; state: "input-streaming" }>().not.toExtend<ToolCallProps>();
expectTypeOf<{ name: "N"; status: "done"; toolName: "Read file" }>().not.toExtend<ToolCallProps>();
expectTypeOf<{ name: "N"; status: "done"; args: { path: "roast.md" } }>().not.toExtend<ToolCallProps>();
expectTypeOf<{ name: "N"; status: "done"; input: { path: "roast.md" } }>().not.toExtend<ToolCallProps>();
expectTypeOf<{ name: "N"; status: "done"; result: "ok" }>().not.toExtend<ToolCallProps>();
