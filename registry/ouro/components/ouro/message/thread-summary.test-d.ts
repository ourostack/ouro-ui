import { createElement, type ComponentProps, type MouseEvent } from "react";
import { expectTypeOf } from "vitest";
import { ThreadSummary, type ThreadReplier, type ThreadSummaryProps } from "@/registry/ouro/components/ouro/message/thread-summary";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ count: 2; onOpen: () => void }>().toExtend<ThreadSummaryProps>();
expectTypeOf<{
  count: 0;
  onOpen: (event: MouseEvent<HTMLElement>) => void;
  repliers: readonly ThreadReplier[];
  lastReply: "7:44 AM";
  lastReplyDateTime: "2026-05-04T07:44";
  repliesLabel: (count: number) => string;
  replyLabel: "Répondre";
  lastReplyLabel: (time: string) => string;
  repliersLabel: "Ont répondu";
  className: "mt-1";
}>().toExtend<ThreadSummaryProps>();
expectTypeOf<{ name: "Mara Quill"; src: "/mara.png" }>().toExtend<ThreadReplier>();
expectTypeOf<ComponentProps<typeof ThreadSummary>>().toEqualTypeOf<ThreadSummaryProps>();

// count and onOpen are required.
expectTypeOf<{ count: 2 }>().not.toExtend<ThreadSummaryProps>();
expectTypeOf<{ onOpen: () => void }>().not.toExtend<ThreadSummaryProps>();

// Guessed props name the fix.
expectTypeOf<{ count: 2; onOpen: () => void; onClick: () => void }>().not.toExtend<ThreadSummaryProps>();
expectTypeOf<{ count: 2; onOpen: () => void; replyCount: 2 }>().not.toExtend<ThreadSummaryProps>();

// @ts-expect-error onOpen is required.
createElement(ThreadSummary, { count: 2 });
