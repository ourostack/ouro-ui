"use client";

import { createContext, useContext, type ReactElement, type ReactNode } from "react";

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
   * Arranges the field's content inside its root: the label element, then the rest
   * (description, control, error). NumberField puts its Base UI root around both and a scrub
   * area around the label; a range Slider drops the label's `for`, because its group is named
   * with `aria-labelledby`. Without it, the label comes first, then the rest.
   */
  frame?: ((label: ReactElement, rest: ReactNode) => ReactNode) | undefined;
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
