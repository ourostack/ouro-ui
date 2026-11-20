import { createElement, type ComponentProps, type RefObject } from "react";
import { expectTypeOf } from "vitest";
import { Toolbar, type ToolbarEntry, type ToolbarProps } from "@/registry/ouro/components/ouro/toolbar/toolbar";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const Icon = () => null;
const items: ToolbarEntry[] = [
  { type: "toggle", label: "Bold", icon: Icon, hideLabel: true, shortcut: ["mod", "b"], pressed: true, onPressedChange: (pressed: boolean) => void pressed },
  { type: "toggle", label: "Italic", defaultPressed: true, disabled: true },
  { type: "separator" },
  { label: "Insert link", icon: Icon, onClick: () => {} },
  { type: "button", label: "Quote" },
  { type: "group", label: "Lists", items: [{ label: "Bulleted list" }, { type: "toggle", label: "Checklist" }] },
];

expectTypeOf<{ label: "Formatting"; items: typeof items }>().toExtend<ToolbarProps>();
expectTypeOf<{
  label: "Formatting";
  items: typeof items;
  size: "sm";
  keepFocus: true;
  moreLabel: "More formatting";
  disabled: true;
  className: "flex-1";
}>().toExtend<ToolbarProps>();
expectTypeOf<ComponentProps<typeof Toolbar>>().toEqualTypeOf<ToolbarProps>();

// label and items are required.
expectTypeOf<{ items: typeof items }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Formatting" }>().not.toExtend<ToolbarProps>();

// Every control needs a label; a group's items are controls, not groups or separators.
expectTypeOf<{ type: "toggle"; icon: typeof Icon }>().not.toExtend<ToolbarEntry>();
expectTypeOf<{ type: "group"; label: "Lists"; items: [{ type: "separator" }] }>().not.toExtend<ToolbarEntry>();
// A shortcut is a list of keys; a string is a type error whose hint names the fix.
expectTypeOf<{ label: "Bold"; shortcut: "mod+b" }>().not.toExtend<ToolbarEntry>();

// Unknown sizes, and the guessed names, are type errors whose hint names the fix.
expectTypeOf<{ label: "Formatting"; items: typeof items; size: "xl" }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Formatting"; items: typeof items; children: "x" }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Formatting"; items: typeof items; orientation: "vertical" }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Formatting"; items: typeof items; actions: typeof items }>().not.toExtend<ToolbarProps>();

// floating is a flag; autoHide takes milliseconds, not a flag; onHiddenChange gets the new state.
expectTypeOf<{ label: "Call controls"; items: typeof items; floating: true; autoHide: 3000; onHiddenChange: (hidden: boolean) => void }>().toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: true }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: "3s" }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; floating: "glass" }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; onHiddenChange: (hidden: string) => void }>().not.toExtend<ToolbarProps>();
// The guessed names are type errors whose hint names the fix.
expectTypeOf<{ label: "Call controls"; items: typeof items; glass: true }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHideDuration: 3000 }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; area: HTMLElement }>().not.toExtend<ToolbarProps>();
// autoHideArea takes an element, a ref or null; a selector is a type error.
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: 3000; autoHideArea: HTMLDivElement }>().toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: 3000; autoHideArea: RefObject<HTMLDivElement | null> }>().toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: 3000; autoHideArea: null }>().toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: 3000; autoHideArea: "#stage" }>().not.toExtend<ToolbarProps>();
// hidden is a flag the app controls with onHiddenChange; visible is a type error whose hint names hidden.
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: 3000; hidden: boolean; onHiddenChange: (hidden: boolean) => void }>().toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: 3000; hidden: "true" }>().not.toExtend<ToolbarProps>();
expectTypeOf<{ label: "Call controls"; items: typeof items; autoHide: 3000; visible: true }>().not.toExtend<ToolbarProps>();

// The same checks through JSX.
// @ts-expect-error a Toolbar is a row.
createElement(Toolbar, { label: "Formatting", items, orientation: "vertical" });
// @ts-expect-error the controls come from items.
createElement(Toolbar, { label: "Formatting", items, children: "Bold" });
// @ts-expect-error autoHide takes the milliseconds of rest.
createElement(Toolbar, { label: "Call controls", items, autoHide: true });
// @ts-expect-error the bar is controlled with hidden.
createElement(Toolbar, { label: "Call controls", items, autoHide: 3000, visible: true });
