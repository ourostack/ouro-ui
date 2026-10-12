import { createElement } from "react";
import { expectTypeOf } from "vitest";
import { EditSheet, type EditSheetProps } from "@/registry/ouro/components/ouro/form/edit-sheet";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const trigger = createElement("button", null, "Edit");
const save = (data: FormData) => (data.get("name") ? undefined : { name: "Required." });

// Valid shapes: a trigger, or open with onOpenChange; onSubmit returns nothing, errors or a promise of either.
expectTypeOf<{ title: "Edit recipe"; trigger: typeof trigger; onSubmit: typeof save; children: "Fields" }>().toExtend<EditSheetProps>();
expectTypeOf<{
  title: "Edit recipe";
  open: true;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<{ name: string[] } | undefined>;
  children: "Fields";
  hideTitle: true;
  description: "Changes save for everyone.";
  submitLabel: "Save recipe";
  cancelLabel: "Abbrechen";
  closeLabel: "Schließen";
  className: "mt-4";
}>().toExtend<EditSheetProps>();
createElement(EditSheet, { title: "Edit recipe", trigger, onSubmit: async () => {}, children: "Fields" });

// title and onSubmit are required.
expectTypeOf<{ trigger: typeof trigger; onSubmit: typeof save; children: "Fields" }>().not.toExtend<EditSheetProps>();
expectTypeOf<{ title: "Edit recipe"; trigger: typeof trigger; children: "Fields" }>().not.toExtend<EditSheetProps>();
// onSubmit returns errors as strings, not anything else.
expectTypeOf<{ title: "Edit recipe"; trigger: typeof trigger; onSubmit: () => { name: 1 }; children: "Fields" }>().not.toExtend<EditSheetProps>();

// A trigger or open, not both, and open needs onOpenChange.
expectTypeOf<{ title: "Edit recipe"; trigger: typeof trigger; open: true; onOpenChange: () => void; onSubmit: typeof save; children: "Fields" }>().not.toExtend<EditSheetProps>();
expectTypeOf<{ title: "Edit recipe"; open: true; onSubmit: typeof save; children: "Fields" }>().not.toExtend<EditSheetProps>();

// The guessed names are hint types that name the real prop.
type Base = { title: "Edit recipe"; trigger: typeof trigger; onSubmit: typeof save; children: "Fields" };
expectTypeOf<Base & { onSave: typeof save }>().not.toExtend<EditSheetProps>();
expectTypeOf<Base & { saveLabel: "Save" }>().not.toExtend<EditSheetProps>();
expectTypeOf<Base & { submitText: "Save" }>().not.toExtend<EditSheetProps>();
expectTypeOf<Base & { errors: { name: "Required." } }>().not.toExtend<EditSheetProps>();
expectTypeOf<Base & { isOpen: true }>().not.toExtend<EditSheetProps>();
expectTypeOf<Base & { onClose: () => void }>().not.toExtend<EditSheetProps>();

// The same checks through JSX.
// @ts-expect-error onSave is not a prop; use onSubmit.
createElement(EditSheet, { title: "Edit recipe", trigger, onSave: save, children: "Fields" });
