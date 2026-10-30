import { createElement, type ComponentProps, type RefObject, type KeyboardEvent, type MouseEvent } from "react";
import { expectTypeOf } from "vitest";
import {
  EmojiPicker,
  type EmojiPickerCategory,
  type EmojiPickerEmoji,
  type EmojiPickerProps,
  type EmojiPickerSelection,
  type EmojiSkinTone,
} from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const categories: EmojiPickerCategory[] = [{ label: "Smileys", emoji: [{ emoji: "😀", name: "grinning face" }] }];
const trigger = createElement("button", null, "React");
const onSelect = (selection: EmojiPickerSelection) => void selection;

expectTypeOf<{ label: "Add a reaction"; categories: typeof categories; trigger: typeof trigger; onSelect: typeof onSelect }>().toExtend<EmojiPickerProps>();
expectTypeOf<{
  label: "Insert emoji";
  categories: typeof categories;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLButtonElement | null>;
  onSelect: typeof onSelect;
  frequent: readonly EmojiPickerEmoji[];
  quick: readonly EmojiPickerEmoji[];
  skinTone: "medium";
  onSkinToneChange: (tone: EmojiSkinTone) => void;
  renderEmoji: (item: EmojiPickerEmoji, skinTone: EmojiSkinTone) => ReturnType<typeof createElement>;
  presentation: "sheet";
  side: "top";
  align: "start";
  searchLabel: "Buscar";
  frequentLabel: "Frecuentes";
  quickLabel: "Rápidas";
  categoriesLabel: "Categorías";
  skinToneLabel: "Tono";
  skinToneNames: Record<EmojiSkinTone, string>;
  resultsLabel: "{count} emoji";
  noResultsLabel: "Nada";
  closeLabel: "Cerrar";
  className: "w-96";
}>().toExtend<EmojiPickerProps>();
expectTypeOf<ComponentProps<typeof EmojiPicker>>().toEqualTypeOf<EmojiPickerProps>();

// An emoji's tones: Unicode's modifier, or its five toned forms.
expectTypeOf<{ emoji: "👍"; name: "thumbs up"; keywords: ["like"]; skinTones: true }>().toExtend<EmojiPickerEmoji>();
expectTypeOf<{ emoji: "🧑‍🤝‍🧑"; name: "people holding hands"; skinTones: readonly string[] }>().toExtend<EmojiPickerEmoji>();
expectTypeOf<{ label: "Food"; icon: null; emoji: readonly EmojiPickerEmoji[] }>().toExtend<EmojiPickerCategory>();
// Every emoji needs its name.
expectTypeOf<{ emoji: "👍" }>().not.toExtend<EmojiPickerEmoji>();

// onSelect gets the selection and the event.
expectTypeOf<Parameters<EmojiPickerProps["onSelect"]>>().toEqualTypeOf<[EmojiPickerSelection, MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>]>();
expectTypeOf<EmojiPickerSelection["skinTone"]>().toEqualTypeOf<EmojiSkinTone>();

// The label and onSelect are required, and a picker opens one way only.
expectTypeOf<{ categories: typeof categories; trigger: typeof trigger; onSelect: typeof onSelect }>().not.toExtend<EmojiPickerProps>();
expectTypeOf<{ label: "Add a reaction"; categories: typeof categories; trigger: typeof trigger }>().not.toExtend<EmojiPickerProps>();
expectTypeOf<{ label: "Add a reaction"; categories: typeof categories; onSelect: typeof onSelect; open: true }>().not.toExtend<EmojiPickerProps>();
expectTypeOf<{ label: "Add a reaction"; categories: typeof categories; onSelect: typeof onSelect; open: true; onOpenChange: (open: boolean) => void }>().not.toExtend<EmojiPickerProps>();
expectTypeOf<{
  label: "Add a reaction";
  categories: typeof categories;
  onSelect: typeof onSelect;
  trigger: typeof trigger;
  open: true;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLButtonElement | null>;
}>().not.toExtend<EmojiPickerProps>();
// Another picker's props are hint types.
expectTypeOf<{ label: "Add a reaction"; categories: typeof categories; trigger: typeof trigger; onSelect: typeof onSelect; onEmojiSelect: () => void }>().not.toExtend<EmojiPickerProps>();
expectTypeOf<{ label: "Add a reaction"; categories: typeof categories; trigger: typeof trigger; onSelect: typeof onSelect; skinTone: "tan" }>().not.toExtend<EmojiPickerProps>();

// @ts-expect-error onEmojiClick is not a prop.
createElement(EmojiPicker, { label: "Add a reaction", categories, trigger, onSelect, onEmojiClick: () => {} });
