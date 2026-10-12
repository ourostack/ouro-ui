import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Progress, type ProgressProps } from "@/registry/ouro/components/ouro/progress/progress";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Uploading"; value: 40 }>().toExtend<ProgressProps>();
expectTypeOf<{ label: "Importing"; value: null }>().toExtend<ProgressProps>();
expectTypeOf<{
  label: "Uploading";
  value: 3;
  min: 0;
  max: 4;
  hideLabel: true;
  showValue: true;
  format: { style: "percent" };
  tone: "success";
  className: "mt-4";
  id: "upload";
}>().toExtend<ProgressProps>();
expectTypeOf<ComponentProps<typeof Progress>>().toEqualTypeOf<ProgressProps>();

// The label and the value are required; an unknown value is null, not a flag.
expectTypeOf<{ value: 40 }>().not.toExtend<ProgressProps>();
expectTypeOf<{ label: "Uploading" }>().not.toExtend<ProgressProps>();
expectTypeOf<{ label: "Uploading"; value: null; indeterminate: true }>().not.toExtend<ProgressProps>();
expectTypeOf<{ label: "Uploading"; value: null; isIndeterminate: true }>().not.toExtend<ProgressProps>();
expectTypeOf<{ label: "Uploading"; value: 40; variant: "determinate" }>().not.toExtend<ProgressProps>();
expectTypeOf<{ label: "Uploading"; value: 40; color: "green" }>().not.toExtend<ProgressProps>();
expectTypeOf<{ label: "Uploading"; value: 40; tone: "danger" }>().not.toExtend<ProgressProps>();
// @ts-expect-error label is required.
createElement(Progress, { value: 40 });
