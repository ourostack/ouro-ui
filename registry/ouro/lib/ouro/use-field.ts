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
  /**
   * The field has an error (for a group's item, the group has one), for a control that sets
   * `aria-invalid` itself. `FieldRoot` leaves it unset: Base UI sets it from validity.
   */
  invalid?: boolean | undefined;
  /** Ids of the description and error the field renders, for the control's `aria-describedby`. */
  describedBy: string | undefined;
  /**
   * The id of the label (or a group's legend) a `Field` renders, for a control that is not a
   * native input and names itself with `aria-labelledby` (a checkbox, a switch, a radio
   * group). `FieldRoot` leaves it unset: Base UI links its parts after hydration.
   */
  labelId?: string | undefined;
  /**
   * Set by a `Field` whose control is a group of choices: its owner's `name`, such as
   * `RadioGroup`. A checkbox or radio `Field` inside it renders as one of the group's items.
   */
  group?: string | undefined;
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
   * How the field lays out its parts. `stack` (the default) puts the label above the
   * control. `inline` puts the control first with the label to its right, as a checkbox or
   * switch does. `group` names a group of choices: the label is the group's legend, not a
   * `<label>`, and the control is the group.
   */
  layout?: "stack" | "inline" | "group" | undefined;
  /**
   * For a group whose control cannot carry `aria-required` (a checkbox group): a required
   * field adds visually hidden " (required)" to its legend, so screen readers announce it.
   */
  requiredInLegend?: boolean | undefined;
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
