import { createElement } from "react";
import { expectTypeOf } from "vitest";
import { DatePicker, type DatePickerProps } from "@/registry/ouro/components/ouro/calendar/date-picker";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

// The Field contract, the ISO value and the translatable labels.
expectTypeOf<{ label: "Delivery date" }>().toExtend<DatePickerProps>();
expectTypeOf<{
  label: "Delivery date";
  hideLabel: true;
  description: "Weekdays only.";
  error: ["Required.", "Pick a weekday."];
  required: true;
  disabled: true;
  name: "delivery";
  value: "2026-10-11";
  onValueChange: (value: string) => void;
  min: "2026-10-01";
  max: "2026-12-31";
  isDateDisabled: (date: string) => boolean;
  locale: "en-GB";
  placeholder: "DD/MM/YYYY";
  readOnly: true;
  chooseDateLabel: "Datum wählen";
  previousMonthLabel: "Vorheriger Monat";
  nextMonthLabel: "Nächster Monat";
  closeLabel: "Schließen";
  invalidDateMessage: "Ungültiges Datum.";
  className: "mt-4";
}>().toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; chooseDateLabel: 1 }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; value: Date }>().not.toExtend<DatePickerProps>();

// The label is required.
expectTypeOf<{ name: "date" }>().not.toExtend<DatePickerProps>();
// @ts-expect-error label is required.
createElement(DatePicker, { name: "date" });

// The guessed names are hint types that name the real prop.
expectTypeOf<{ label: "Date"; errorMessage: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; helperText: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; isInvalid: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; invalid: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; isRequired: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; isDisabled: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; onChange: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; selected: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; minDate: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; maxDate: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; dateFormat: "x" }>().not.toExtend<DatePickerProps>();
expectTypeOf<{ label: "Date"; format: "x" }>().not.toExtend<DatePickerProps>();
// @ts-expect-error onChange is a hint type: onValueChange gets the ISO date.
createElement(DatePicker, { label: "Date", onChange: () => {} });
