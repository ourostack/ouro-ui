import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { CopyPrompt, type CopyPromptProps } from "@/registry/ouro/components/ouro/copy-prompt/copy-prompt";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ text: "Summarize my week." }>().toExtend<CopyPromptProps>();
expectTypeOf<{
  text: "Summarize my week.";
  label: "Copy prompt";
  copiedLabel: "Copié";
  failedLabel: "Échec";
  onCopy: (text: string) => void;
  className: "mt-2";
  id: "prompt";
}>().toExtend<CopyPromptProps>();
expectTypeOf<ComponentProps<typeof CopyPrompt>>().toEqualTypeOf<CopyPromptProps>();

// text is required.
expectTypeOf<{ label: "Copy" }>().not.toExtend<CopyPromptProps>();

// Guessed props name the fix.
expectTypeOf<{ text: "Hi"; value: "Hi" }>().not.toExtend<CopyPromptProps>();
expectTypeOf<{ text: "Hi"; prompt: "Hi" }>().not.toExtend<CopyPromptProps>();

// @ts-expect-error text is required.
createElement(CopyPrompt, { label: "Copy" });
