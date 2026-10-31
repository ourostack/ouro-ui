import { createElement, type ComponentProps, type MouseEvent } from "react";
import { expectTypeOf } from "vitest";
import { ReactionBar, type Reaction, type ReactionBarProps, type ReactionOption } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";

// Type tests: `pnpm typecheck` compiles this file.

declare const quick: ReactionOption[];
expectTypeOf<{ reactions: Reaction[] }>().toExtend<ReactionBarProps>();
expectTypeOf<{
  reactions: readonly Reaction[];
  quick: readonly ReactionOption[];
  onReact: (key: string, event: MouseEvent<HTMLElement>) => void;
  disabled: true;
  onMore: (event: MouseEvent<HTMLElement>) => void;
  moreOpen: false;
  moreLabel: "Ajouter";
  label: "Réactions";
  mineLabel: "dont vous";
  className: "mt-1";
}>().toExtend<ReactionBarProps>();
expectTypeOf<{ key: "like"; label: "Like"; emoji: "👍"; count: 2; mine: true }>().toExtend<Reaction>();
expectTypeOf<{ key: "like"; label: "Like"; emoji: "👍" }>().toExtend<ReactionOption>();
expectTypeOf<ComponentProps<typeof ReactionBar>>().toEqualTypeOf<ReactionBarProps>();

// reactions is required, and each reaction has a label for screen readers.
expectTypeOf<{ quick: typeof quick }>().not.toExtend<ReactionBarProps>();
expectTypeOf<{ key: "like"; emoji: "👍"; count: 2 }>().not.toExtend<Reaction>();

// Guessed props name the fix.
expectTypeOf<{ reactions: Reaction[]; onReactionClick: () => void }>().not.toExtend<ReactionBarProps>();
expectTypeOf<{ reactions: Reaction[]; items: Reaction[] }>().not.toExtend<ReactionBarProps>();
expectTypeOf<{ reactions: Reaction[]; onAddReaction: () => void }>().not.toExtend<ReactionBarProps>();

// @ts-expect-error reactions is required.
createElement(ReactionBar, { quick });
