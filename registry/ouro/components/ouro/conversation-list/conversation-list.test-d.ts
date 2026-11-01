import { createElement, type ComponentProps, type MouseEvent, type ReactElement } from "react";
import { expectTypeOf } from "vitest";
import {
  ConversationList,
  type ConversationListDensity,
  type ConversationListItem,
  type ConversationListProps,
  type ConversationListSection,
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
expectTypeOf<{ id: "a"; title: "Design reviews"; where: "Lantern Labs"; icon: null; mark: "in 10 min"; avatar: ReactElement; section: "pinned" }>().toExtend<ConversationListItem>();
expectTypeOf<{ id: "halden"; title: "Halden"; nameTag: "AI agent" }>().toExtend<ConversationListItem>();
expectTypeOf<{ id: "pinned"; title: "Pinned"; note: "your folder"; defaultOpen: false; open: true }>().toExtend<ConversationListSection>();
expectTypeOf<{
  label: "Chats";
  items: typeof items;
  sections: readonly ConversationListSection[];
  onSectionOpenChange: (id: string, open: boolean) => void;
  onSelect: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
}>().toExtend<ConversationListProps>();
// The handler may take the click second, or leave it out.
expectTypeOf<Parameters<ConversationListProps["onSelect"]>>().toEqualTypeOf<[id: string, event: MouseEvent<HTMLButtonElement>]>();
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
expectTypeOf<{ label: "Conversations"; items: typeof items; onSelect: (id: string) => void; groups: [] }>().not.toExtend<ConversationListProps>();
// A section needs its id and title; an avatar is a URL, an element or false.
expectTypeOf<{ id: "pinned" }>().not.toExtend<ConversationListSection>();
expectTypeOf<{ id: "a"; title: "Trail crew"; avatar: true }>().not.toExtend<ConversationListItem>();

// @ts-expect-error label is required.
createElement(ConversationList, { items, onSelect: () => {} });

// A title as content needs its name as text; a text title may take one.
expectTypeOf<{ id: "launch"; title: ReactElement; name: "Launch team"; where: ReactElement }>().toExtend<ConversationListItem>();
expectTypeOf<{ id: "ada"; title: "Ada Lovelace"; name: "Ada L." }>().toExtend<ConversationListItem>();
expectTypeOf<{ id: "launch"; title: ReactElement }>().not.toExtend<ConversationListItem>();
