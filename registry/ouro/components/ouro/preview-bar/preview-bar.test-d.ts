import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { PreviewBar, type PreviewBarProps } from "@/registry/ouro/components/ouro/preview-bar/preview-bar";

// Type tests: `pnpm typecheck` compiles this file.

type Required = { label: "Trying"; onKeep: () => void; onDiscard: () => void; onCompareChange: (comparing: boolean) => void };
expectTypeOf<Required>().toExtend<PreviewBarProps>();
expectTypeOf<Required & { seconds: 30; keepLabel: "Apply"; discardLabel: "Undo"; compareLabel: "Before"; announcement: "x"; compareKey: false; className: "mt-6" }>().toExtend<PreviewBarProps>();
expectTypeOf<ComponentProps<typeof PreviewBar>>().toEqualTypeOf<PreviewBarProps>();

// The four handlers and the label are required.
expectTypeOf<Omit<Required, "onKeep">>().not.toExtend<PreviewBarProps>();
expectTypeOf<Omit<Required, "onCompareChange">>().not.toExtend<PreviewBarProps>();

// Guessed props name the fix.
expectTypeOf<Required & { onAccept: () => void }>().not.toExtend<PreviewBarProps>();
expectTypeOf<Required & { timeout: 30 }>().not.toExtend<PreviewBarProps>();

// @ts-expect-error onAccept is onKeep.
createElement(PreviewBar, { label: "x", onKeep() {}, onDiscard() {}, onCompareChange() {}, onAccept: () => {} });
