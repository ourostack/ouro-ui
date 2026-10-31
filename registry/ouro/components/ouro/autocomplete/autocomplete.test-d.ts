import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Autocomplete, type AutocompleteItem, type AutocompleteProps, type AutocompleteTrigger } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const field = createElement("textarea");
const people: AutocompleteItem[] = [{ value: "avery", label: "Avery Kim", description: "Design", avatar: { src: "/avery.png", initials: "AK" }, insert: "@Avery " }];
const trigger: AutocompleteTrigger = {
  char: "@",
  label: "People",
  items: (query: string) => people.filter((person) => person.label.includes(query)),
  onPick: (item: AutocompleteItem, query: string) => void [item, query],
  minQueryLength: 1,
  allowSpaces: true,
};

expectTypeOf<{ triggers: [typeof trigger]; children: typeof field }>().toExtend<AutocompleteProps>();
expectTypeOf<{ triggers: [typeof trigger]; children: typeof field; resultsLabel: (count: number, trigger: AutocompleteTrigger) => string }>().toExtend<AutocompleteProps>();
expectTypeOf<ComponentProps<typeof Autocomplete>>().toEqualTypeOf<AutocompleteProps>();

// items is a list or a function of the query.
expectTypeOf<{ char: "#"; label: "Channels"; items: [{ value: "general"; label: "general"; glyph: "#" }] }>().toExtend<AutocompleteTrigger>();
// Every trigger names its list, and every item has a value and a label.
expectTypeOf<{ char: "@"; items: typeof people }>().not.toExtend<AutocompleteTrigger>();
expectTypeOf<{ label: "Avery Kim" }>().not.toExtend<AutocompleteItem>();

// triggers and the field are required.
expectTypeOf<{ children: typeof field }>().not.toExtend<AutocompleteProps>();
expectTypeOf<{ triggers: [typeof trigger] }>().not.toExtend<AutocompleteProps>();

// The guessed names are type errors whose hint names the fix.
expectTypeOf<{ triggers: [typeof trigger]; children: typeof field; trigger: "@" }>().not.toExtend<AutocompleteProps>();
expectTypeOf<{ triggers: [typeof trigger]; children: typeof field; suggestions: typeof people }>().not.toExtend<AutocompleteProps>();
expectTypeOf<{ triggers: [typeof trigger]; children: typeof field; onSelect: () => void }>().not.toExtend<AutocompleteProps>();

// @ts-expect-error trigger is not a prop: Autocomplete takes a list.
createElement(Autocomplete, { triggers: [trigger], trigger: "@" }, field);
