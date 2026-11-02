import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { MessageList, type MessageListProps } from "@/registry/ouro/components/ouro/message/message-list";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ label: "Conversation"; children: null }>().toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; jumpLabel: "Aller au dernier"; newMessageLabel: (author: string, text: string) => string }>().toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; maxWidth: 960 }>().toExtend<MessageListProps>();
expectTypeOf<ComponentProps<typeof MessageList>>().toEqualTypeOf<MessageListProps>();

// label is required; the scrolling switches other kits have name the fix.
expectTypeOf<{ children: null }>().not.toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; autoScroll: true }>().not.toExtend<MessageListProps>();
expectTypeOf<{ label: "Conversation"; children: null; stickToBottom: true }>().not.toExtend<MessageListProps>();

// @ts-expect-error label is required.
createElement(MessageList, { children: null });
