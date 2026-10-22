import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import {
  DraftEditor,
  type DraftAuthor,
  type DraftEditorProps,
  type DraftReadiness,
  type DraftReadinessProps,
  type DraftSegment,
} from "@/registry/ouro/components/ouro/draft-editor/draft-editor";

// Type tests: `pnpm typecheck` compiles this file.

type Save = (value: string, segments: DraftSegment[] | undefined) => void;
expectTypeOf<{ label: "Reply"; value: "Hi"; segments: DraftSegment[]; onValueChange: Save }>().toExtend<DraftEditorProps>();
expectTypeOf<{
  label: "Reply";
  value: "Hi";
  segments: readonly DraftSegment[];
  onValueChange: Save;
  readiness: "ready-for-review";
  readinessBy: { author: "agent"; name: "Ouro" };
  readinessNote: "Check the dates";
  readinessLabel: "Prêt";
  agentLabel: "Écrit par l'agent";
  actions: null;
  placeholder: "Write a reply";
  rows: 1;
  maxRows: 8;
  name: "reply";
  className: "mt-2";
}>().toExtend<DraftEditorProps>();
expectTypeOf<{ author: "agent"; text: "Friday" }>().toExtend<DraftSegment>();
expectTypeOf<DraftAuthor>().toEqualTypeOf<"human" | "agent">();
expectTypeOf<DraftReadiness>().toEqualTypeOf<"drafting" | "needs-input" | "ready-for-review" | "approved">();
expectTypeOf<ComponentProps<typeof DraftEditor>>().toEqualTypeOf<DraftEditorProps>();

// label, value, segments and onValueChange are required.
expectTypeOf<{ value: "Hi"; segments: DraftSegment[]; onValueChange: Save }>().not.toExtend<DraftEditorProps>();
expectTypeOf<{ label: "Reply"; value: "Hi"; onValueChange: Save }>().not.toExtend<DraftEditorProps>();
expectTypeOf<{ label: "Reply"; value: "Hi"; segments: DraftSegment[] }>().not.toExtend<DraftEditorProps>();
// onValueChange gives undefined runs when the segments were out of step, so a handler takes them.
expectTypeOf<{ label: "Reply"; value: "Hi"; segments: DraftSegment[]; onValueChange: (value: string, segments: DraftSegment[]) => void }>().not.toExtend<DraftEditorProps>();
// Only a person approves: approved takes a person in readinessBy.
expectTypeOf<{ readiness: "approved"; readinessBy: { author: "human"; name: "You" } }>().toExtend<DraftReadinessProps>();
expectTypeOf<{ readiness: "approved"; readinessBy: { author: "agent"; name: "Ouro" } }>().not.toExtend<DraftReadinessProps>();
expectTypeOf<{ readiness: "approved" }>().not.toExtend<DraftReadinessProps>();
expectTypeOf<{ readiness: "needs-input"; readinessBy: { author: "agent"; name: "Ouro" } }>().toExtend<DraftReadinessProps>();
// A run's author is a person or an agent.
expectTypeOf<{ author: "assistant"; text: "Hi" }>().not.toExtend<DraftSegment>();

// Guessed props and values name the fix.
type Valid = { label: "Reply"; value: "Hi"; segments: DraftSegment[]; onValueChange: Save };
expectTypeOf<Valid & { readiness: "done" }>().not.toExtend<DraftEditorProps>();
expectTypeOf<Valid & { provenance: DraftSegment[] }>().not.toExtend<DraftEditorProps>();
expectTypeOf<Valid & { defaultValue: "Hi" }>().not.toExtend<DraftEditorProps>();
expectTypeOf<Valid & { onChange: () => void }>().not.toExtend<DraftEditorProps>();

// @ts-expect-error segments is required.
createElement(DraftEditor, { label: "Reply", value: "Hi", onValueChange: () => {} });
