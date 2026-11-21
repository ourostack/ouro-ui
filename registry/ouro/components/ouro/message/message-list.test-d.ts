import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { MessageList, type MessageListProps } from "@/registry/ouro/components/ouro/message/message-list";

// A call site's props, typed as the component takes them. A case below keeps children in the props object because it
// checks the props a call passes, children among them, and a .ts file has no JSX to put children in; an app's lint
// (react(no-children-prop)) flags children passed in createElement's props, so the check doesn't call createElement.
const propsOf = <P>(value: P): P => value;

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ label: "Conversation"; children: null }>().toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; jumpLabel: "Aller au dernier"; newMessageLabel: (author: string, text: string) => string }>().toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; maxWidth: 960 }>().toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; pageKeys: false }>().toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; estimatedItemHeight: 56 }>().toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; hasOlder: true; loadingOlder: true }>().toExtend<MessageListProps>();
expectTypeOf<ComponentProps<typeof MessageList>>().toEqualTypeOf<MessageListProps>();

// label is required; the scrolling switches other kits have name the fix.
expectTypeOf<{ children: null }>().not.toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; autoScroll: true }>().not.toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; stickToBottom: true }>().not.toExtend<MessageListProps>();
// The row-size props of other virtual lists name estimatedItemHeight.
expectTypeOf<{ label: "Conversation"; children: null; estimateSize: () => 56 }>().not.toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; itemHeight: 56 }>().not.toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; defaultItemHeight: 56 }>().not.toExtend<MessageListProps>();

// @ts-expect-error label is required.
propsOf<ComponentProps<typeof MessageList>>({ children: null });
