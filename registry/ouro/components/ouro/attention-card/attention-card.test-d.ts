import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { AttentionCard, type AttentionCardProps } from "@/registry/ouro/components/ouro/attention-card/attention-card";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ reason: "Asked you"; title: "Design review"; from: "Ada" }>().toExtend<AttentionCardProps>();
expectTypeOf<{
  reason: "Mentioned you";
  tone: "warning";
  title: "Design review";
  from: "Ada";
  time: "9:41";
  children: "Can you review?";
  onOpen: () => void;
  actions: null;
  className: "mt-2";
  id: "card";
}>().toExtend<AttentionCardProps>();
expectTypeOf<ComponentProps<typeof AttentionCard>>().toEqualTypeOf<AttentionCardProps>();

// reason, title and from are required.
expectTypeOf<{ title: "Design review"; from: "Ada" }>().not.toExtend<AttentionCardProps>();
expectTypeOf<{ reason: "Asked you"; from: "Ada" }>().not.toExtend<AttentionCardProps>();
expectTypeOf<{ reason: "Asked you"; title: "Design review" }>().not.toExtend<AttentionCardProps>();

// Guessed props and values name the fix.
expectTypeOf<{ reason: "Asked you"; title: "Design review"; from: "Ada"; tone: "danger" }>().not.toExtend<AttentionCardProps>();
expectTypeOf<{ reason: "Asked you"; title: "Design review"; from: "Ada"; message: "Hi" }>().not.toExtend<AttentionCardProps>();
expectTypeOf<{ reason: "Asked you"; title: "Design review"; from: "Ada"; text: "Hi" }>().not.toExtend<AttentionCardProps>();
expectTypeOf<{ reason: "Asked you"; title: "Design review"; from: "Ada"; onClick: () => void }>().not.toExtend<AttentionCardProps>();

// @ts-expect-error from is required.
createElement(AttentionCard, { reason: "Asked you", title: "Design review" });
