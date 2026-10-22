import { createElement, type ComponentProps, type MouseEvent } from "react";
import { expectTypeOf } from "vitest";
import { LayoutProposal, type LayoutProposalHandler, type LayoutProposalProps } from "@/registry/ouro/components/ouro/layout-proposal/layout-proposal";

// Type tests: `pnpm typecheck` compiles this file.

type Decide = (id: string, event: MouseEvent<HTMLElement>) => void;
expectTypeOf<LayoutProposalHandler>().toEqualTypeOf<Decide>();
expectTypeOf<{ id: "p1"; title: "Customers first"; by: "Ouro"; onApply: Decide; onDiscard: Decide }>().toExtend<LayoutProposalProps>();
expectTypeOf<{
  id: "p1";
  title: "Customers first";
  by: "Ouro";
  time: "2 min ago";
  reason: "You open customer chats first.";
  children: null;
  previewing: true;
  onPreview: Decide;
  onEndPreview: Decide;
  onApply: Decide;
  onDiscard: Decide;
  proposedLabel: "Proposition";
  previewingLabel: "Aperçu";
  previewNote: "Rien ne change.";
  previewLabel: "Aperçu";
  endPreviewLabel: "Revenir";
  applyLabel: "Appliquer";
  discardLabel: "Ignorer";
  className: "mt-2";
}>().toExtend<LayoutProposalProps>();
expectTypeOf<ComponentProps<typeof LayoutProposal>>().toEqualTypeOf<LayoutProposalProps>();

// id, title, by, onApply and onDiscard are required.
type Valid = { id: "p1"; title: "Customers first"; by: "Ouro"; onApply: Decide; onDiscard: Decide };
expectTypeOf<Omit<Valid, "id">>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Omit<Valid, "by">>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Omit<Valid, "onApply">>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Omit<Valid, "onDiscard">>().not.toExtend<LayoutProposalProps>();

// Guessed props name the fix.
expectTypeOf<Valid & { onAccept: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onReject: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onDismiss: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onBack: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { note: "Why" }>().not.toExtend<LayoutProposalProps>();

// @ts-expect-error id is required.
createElement(LayoutProposal, { title: "Customers first", by: "Ouro", onApply: () => {}, onDiscard: () => {} });
