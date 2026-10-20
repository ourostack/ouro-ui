import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Timer, type TimerProps } from "@/registry/ouro/components/ouro/timer/timer";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ label: "Pasta"; duration: 600 }>().toExtend<TimerProps>();
expectTypeOf<{ label: "Pasta"; duration: 600; id: "pasta"; silent: true; size: "lg"; labels: { start: "Go" }; onDone: () => void; className: "mt-6" }>().toExtend<TimerProps>();
expectTypeOf<ComponentProps<typeof Timer>>().toEqualTypeOf<TimerProps>();

// label and duration are required.
expectTypeOf<{ duration: 600 }>().not.toExtend<TimerProps>();
expectTypeOf<{ label: "Pasta" }>().not.toExtend<TimerProps>();

// Guessed props and values name the fix.
expectTypeOf<{ label: "P"; duration: 1; seconds: 600 }>().not.toExtend<TimerProps>();
expectTypeOf<{ label: "P"; duration: 1; minutes: 10 }>().not.toExtend<TimerProps>();
expectTypeOf<{ label: "P"; duration: 1; onComplete: () => void }>().not.toExtend<TimerProps>();
expectTypeOf<{ label: "P"; duration: 1; size: "xl" }>().not.toExtend<TimerProps>();

// @ts-expect-error minutes is not a prop.
createElement(Timer, { label: "P", duration: 1, minutes: 10 });
