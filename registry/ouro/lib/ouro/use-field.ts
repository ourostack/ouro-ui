"use client";

import { createContext, useContext } from "react";

// The state a Field shares with its control and label, apart from the components so the
// parts file exports only components (React Fast Refresh). Base UI's Field owns ids,
// validity and disabled; this adds what Base UI leaves to the app: `required`, and the
// description and error ids the server already knows, so the server HTML carries
// `aria-describedby` before hydration.

/** What a Field tells the controls and label inside it. */
export interface FieldContextValue {
  /** The field is required: the control gets `required` and `aria-required`, the label a marker. */
  required: boolean;
  /** Ids of the description and error the field renders, for the control's `aria-describedby`. */
  describedBy: string | undefined;
  /**
   * The field shows an error, from its `error` prop or its `Form`'s `errors`. A control
   * that is not a `FieldControl` (Select's trigger) sets `aria-invalid` from it.
   */
  invalid: boolean;
  /**
   * The label's id, for a control that a `<label for>` cannot name (Select's trigger takes
   * `aria-labelledby`). `undefined` in the parts, which leave the id to Base UI.
   */
  labelId: string | undefined;
}

/**
 * The context `FieldRoot` and `Field` provide; `null` outside a field.
 *
 * @internal
 */
export const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Reads the enclosing field's state, or `null` outside a `FieldRoot` or `Field`. Controls
 * built on the Field contract use it to apply `required` and the server-known
 * `aria-describedby`.
 *
 * @internal
 */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

/** The component a Field belongs to: its name in development messages and its `data-ouro` value. */
export interface FieldOwner {
  /** The component name development messages start with and show in each fix, such as `TextField`. */
  name: string;
  /** The root's `data-ouro` value, such as `text-field`. */
  data: string;
  /**
   * `false` when the control is not a form element a `<label for>` can click and name, such
   * as Select's trigger button: the label renders as a `<div>` and the control takes
   * `aria-labelledby` (Base UI's `nativeLabel={false}`).
   */
  nativeLabel?: false | undefined;
}

/**
 * The component a `Field` renders for. A control built on `Field` (TextField, TextArea)
 * provides its own, so Field's messages and root name that control; `Field` alone is `Field`.
 *
 * @internal
 */
export const FieldOwnerContext = createContext<FieldOwner>({ name: "Field", data: "field" });

/**
 * The component the enclosing `Field` renders for.
 *
 * @internal
 */
export function useFieldOwner(): FieldOwner {
  return useContext(FieldOwnerContext);
}

/** A form's server or client errors, by field name, as `Form` shares them with the fields inside it. */
export interface FormErrorsValue {
  /** The messages for each field name; a field shows its own when it has no `error` prop. */
  errors: Readonly<Record<string, string | string[]>>;
  /** Drops one field's message, once the user changes that field. */
  clear: (name: string) => void;
  /**
   * Records that a field with this name is in the form, so its errors show on it and not at
   * the top of the form. Returns the function that removes it again.
   */
  register: (name: string) => () => void;
  /**
   * Records the name while the field renders, so the server HTML and the first client render
   * already leave the field's errors off the top of the form. `register` takes over after mount.
   */
  claim: (name: string) => void;
}

/**
 * The errors `Form` provides; `null` outside a `Form`. It is Ouro's own context, so a Field
 * reads its message while rendering, and the server HTML links the message to the control.
 *
 * @internal
 */
export const FormErrorsContext = createContext<FormErrorsValue | null>(null);

/**
 * Reads the enclosing `Form`'s errors, or `null` outside one.
 *
 * @internal
 */
export function useFormErrors(): FormErrorsValue | null {
  return useContext(FormErrorsContext);
}
