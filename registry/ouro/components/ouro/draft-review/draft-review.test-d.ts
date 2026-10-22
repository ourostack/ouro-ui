import { createElement, type ComponentProps, type MouseEvent } from "react";
import { expectTypeOf } from "vitest";
import { DraftReview, type DraftChange, type DraftReviewProps, type DraftReviewSegment } from "@/registry/ouro/components/ouro/draft-review/draft-review";

// Type tests: `pnpm typecheck` compiles this file.

type Decide = (id: string, event: MouseEvent<HTMLElement>) => void;
expectTypeOf<{ segments: DraftReviewSegment[]; changes: DraftChange[]; onAccept: Decide; onReject: Decide }>().toExtend<DraftReviewProps>();
expectTypeOf<{
  segments: readonly DraftReviewSegment[];
  changes: readonly DraftChange[];
  onAccept: Decide;
  onReject: Decide;
  onAcceptAll: (event: MouseEvent<HTMLElement>) => void;
  onRejectAll: (event: MouseEvent<HTMLElement>) => void;
  onShowSource: (id: string) => void;
  label: "Changes";
  heading: "Two changes";
  description: "Since you last edited";
  actions: null;
  acceptLabel: "Accepter";
  rejectLabel: "Refuser";
  acceptAllLabel: "Tout accepter";
  rejectAllLabel: "Tout refuser";
  showSourceLabel: "Voir";
  agentLabel: "Agent IA";
  changeLabel: (n: number) => string;
  insertedLabel: "ajouté";
  deletedLabel: "supprimé";
  className: "mt-2";
}>().toExtend<DraftReviewProps>();
expectTypeOf<{ kind: "insert"; text: "Friday"; changeId: "c1" }>().toExtend<DraftReviewSegment>();
expectTypeOf<{ id: "c1"; author: "agent"; name: "Ouro"; time: "2 min ago"; source: "Based on 3 messages" }>().toExtend<DraftChange>();
expectTypeOf<ComponentProps<typeof DraftReview>>().toEqualTypeOf<DraftReviewProps>();

// Accepting and rejecting are both required, and every change says who made it.
type Valid = { segments: DraftReviewSegment[]; changes: DraftChange[]; onAccept: Decide; onReject: Decide };
expectTypeOf<Omit<Valid, "onReject">>().not.toExtend<DraftReviewProps>();
expectTypeOf<{ id: "c1"; name: "Ouro" }>().not.toExtend<DraftChange>();
expectTypeOf<{ id: "c1"; author: "bot"; name: "Ouro" }>().not.toExtend<DraftChange>();
expectTypeOf<{ kind: "add"; text: "Friday" }>().not.toExtend<DraftReviewSegment>();

// Guessed props name the fix.
expectTypeOf<Valid & { diff: DraftReviewSegment[] }>().not.toExtend<DraftReviewProps>();
expectTypeOf<Valid & { onApprove: () => void }>().not.toExtend<DraftReviewProps>();
expectTypeOf<Valid & { onDecline: () => void }>().not.toExtend<DraftReviewProps>();

// @ts-expect-error onAccept is required.
createElement(DraftReview, { segments: [], changes: [], onReject: () => {} });
