import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { EventChip, type EventChipProps, type EventChipState } from "@/registry/ouro/components/ouro/event-chip/event-chip";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "Weekly sync"; when: "in 12 min" }>().toExtend<EventChipProps>();
expectTypeOf<{
  title: "Weekly sync";
  when: "in 12 min";
  state: "soon";
  status: "Needs you";
  statusTone: "warning";
  label: "Next meeting";
  href: "/meetings/sync";
  className: "max-w-80";
}>().toExtend<EventChipProps>();
expectTypeOf<{ title: "Weekly sync"; when: "now"; state: "now"; onClick: () => void }>().toExtend<EventChipProps>();
expectTypeOf<EventChipState>().toEqualTypeOf<"upcoming" | "soon" | "now">();
expectTypeOf<ComponentProps<typeof EventChip>>().toEqualTypeOf<EventChipProps>();

// title and when are required.
expectTypeOf<{ when: "in 12 min" }>().not.toExtend<EventChipProps>();
expectTypeOf<{ title: "Weekly sync" }>().not.toExtend<EventChipProps>();

// Guessed props and values name the fix.
type Valid = { title: "Weekly sync"; when: "in 12 min" };
expectTypeOf<Valid & { state: "late" }>().not.toExtend<EventChipProps>();
expectTypeOf<Valid & { statusTone: "danger" }>().not.toExtend<EventChipProps>();
expectTypeOf<Valid & { subject: "Weekly sync" }>().not.toExtend<EventChipProps>();
expectTypeOf<Valid & { onOpen: () => void }>().not.toExtend<EventChipProps>();
expectTypeOf<Valid & { soon: true }>().not.toExtend<EventChipProps>();

// @ts-expect-error when is required.
createElement(EventChip, { title: "Weekly sync" });
