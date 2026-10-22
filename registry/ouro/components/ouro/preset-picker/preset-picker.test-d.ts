import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { PresetPicker, type PresetPickerItem, type PresetPickerProps } from "@/registry/ouro/components/ouro/preset-picker/preset-picker";

// Type tests: `pnpm typecheck` compiles this file.

declare const items: PresetPickerItem[];
type Use = (value: string) => void;
expectTypeOf<{ label: "Layouts"; items: PresetPickerItem[]; onValueChange: Use }>().toExtend<PresetPickerProps>();
expectTypeOf<{ label: "Layouts"; items: readonly PresetPickerItem[]; onValueChange: Use; value: null; currentLabel: "Actif"; className: "mt-4"; id: "presets" }>().toExtend<PresetPickerProps>();
expectTypeOf<{ value: "chats"; label: "Chats first"; description: "Conversations wide."; tag: "Saved" }>().toExtend<PresetPickerItem>();
expectTypeOf<ComponentProps<typeof PresetPicker>>().toEqualTypeOf<PresetPickerProps>();

// label, items and onValueChange are required, and an item has ChoiceCard's label, not a title.
expectTypeOf<{ items: typeof items; onValueChange: Use }>().not.toExtend<PresetPickerProps>();
expectTypeOf<{ label: "Layouts"; onValueChange: Use }>().not.toExtend<PresetPickerProps>();
expectTypeOf<{ label: "Layouts"; items: typeof items }>().not.toExtend<PresetPickerProps>();
expectTypeOf<{ value: "chats"; title: "Chats first" }>().not.toExtend<PresetPickerItem>();

// Guessed props name the fix.
type Valid = { label: "Layouts"; items: typeof items; onValueChange: Use };
expectTypeOf<Valid & { current: "chats" }>().not.toExtend<PresetPickerProps>();
expectTypeOf<Valid & { onSelect: Use }>().not.toExtend<PresetPickerProps>();
expectTypeOf<Valid & { options: typeof items }>().not.toExtend<PresetPickerProps>();

// @ts-expect-error onValueChange is required.
createElement(PresetPicker, { label: "Layouts", items });
