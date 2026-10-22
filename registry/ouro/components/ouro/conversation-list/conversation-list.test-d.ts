import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import {
  ConversationList,
  type ConversationListDensity,
  type ConversationListItem,
  type ConversationListProps,
} from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

// Type tests: `pnpm typecheck` compiles this file.

declare const items: ConversationListItem[];
expectTypeOf<{ label: "Conversations"; items: typeof items; onSelect: (id: string) => void }>().toExtend<ConversationListProps>();
expectTypeOf<{
  label: "Conversations";
  items: readonly ConversationListItem[];
  onSelect: (id: string) => void;
  selectedId: null;
  empty: "Nothing yet";
  density: "compact";
  unreadLabel: "Non lu";
  className: "w-80";
  id: "inbox";
}>().toExtend<ConversationListProps>();
expectTypeOf<{ id: "a"; title: "Trail crew"; subtitle: "Hikes"; preview: "Meet at eight"; time: "9:41"; unread: true; badges: null; avatar: false }>().toExtend<ConversationListItem>();
expectTypeOf<ComponentProps<typeof ConversationList>>().toEqualTypeOf<ConversationListProps>();
expectTypeOf<ConversationListDensity>().toEqualTypeOf<"comfortable" | "compact">();

// label, items and onSelect are required.
expectTypeOf<{ items: typeof items; onSelect: (id: string) => void }>().not.toExtend<ConversationListProps>();
expectTypeOf<{ label: "Conversations"; onSelect: (id: string) => void }>().not.toExtend<ConversationListProps>();
expectTypeOf<{ label: "Conversations"; items: typeof items }>().not.toExtend<ConversationListProps>();

// Guessed props and values name the fix.
expectTypeOf<{ label: "Conversations"; items: typeof items; onSelect: (id: string) => void; density: "cozy" }>().not.toExtend<ConversationListProps>();
expectTypeOf<{ label: "Conversations"; items: typeof items; onSelect: (id: string) => void; value: "a" }>().not.toExtend<ConversationListProps>();
expectTypeOf<{ label: "Conversations"; items: typeof items; onSelect: (id: string) => void; selected: "a" }>().not.toExtend<ConversationListProps>();
expectTypeOf<{ label: "Conversations"; items: typeof items; onSelect: (id: string) => void; onValueChange: () => void }>().not.toExtend<ConversationListProps>();
expectTypeOf<{ label: "Conversations"; onSelect: (id: string) => void; conversations: typeof items }>().not.toExtend<ConversationListProps>();

// @ts-expect-error label is required.
createElement(ConversationList, { items, onSelect: () => {} });
