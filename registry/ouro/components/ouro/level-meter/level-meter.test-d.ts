import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { LevelMeter, type LevelMeterProps } from "@/registry/ouro/components/ouro/level-meter/level-meter";
import type { ComponentAx } from "@/registry/ouro/ax/component";
import { levelMeterAx } from "@/registry/ouro/components/ouro/level-meter/level-meter-styles";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Microphone level"; value: 0.03 }>().toExtend<LevelMeterProps>();
expectTypeOf<{
  label: "Microphone level";
  value: 0.03;
  hideLabel: true;
  bars: 5;
  size: "sm";
  tone: "primary";
  muted: true;
  valueText: { quiet: "Leise"; speaking: "Spricht"; loud: "Laut"; muted: "Stumm" };
  className: "mt-2";
  id: "mic-level";
}>().toExtend<LevelMeterProps>();
expectTypeOf<ComponentProps<typeof LevelMeter>>().toEqualTypeOf<LevelMeterProps>();

// The label and the value are required; the guessed names are hint types.
expectTypeOf<{ value: 0.03 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level" }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.03; level: 0.03 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.03; max: 100 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.03; segments: 10 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.03; color: "green" }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.03; tone: "danger" }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.03; size: "xl" }>().not.toExtend<LevelMeterProps>();
// valueText needs a word for every band.
expectTypeOf<{ label: "Microphone level"; value: 0.03; valueText: { quiet: "Leise" } }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.03; valueText: { quiet: "Leise"; speaking: "Spricht"; loud: "Laut" } }>().not.toExtend<LevelMeterProps>();
// @ts-expect-error label is required.
createElement(LevelMeter, { value: 0.03 });

// The agent side is a checked Ouro AX declaration.
expectTypeOf(levelMeterAx).toEqualTypeOf<ComponentAx>();
