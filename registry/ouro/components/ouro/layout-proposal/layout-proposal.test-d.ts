import { createElement, type ComponentProps, type MouseEvent } from "react";
import { expectTypeOf } from "vitest";
import { LayoutProposal, type LayoutProposalHandler, type LayoutProposalProps } from "@/registry/ouro/components/ouro/layout-proposal/layout-proposal";

// Type tests: `pnpm typecheck` compiles this file.

type Decide = (proposalId: string, event: MouseEvent<HTMLElement>) => unknown;
expectTypeOf<LayoutProposalHandler>().toEqualTypeOf<Decide>();
expectTypeOf<{ proposalId: "p1"; title: "Customers first"; by: "Ouro"; onApply: Decide; onDiscard: Decide }>().toExtend<LayoutProposalProps>();
expectTypeOf<{
  proposalId: "p1";
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

// proposalId, title, by, onApply and onDiscard are required.
type Valid = { proposalId: "p1"; title: "Customers first"; by: "Ouro"; onApply: Decide; onDiscard: Decide };
expectTypeOf<Omit<Valid, "proposalId">>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Omit<Valid, "by">>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Omit<Valid, "onApply">>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Omit<Valid, "onDiscard">>().not.toExtend<LayoutProposalProps>();

// Preview takes both handlers or neither; id is the HTML id.
expectTypeOf<Valid & { onPreview: Decide }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onEndPreview: Decide }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onPreview: Decide; onEndPreview: Decide }>().toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { id: "proposal" }>().toExtend<LayoutProposalProps>();

// Guessed props name the fix.
expectTypeOf<Valid & { onAccept: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onReject: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onDismiss: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { onBack: () => void }>().not.toExtend<LayoutProposalProps>();
expectTypeOf<Valid & { note: "Why" }>().not.toExtend<LayoutProposalProps>();

// @ts-expect-error proposalId is required.
createElement(LayoutProposal, { title: "Customers first", by: "Ouro", onApply: () => {}, onDiscard: () => {} });
