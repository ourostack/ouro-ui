import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { LiveCaptions, type LiveCaptionLine, type LiveCaptionsProps } from "@/registry/ouro/components/ouro/live-captions/live-captions";
import type { ComponentAx } from "@/registry/ouro/ax/component";
import { liveCaptionsAx } from "@/registry/ouro/components/ouro/live-captions/live-captions-styles";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const lines: LiveCaptionLine[] = [{ id: "1", speaker: "Mara Lind", text: "Shall we start?", final: true }];

expectTypeOf<{ label: "Captions"; lines: typeof lines }>().toExtend<LiveCaptionsProps>();
expectTypeOf<{
  label: "Captions";
  lines: readonly LiveCaptionLine[];
  hideLabel: true;
  size: "lg";
  maxLines: 3;
  announce: true;
  placeholder: "Captions are on";
  unavailable: "Captions aren't available in this meeting";
  className: "max-w-3xl";
  id: "call-captions";
}>().toExtend<LiveCaptionsProps>();
expectTypeOf<ComponentProps<typeof LiveCaptions>>().toEqualTypeOf<LiveCaptionsProps>();

// The label and the lines are required; the guessed names are hint types.
expectTypeOf<{ lines: typeof lines }>().not.toExtend<LiveCaptionsProps>();
expectTypeOf<{ label: "Captions" }>().not.toExtend<LiveCaptionsProps>();
expectTypeOf<{ label: "Captions"; lines: typeof lines; captions: typeof lines }>().not.toExtend<LiveCaptionsProps>();
expectTypeOf<{ label: "Captions"; lines: typeof lines; readAloud: true }>().not.toExtend<LiveCaptionsProps>();
expectTypeOf<{ label: "Captions"; lines: typeof lines; size: "xl" }>().not.toExtend<LiveCaptionsProps>();
expectTypeOf<{ label: "Captions"; lines: typeof lines; announce: "polite" }>().not.toExtend<LiveCaptionsProps>();
expectTypeOf<{ label: "Captions"; lines: typeof lines; status: "Waiting" }>().not.toExtend<LiveCaptionsProps>();
// What the band says before anyone speaks, or why there are no captions, is any content, or nothing.
expectTypeOf<{ label: "Captions"; lines: typeof lines; placeholder: null; unavailable: false }>().toExtend<LiveCaptionsProps>();

// A line needs all four fields, and says it is final with `final`.
expectTypeOf<{ id: "1"; speaker: "Mara Lind"; text: "Hi"; final: false }>().toExtend<LiveCaptionLine>();
expectTypeOf<{ id: "1"; speaker: "Mara Lind"; text: "Hi" }>().not.toExtend<LiveCaptionLine>();
expectTypeOf<{ id: "1"; speaker: "Mara Lind"; text: "Hi"; final: true; isFinal: true }>().not.toExtend<LiveCaptionLine>();
// @ts-expect-error label is required.
createElement(LiveCaptions, { lines });

// The agent side is a checked Ouro AX declaration.
expectTypeOf(liveCaptionsAx).toEqualTypeOf<ComponentAx>();
