import { createElement, createRef, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { SnapPiP, type SnapPiPCorner, type SnapPiPProps } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";
import { snapPipAx } from "@/registry/ouro/components/ouro/snap-pip/snap-pip-styles";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Your camera" }>().toExtend<SnapPiPProps>();
expectTypeOf<{
  label: "Your camera";
  corner: "top-left";
  onCornerChange: (corner: SnapPiPCorner) => void;
  size: "large";
  onSizeChange: (size: "small" | "large") => void;
  inset: 24;
  keepOut: [{ x: 0; y: 400; width: 800; height: 80 }, ReturnType<typeof createRef<HTMLDivElement>>];
  aspectRatio: 1.6;
  hint: "Option-arrow keys to move it";
  cornerLabels: { "top-left": "Oben links"; "top-right": "Oben rechts"; "bottom-left": "Unten links"; "bottom-right": "Unten rechts" };
  className: "z-10";
  id: "self-view";
}>().toExtend<SnapPiPProps>();
expectTypeOf<{ label: "Your camera"; defaultCorner: "bottom-left"; defaultSize: "small" }>().toExtend<SnapPiPProps>();
expectTypeOf<ComponentProps<typeof SnapPiP>>().toEqualTypeOf<SnapPiPProps>();
expectTypeOf<SnapPiPCorner>().toEqualTypeOf<"top-left" | "top-right" | "bottom-left" | "bottom-right">();

// The label is required; the guessed names and values are hint types.
expectTypeOf<{ corner: "top-left" }>().not.toExtend<SnapPiPProps>();
expectTypeOf<{ label: "Your camera"; corner: "top" }>().not.toExtend<SnapPiPProps>();
expectTypeOf<{ label: "Your camera"; size: "medium" }>().not.toExtend<SnapPiPProps>();
expectTypeOf<{ label: "Your camera"; position: { x: 0; y: 0 } }>().not.toExtend<SnapPiPProps>();
expectTypeOf<{ label: "Your camera"; offset: 16 }>().not.toExtend<SnapPiPProps>();
expectTypeOf<{ label: "Your camera"; avoid: [] }>().not.toExtend<SnapPiPProps>();
// A keep-out is a rectangle with all four sides, or a ref.
expectTypeOf<{ label: "Your camera"; keepOut: [{ x: 0; y: 0 }] }>().not.toExtend<SnapPiPProps>();
// Corner labels need a word for every corner.
expectTypeOf<{ label: "Your camera"; cornerLabels: { "top-left": "Oben links" } }>().not.toExtend<SnapPiPProps>();
// @ts-expect-error label is required.
createElement(SnapPiP, { corner: "top-left" });

// The agent side: no reads, and one move only the person makes, as literal types for Ouro AX's kit.
expectTypeOf(snapPipAx).toEqualTypeOf<{
  readonly component: "SnapPiP";
  readonly reads: readonly [];
  readonly actions: readonly [
    {
      readonly id: "move";
      readonly summary: "Move the person's own picture to another corner.";
      readonly effect: "private";
      readonly personOnly: "You can't move the person's own picture; only they can.";
    },
  ];
}>();
