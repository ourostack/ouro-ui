import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ChatHeader, type ChatHeaderProps } from "@/registry/ouro/components/ouro/chat-header/chat-header";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "Crew"; members: [{ name: "Ana Lind" }] }>().toExtend<ChatHeaderProps>();
expectTypeOf<{
  title: "Crew";
  members: [{ name: "Ana Lind"; src: "/ana.jpg"; presence: "busy"; presenceLabel: "In a meeting"; note: "the captain"; idForColor: "u-1"; initials: "AL" }];
  avatar: "/crew.jpg";
  subtitle: "Planning";
  actions: null;
  onBack: () => void;
  backLabel: "Chats";
  level: 3;
  othersLabel: (names: readonly string[]) => string;
  membersLabel: (count: number) => string;
  membersTitle: "Members";
  className: "px-4";
}>().toExtend<ChatHeaderProps>();
expectTypeOf<ComponentProps<typeof ChatHeader>>().toEqualTypeOf<ChatHeaderProps>();

// title and members are required; a member needs a name.
expectTypeOf<{ members: [{ name: "Ana Lind" }] }>().not.toExtend<ChatHeaderProps>();
expectTypeOf<{ title: "Crew" }>().not.toExtend<ChatHeaderProps>();
expectTypeOf<{ title: "Crew"; members: [{ src: "/ana.jpg" }] }>().not.toExtend<ChatHeaderProps>();

// Guessed props and values name the fix.
expectTypeOf<{ title: "Crew"; members: []; participants: [] }>().not.toExtend<ChatHeaderProps>();
expectTypeOf<{ title: "Crew"; members: []; people: [] }>().not.toExtend<ChatHeaderProps>();
expectTypeOf<{ title: "Crew"; members: []; description: "x" }>().not.toExtend<ChatHeaderProps>();
expectTypeOf<{ title: "Crew"; members: []; name: "x" }>().not.toExtend<ChatHeaderProps>();
expectTypeOf<{ title: "Crew"; members: []; level: 4 }>().not.toExtend<ChatHeaderProps>();
expectTypeOf<{ title: "Crew"; members: [{ name: "Ana"; presence: "dnd"; presenceLabel: "Busy" }] }>().not.toExtend<ChatHeaderProps>();
// A presence needs the words it says.
expectTypeOf<{ title: "Crew"; members: [{ name: "Ana"; presence: "busy" }] }>().not.toExtend<ChatHeaderProps>();
