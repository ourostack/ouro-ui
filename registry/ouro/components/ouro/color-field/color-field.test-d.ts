import { createElement } from "react";
import { expectTypeOf } from "vitest";
import { ColorField, type ColorFieldProps } from "@/registry/ouro/components/ouro/color-field/color-field";
expectTypeOf<readonly ["Taken."]>().toExtend<NonNullable<ColorFieldProps["error"]>>();

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Color" }>().toExtend<ColorFieldProps>();
expectTypeOf<{
  label: "Color";
  hideLabel: true;
  description: "For your tags.";
  error: "Too light.";
  required: true;
  disabled: true;
  name: "color";
  value: "#3366ff";
  onValueChange: (hex: string) => void;
  pickerLabel: "Pick a color";
  className: "mt-4";
}>().toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; defaultValue: "#36f" }>().toExtend<ColorFieldProps>();

// The label is required.
expectTypeOf<{ value: "#000000" }>().not.toExtend<ColorFieldProps>();

// The guessed names are hint types that name the real prop.
expectTypeOf<{ label: "Color"; format: "rgb" }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; alpha: true }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; color: "#ff0000" }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; onChange: () => void }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; errorMessage: "x" }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; helperText: "x" }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; isInvalid: true }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; invalid: true }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; isRequired: true }>().not.toExtend<ColorFieldProps>();
expectTypeOf<{ label: "Color"; isDisabled: true }>().not.toExtend<ColorFieldProps>();

// @ts-expect-error label is required.
createElement(ColorField, { value: "#000000" });
// @ts-expect-error color is value or defaultValue.
createElement(ColorField, { label: "Color", color: "#ff0000" });
