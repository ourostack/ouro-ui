import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { TimeGrid, type TimeGridEvent, type TimeGridProps, type TimeGridSlot, type TimeGridStatus, type TimeGridTone, type TimeGridView } from "@/registry/ouro/components/ouro/time-grid/time-grid";

// Type tests: `pnpm typecheck` compiles this file.

const event = { id: "1", title: "Design review", start: "2026-03-12T09:00:00Z", end: "2026-03-12T10:00:00Z" };

expectTypeOf<{ label: "Team calendar"; date: "2026-03-12"; events: TimeGridEvent[] }>().toExtend<TimeGridProps>();
expectTypeOf<{
  label: string;
  date: string;
  events: readonly TimeGridEvent[];
  view: "work-week";
  timeZone: "Europe/Berlin";
  locale: "de-DE";
  now: Date;
  workingHours: { start: 8.5; end: 17 };
  selectedId: null;
  onEventSelect: (event: TimeGridEvent) => void;
  onSlotSelect: (slot: TimeGridSlot) => void;
  slotMinutes: 15;
  allDayLabel: "Ganztägig";
  statusLabels: { unanswered: "Antwort fehlt" };
  className: "h-full";
  id: "calendar";
}>().toExtend<TimeGridProps>();
expectTypeOf<ComponentProps<typeof TimeGrid>>().toEqualTypeOf<TimeGridProps>();
expectTypeOf<TimeGridView>().toEqualTypeOf<"day" | "work-week" | "week">();
expectTypeOf<TimeGridTone>().toEqualTypeOf<"primary" | "secondary" | "success" | "warning" | "destructive">();
expectTypeOf<TimeGridStatus>().toEqualTypeOf<"busy" | "tentative" | "free" | "unanswered" | "cancelled">();
expectTypeOf<TimeGridSlot>().toEqualTypeOf<{ start: Date; end: Date }>();

// An event: an all-day one has a date for its start, and the fields take named tones and statuses.
expectTypeOf<typeof event>().toExtend<TimeGridEvent>();
expectTypeOf<{ id: "1"; title: "Offsite"; start: "2026-03-12"; end: "2026-03-13"; tone: "success"; status: "tentative"; href: "/events/1"; description: "Harbour Hall" }>().toExtend<TimeGridEvent>();
expectTypeOf<{ id: "1"; title: "Offsite"; start: number; end: Date }>().toExtend<TimeGridEvent>();

// label, date and events are required.
expectTypeOf<{ date: "2026-03-12"; events: [] }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "Team calendar"; events: [] }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "Team calendar"; date: "2026-03-12" }>().not.toExtend<TimeGridProps>();

// Guessed props, values and fields name the fix.
expectTypeOf<{ label: "x"; date: "2026-03-12"; events: []; view: "month" }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "x"; date: "2026-03-12"; events: []; slotMinutes: 20 }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "x"; date: "2026-03-12"; events: []; defaultView: "week" }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "x"; date: "2026-03-12"; events: []; defaultDate: Date }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "x"; date: "2026-03-12"; events: []; onSelectEvent: () => void }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "x"; date: "2026-03-12"; events: []; onSelectSlot: () => void }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ label: "x"; date: "2026-03-12"; events: []; scrollToTime: Date }>().not.toExtend<TimeGridProps>();
expectTypeOf<{ id: "1"; title: "x"; start: "2026-03-12"; tone: "danger" }>().not.toExtend<TimeGridEvent>();
expectTypeOf<{ id: "1"; title: "x"; start: "2026-03-12"; status: "maybe" }>().not.toExtend<TimeGridEvent>();
expectTypeOf<{ id: "1"; title: "x"; start: "2026-03-12"; allDay: true }>().not.toExtend<TimeGridEvent>();
expectTypeOf<{ id: "1"; title: "x"; start: "2026-03-12"; color: "red" }>().not.toExtend<TimeGridEvent>();

// @ts-expect-error onSelectEvent is not a prop.
createElement(TimeGrid, { label: "x", date: "2026-03-12", events: [event], onSelectEvent: () => {} });
