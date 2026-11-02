import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { LevelMeter, type LevelMeterProps } from "@/registry/ouro/components/ouro/level-meter/level-meter";
import { levelMeterAx } from "@/registry/ouro/components/ouro/level-meter/level-meter-styles";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Microphone level"; value: 0.4 }>().toExtend<LevelMeterProps>();
expectTypeOf<{
  label: "Microphone level";
  value: 0.4;
  hideLabel: true;
  bars: 5;
  size: "sm";
  tone: "primary";
  valueText: { quiet: "Leise"; speaking: "Spricht"; loud: "Laut" };
  className: "mt-2";
  id: "mic-level";
}>().toExtend<LevelMeterProps>();
expectTypeOf<ComponentProps<typeof LevelMeter>>().toEqualTypeOf<LevelMeterProps>();

// The label and the value are required; the guessed names are hint types.
expectTypeOf<{ value: 0.4 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level" }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.4; level: 0.4 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.4; max: 100 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.4; segments: 10 }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.4; color: "green" }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.4; tone: "danger" }>().not.toExtend<LevelMeterProps>();
expectTypeOf<{ label: "Microphone level"; value: 0.4; size: "xl" }>().not.toExtend<LevelMeterProps>();
// valueText needs a word for every band.
expectTypeOf<{ label: "Microphone level"; value: 0.4; valueText: { quiet: "Leise" } }>().not.toExtend<LevelMeterProps>();
// @ts-expect-error label is required.
createElement(LevelMeter, { value: 0.4 });

// The agent side: no reads and no actions, as literal types for Ouro AX's kit.
expectTypeOf(levelMeterAx).toEqualTypeOf<{ readonly component: "LevelMeter"; readonly reads: readonly []; readonly actions: readonly [] }>();
