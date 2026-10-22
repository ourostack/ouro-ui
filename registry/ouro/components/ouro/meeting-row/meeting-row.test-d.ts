import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { MeetingRow, type MeetingRowProps, type MeetingState } from "@/registry/ouro/components/ouro/meeting-row/meeting-row";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "Weekly sync"; time: "10:00"; state: "upcoming" }>().toExtend<MeetingRowProps>();
expectTypeOf<{
  title: "Weekly sync";
  time: "10:00";
  dateTime: "2026-06-01T10:00";
  duration: "30 min";
  state: "now";
  status: "Organizer";
  statusTone: "primary";
  detail: "Room 4";
  actions: null;
  nowLabel: "En cours";
  className: "mt-1";
  id: "sync";
}>().toExtend<MeetingRowProps>();
expectTypeOf<MeetingState>().toEqualTypeOf<"past" | "now" | "upcoming">();
expectTypeOf<ComponentProps<typeof MeetingRow>>().toEqualTypeOf<MeetingRowProps>();

// title, time and state are required.
expectTypeOf<{ time: "10:00"; state: "upcoming" }>().not.toExtend<MeetingRowProps>();
expectTypeOf<{ title: "Weekly sync"; state: "upcoming" }>().not.toExtend<MeetingRowProps>();
expectTypeOf<{ title: "Weekly sync"; time: "10:00" }>().not.toExtend<MeetingRowProps>();

// Guessed props and values name the fix.
type Valid = { title: "Weekly sync"; time: "10:00"; state: "upcoming" };
expectTypeOf<Omit<Valid, "state"> & { state: "live" }>().not.toExtend<MeetingRowProps>();
expectTypeOf<Valid & { statusTone: "danger" }>().not.toExtend<MeetingRowProps>();
expectTypeOf<Valid & { subject: "Weekly sync" }>().not.toExtend<MeetingRowProps>();
expectTypeOf<Valid & { start: "10:00" }>().not.toExtend<MeetingRowProps>();

// @ts-expect-error state is required.
createElement(MeetingRow, { title: "Weekly sync", time: "10:00" });
