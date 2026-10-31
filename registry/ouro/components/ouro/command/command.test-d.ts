import { createElement, type ComponentProps, type ReactElement } from "react";
import { expectTypeOf } from "vitest";
import { Command, type CommandEntry, type CommandProps } from "@/registry/ouro/components/ouro/command/command";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const trigger = createElement("button") as ReactElement;
type SetOpen = (open: boolean) => void;
const items: CommandEntry[] = [{ label: "Recipes", items: [{ label: "New recipe", onSelect: () => {}, shortcut: ["mod", "n"] }] }];

// Command: a trigger, or open with onOpenChange; title and items are required.
expectTypeOf<{ title: "Go"; trigger: ReactElement; items: CommandEntry[] }>().toExtend<CommandProps>();
expectTypeOf<{ title: "Go"; open: boolean; onOpenChange: SetOpen; items: CommandEntry[] }>().toExtend<CommandProps>();
expectTypeOf<{
  title: "Go";
  trigger: ReactElement;
  items: CommandEntry[];
  placeholder: "Find…";
  searchLabel: "Find";
  emptyLabel: "Nothing";
  closeLabel: "Done";
  className: "mt-8";
}>().toExtend<CommandProps>();
expectTypeOf<ComponentProps<typeof Command>>().toEqualTypeOf<CommandProps>();
expectTypeOf<{ trigger: ReactElement; items: CommandEntry[] }>().not.toExtend<CommandProps>();
expectTypeOf<{ title: "Go"; trigger: ReactElement }>().not.toExtend<CommandProps>();
expectTypeOf<{ title: "Go"; items: CommandEntry[] }>().not.toExtend<CommandProps>();
expectTypeOf<{ title: "Go"; trigger: ReactElement; open: true; onOpenChange: SetOpen; items: CommandEntry[] }>().not.toExtend<CommandProps>();
// Guessed props are hint types.
expectTypeOf<{ title: "Go"; trigger: ReactElement; items: CommandEntry[]; isOpen: true }>().not.toExtend<CommandProps>();
expectTypeOf<{ title: "Go"; trigger: ReactElement; items: CommandEntry[]; children: "x" }>().not.toExtend<CommandProps>();
expectTypeOf<{ label: "Home"; onClick: () => void }>().not.toExtend<CommandEntry>();
expectTypeOf<{ label: "Home" }>().not.toExtend<CommandEntry>();
expectTypeOf<{ label: "Home"; onSelect: () => void; keywords: ["start"]; disabled: true }>().toExtend<CommandEntry>();
// Media: an avatar's picture or element, an icon, an unread dot and a mark.
expectTypeOf<{ label: "Ada"; onSelect: () => void; avatar: "/ada.png"; unread: true; mark: "Draft" }>().toExtend<CommandEntry>();
expectTypeOf<{ label: "Ada"; onSelect: () => void; avatar: ReactElement; mark: ReactElement }>().toExtend<CommandEntry>();
expectTypeOf<{ label: "Settings"; onSelect: () => void; icon: ReactElement }>().toExtend<CommandEntry>();
expectTypeOf<{ label: "Ada"; onSelect: () => void; avatar: 1 }>().not.toExtend<CommandEntry>();
expectTypeOf<{ title: "Go"; trigger: ReactElement; items: CommandEntry[]; unreadLabel: "Non lu" }>().toExtend<CommandProps>();

// useCommandShortcut: open state and its setter, from a string or an array.
expectTypeOf<ReturnType<typeof useCommandShortcut>[0]>().toEqualTypeOf<boolean>();
expectTypeOf<ReturnType<typeof useCommandShortcut>[1]>().toBeCallableWith(true);
expectTypeOf(useCommandShortcut).toBeCallableWith("mod+k");
expectTypeOf(useCommandShortcut).toBeCallableWith(["mod", "k"]);

// JSX: the same rules at a call site.
// @ts-expect-error -- neither trigger nor open
createElement(Command, { title: "Go", items });
createElement(Command, { title: "Go", trigger, items });
