import { createElement, type ComponentProps, type MouseEvent, type ReactElement } from "react";
import { expectTypeOf } from "vitest";
import { Message, type MessageAction, type MessageProps } from "@/registry/ouro/components/ouro/message/message";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ role: "user"; name: "Ada" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "assistant"; name: "Ouro"; avatar: "/ouro.png"; streaming: true; streamingLabel: "Écrit"; children: "Hi"; attachments: null }>().toExtend<MessageProps>();
expectTypeOf<{ role: "system"; name: "Ouro"; avatar: false }>().toExtend<MessageProps>();
expectTypeOf<ComponentProps<typeof Message>>().toEqualTypeOf<MessageProps>();
expectTypeOf<{
  role: "assistant";
  name: "Mara Quill";
  variant: "chat";
  avatar: ReactElement;
  time: "9:41 AM";
  dateTime: "2026-05-04T09:41";
  continued: true;
  footer: ReactElement;
  thread: null;
  actions: readonly MessageAction[];
  menu: readonly [{ label: "Copy link"; onClick: () => void }];
  actionsLabel: "Actions";
  menuLabel: "More";
}>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "post"; subject: "Agenda" }>().toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "reply" }>().toExtend<MessageProps>();
expectTypeOf<{ key: "reply"; label: "Reply"; icon: "↩"; onClick: (event: MouseEvent<HTMLElement>) => void; disabled: true }>().toExtend<MessageAction>();
// An action needs a label, for its name and tooltip.
expectTypeOf<{ key: "reply"; icon: "↩"; onClick: () => void }>().not.toExtend<MessageAction>();

// role and name are required; other roles and the names agents bring from other chat kits name the fix.
expectTypeOf<{ name: "Ada" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "bot"; name: "Ouro" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; from: "user" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; sender: "Ada" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; content: "Hi" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; variant: "bubble" }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; own: true }>().not.toExtend<MessageProps>();
expectTypeOf<{ role: "user"; name: "Ada"; timestamp: "9:41" }>().not.toExtend<MessageProps>();

// @ts-expect-error name is required.
createElement(Message, { role: "user" });
