import { createElement } from "react";
import { expectTypeOf } from "vitest";
import { Calendar, type CalendarProps, type DateRange } from "@/registry/ouro/components/ouro/calendar/calendar";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

// One day: the value is an ISO date string.
expectTypeOf<{ label: "Delivery date" }>().toExtend<CalendarProps>();
expectTypeOf<{
  label: "Delivery date";
  value: "2026-10-11";
  onValueChange: (value: string) => void;
  min: "2026-10-01";
  max: "2026-12-31";
  isDateDisabled: (date: string) => boolean;
  locale: "en-GB";
  defaultMonth: "2026-11-01";
  previousMonthLabel: "Vorheriger Monat";
  nextMonthLabel: "Nächster Monat";
  className: "mt-4";
}>().toExtend<CalendarProps>();

// A range: `range` switches the value to { start, end }.
expectTypeOf<{ label: "Trip"; range: true; value: DateRange; onValueChange: (value: DateRange) => void }>().toExtend<CalendarProps<true>>();
expectTypeOf<{ label: "Trip"; range: true; defaultValue: null }>().toExtend<CalendarProps<true>>();
expectTypeOf<{ label: "Trip"; range: true; value: "2026-10-11" }>().not.toExtend<CalendarProps<true>>();
expectTypeOf<{ label: "Trip"; range: true }>().not.toExtend<CalendarProps>();
// JSX infers the mode from `range` (calendar.test.tsx compiles both); here it is explicit.
createElement(Calendar<true>, { label: "Trip", range: true, value: { start: "2026-10-11", end: "2026-10-12" }, onValueChange: (value: DateRange) => void value });
createElement(Calendar<false>, { label: "Date", value: "2026-10-11", onValueChange: (value: string) => void value });
// @ts-expect-error a range's value is { start, end }, not one date.
createElement(Calendar<true>, { label: "Trip", range: true, value: "2026-10-11" });
expectTypeOf<{ label: "Date"; value: { start: "2026-10-11"; end: "2026-10-12" } }>().not.toExtend<CalendarProps>();
// @ts-expect-error a range's onValueChange gets { start, end }, not a string.
createElement(Calendar, { label: "Trip", range: true, onValueChange: (value: string) => void value });

// The label is required.
expectTypeOf<{ value: "2026-10-11" }>().not.toExtend<CalendarProps>();
// @ts-expect-error label is required.
createElement(Calendar, {});

// The guessed names are hint types that name the real prop.
expectTypeOf<{ label: "Date"; selected: "2026-10-11" }>().not.toExtend<CalendarProps>();
expectTypeOf<{ label: "Date"; onSelect: () => void }>().not.toExtend<CalendarProps>();
expectTypeOf<{ label: "Date"; onChange: () => void }>().not.toExtend<CalendarProps>();
expectTypeOf<{ label: "Date"; minDate: "2026-10-11" }>().not.toExtend<CalendarProps>();
expectTypeOf<{ label: "Date"; maxDate: "2026-10-11" }>().not.toExtend<CalendarProps>();
expectTypeOf<{ label: "Date"; weekStartsOn: 1 }>().not.toExtend<CalendarProps>();
expectTypeOf<{ label: "Date"; mode: "range" }>().not.toExtend<CalendarProps>();
expectTypeOf<{ label: "Date"; disabled: true }>().not.toExtend<CalendarProps>();
