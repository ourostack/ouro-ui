import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Message, type MessageProps } from "@/registry/ouro/components/ouro/message/message";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ role: "user"; name: "Ada" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Ouro"; avatar: "/ouro.png"; streaming: true; streamingLabel: "Écrit"; children: "Hi"; attachments: null }>().toExtend<MessageProps>();
expectTypeOf<{ role: "system"; name: "Ouro"; avatar: false }>().toExtend<MessageProps>();
expectTypeOf<ComponentProps<typeof Message>>().toEqualTypeOf<MessageProps>();

// role and name are required; other roles and the names agents bring from other chat kits name the fix.
expectTypeOf<{ name: "Ada" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "bot"; name: "Ouro" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; from: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; sender: "Ada" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; content: "Hi" }>().not.toExtend<MessageProps>();

// @ts-expect-error name is required.
createElement(Message, { role: "user" });
