import { createElement } from "react";
import { expectTypeOf } from "vitest";
import { OtpField, type OtpFieldProps } from "@/registry/ouro/components/ouro/otp-field/otp-field";
expectTypeOf<readonly ["Taken."]>().toExtend<NonNullable<OtpFieldProps["error"]>>();

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Code" }>().toExtend<OtpFieldProps>();
expectTypeOf<{
  label: "Code";
  hideLabel: true;
  description: "We sent it to your phone.";
  error: ["Expired."];
  required: true;
  disabled: true;
  name: "code";
  length: 4;
  validationType: "alphanumeric";
  value: "12";
  onValueChange: (value: string) => void;
  onValueComplete: (value: string) => void;
  autoSubmit: true;
  mask: true;
  groupSize: 2;
  slotLabel: (position: number, length: number) => string;
  autoComplete: "one-time-code";
  readOnly: true;
  className: "mt-4";
}>().toExtend<OtpFieldProps>();

// The label is required, and is a string.
expectTypeOf<{ length: 6 }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: 1 }>().not.toExtend<OtpFieldProps>();

// An unknown validation type is a type error with the list.
expectTypeOf<{ label: "Code"; validationType: "digits" }>().not.toExtend<OtpFieldProps>();

// The guessed names are hint types that name the real prop.
expectTypeOf<{ label: "Code"; maxLength: 6 }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; numInputs: 6 }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; pattern: "x" }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; onComplete: () => void }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; onChange: () => void }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; errorMessage: "x" }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; helperText: "x" }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; isInvalid: true }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; invalid: true }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; isRequired: true }>().not.toExtend<OtpFieldProps>();
expectTypeOf<{ label: "Code"; isDisabled: true }>().not.toExtend<OtpFieldProps>();

// @ts-expect-error label is required.
createElement(OtpField, { length: 6 });
// @ts-expect-error shadcn's maxLength is length.
createElement(OtpField, { label: "Code", maxLength: 6 });
