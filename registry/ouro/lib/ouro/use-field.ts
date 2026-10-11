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
