"use client";

import { OTPField } from "@base-ui/react/otp-field";
import { Fragment, type JSX, type ReactNode, type Ref } from "react";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { contractWarnings } from "@/registry/ouro/components/ouro/field/field-styles";
import { FieldOwnerContext, useField } from "@/registry/ouro/lib/ouro/use-field";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import {
  defaultSlotLabel,
  otpValidationTypes,
  separatorClass,
  slotClass,
  slotsClass,
  type OtpValidationType,
} from "@/registry/ouro/components/ouro/otp-field/otp-field-styles";

/** Props for {@link OtpField}. */
export interface OtpFieldProps {
  /**
   * What the code is ("Verification code"), shown above the slots and read as the first slot's
   * name. Required: every control needs a name. To hide it visually, keep it and add `hideLabel`.
   */
  label: string;
  /** Hides the label visually; screen readers still read it. */
  hideLabel?: boolean | undefined;
  /** Supporting text under the label ("We sent it to your phone"), read through `aria-describedby`. */
  description?: ReactNode | undefined;
  /**
   * What is wrong ("That code has expired"), from your server action or client check. It shows
   * under the slots, which get `aria-invalid`. An empty string or array means valid.
   */
  error?: string | string[] | undefined;
  /** The code must be filled before the form submits. */
  required?: boolean | undefined;
  /** Disables every slot and fades the field. */
  disabled?: boolean | undefined;
  /** The form field name the whole code submits under. */
  name?: string | undefined;
  /**
   * How many characters the code has: one slot each.
   * @default 6
   */
  length?: number | undefined;
  /**
   * Which characters the slots take. Others are dropped as the person types or pastes.
   * `numeric` brings up the number keyboard on phones.
   * @default "numeric"
   */
  validationType?: "numeric" | "alpha" | "alphanumeric" | (string & { 'Use "numeric", "alpha" or "alphanumeric"': never }) | undefined;
  /** The code, when you control it. Pair it with `onValueChange`. */
  value?: string | undefined;
  /** The code the field starts with, when it keeps its own state. */
  defaultValue?: string | undefined;
  /** Called with the code as the person types, pastes or deletes. */
  onValueChange?: ((value: string) => void) | undefined;
  /** Called with the code when every slot is filled. */
  onValueComplete?: ((value: string) => void) | undefined;
  /** Submits the form when every slot is filled. */
  autoSubmit?: boolean | undefined;
  /** Hides the characters as dots, as a password field does. */
  mask?: boolean | undefined;
  /** Shows the slots in groups of this many, with a dash between groups: `groupSize={3}` reads `123-456`. */
  groupSize?: number | undefined;
  /**
   * The name of each slot after the first (the first takes `label`). Translate it with your app.
   * @default (position, length) => `Character ${position} of ${length}`
   */
  slotLabel?: ((position: number, length: number) => string) | undefined;
  /**
   * Autofill for the first slot. The default lets phones offer a code from a text message.
   * @default "one-time-code"
   */
  autoComplete?: string | undefined;
  /** Shows the code without letting the person change it. */
  readOnly?: boolean | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-4`). Appearance classes warn in
   * development; style fields in your theme.
   */
  className?: string | undefined;
  /** The slots' group element (`role="group"`). */
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `length`: `<OtpField length={6}>`. */
  maxLength?: { 'Use <OtpField length={6}>': never };
  /** Not a prop. Ouro UI uses `length`: `<OtpField length={4}>`. */
  numInputs?: { 'Use <OtpField length={4}>': never };
  /** Not a prop. Ouro UI uses `validationType`: `<OtpField validationType="alphanumeric">`. */
  pattern?: { 'Use <OtpField validationType="alphanumeric">': never };
  /** Not a prop. Ouro UI uses `onValueComplete`: `<OtpField onValueComplete={(code) => ...}>`. */
  onComplete?: { 'Use <OtpField onValueComplete={(code) => ...}>': never };
  /** Not a prop. Ouro UI uses `onValueChange`, which gets the code: `<OtpField onValueChange={(code) => ...}>`. */
  onChange?: { 'Use <OtpField onValueChange={(code) => ...}>': never };
  /** Not a prop. Ouro UI uses `error`: `<OtpField error="Wrong code.">`. */
  errorMessage?: { 'Use <OtpField error="Wrong code.">': never };
  /** Not a prop. Ouro UI uses `description`: `<OtpField description="...">`. */
  helperText?: { 'Use <OtpField description="...">': never };
  /** Not a prop. `error` marks the field invalid: `<OtpField error="What is wrong">`. */
  isInvalid?: { 'Use <OtpField error="What is wrong">': never };
  /** Not a prop. `error` marks the field invalid: `<OtpField error="What is wrong">`. */
  invalid?: { 'Use <OtpField error="What is wrong">': never };
  /** Not a prop. Ouro UI uses `required`: `<OtpField required>`. */
  isRequired?: { 'Use <OtpField required>': never };
  /** Not a prop. Ouro UI uses `disabled`: `<OtpField disabled>`. */
  isDisabled?: { 'Use <OtpField disabled>': never };
}

/** Field's messages and root name OtpField. */
const owner = { name: "OtpField", data: "otp-field" };

interface SlotsProps {
  length: number;
  validationType: OtpValidationType;
  value: string | undefined;
  defaultValue: string | undefined;
  onValueChange: ((value: string) => void) | undefined;
  onValueComplete: ((value: string) => void) | undefined;
  autoSubmit: boolean | undefined;
  mask: boolean | undefined;
  groupSize: number | undefined;
  slotLabel: (position: number, length: number) => string;
  autoComplete: string | undefined;
  readOnly: boolean | undefined;
  /** OtpField's own `error` has a message. */
  hasError: boolean;
  ref: Ref<HTMLDivElement> | undefined;
}

/**
 * The slots, inside the Field, where they read its required state, invalid state and
 * server-known description ids. The group and every slot get the ids, since a screen reader
 * may land on any slot, and the invalid state is Ouro's own (Base UI's tracks only its own
 * checks).
 */
function Slots({ length, groupSize, slotLabel, onValueChange, onValueComplete, hasError, ref, ...rest }: SlotsProps): JSX.Element {
  const field = useField()!;
  // A Field that shares its invalid state (a Form's error for this name counts too) decides;
  // otherwise OtpField's own error does.
  const invalid =
    "invalid" in field
      ? /* istanbul ignore next @preserve -- runs once Field shares its invalid state (ourostack/ouro-ui#36) */ field.invalid === true
      : hasError;
  const groups = groupSize && Number.isInteger(groupSize) && groupSize > 0 && groupSize < length ? groupSize : length;
  return (
    <OTPField.Root
      {...rest}
      ref={ref}
      length={length}
      required={field.required}
      aria-describedby={field.describedBy}
      onValueChange={onValueChange && ((next) => onValueChange(next))}
      onValueComplete={onValueComplete && ((next) => onValueComplete(next))}
      className={slotsClass}
    >
      {Array.from({ length }, (_, index) => (
        <Fragment key={index}>
          {index > 0 && index % groups === 0 && <OTPField.Separator data-ouro-otp-separator="" className={separatorClass} />}
          <OTPField.Input
            data-ouro-otp-slot=""
            aria-label={index === 0 ? undefined : slotLabel(index + 1, length)}
            aria-describedby={field.describedBy}
            {...(invalid ? { "aria-invalid": true } : {})}
            className={slotClass}
          />
        </Fragment>
      ))}
    </OTPField.Root>
  );
}

/**
 * A one-time code entry on the Field contract: one slot per character, with focus that moves
 * as the person types, a whole code pasted at once, and `autoComplete="one-time-code"` so
 * phones offer the code from a text message. Pass `label`, `length`, and `error` from your
 * server action; `onValueComplete` or `autoSubmit` act when every slot is filled.
 *
 * Use `TextField` with `inputMode="numeric"` instead for a number with no fixed length, and
 * `TextField type="password"` for a password.
 *
 * @group Forms
 * @see https://ourostack.github.io/ouro-ui/docs/otp-field
 *
 * @example
 * <OtpField label="Verification code" name="code" length={6} autoSubmit error={errors?.code} />
 * <OtpField label="Recovery code" validationType="alphanumeric" length={8} groupSize={4} />
 */
export function OtpField(props: OtpFieldProps): JSX.Element {
  const {
    label,
    hideLabel,
    description,
    error,
    required,
    disabled,
    name,
    length: lengthProp = 6,
    validationType: validationTypeProp = "numeric",
    value,
    defaultValue,
    onValueChange,
    onValueComplete,
    autoSubmit,
    mask,
    groupSize,
    slotLabel = defaultSlotLabel,
    autoComplete,
    readOnly,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    maxLength,
    numInputs,
    pattern,
    onComplete,
    onChange,
    errorMessage,
    helperText,
    isInvalid,
    invalid,
    isRequired,
    isDisabled,
  } = props;
  // A length or validation type that is not one of OtpField's warns and renders the default.
  const length = Number.isInteger(lengthProp) && lengthProp > 0 ? lengthProp : 6;
  const validationType = otpValidationTypes.includes(validationTypeProp as OtpValidationType)
    ? (validationTypeProp as OtpValidationType)
    : "numeric";
  useDevWarnings(
    "OtpField",
    process.env.NODE_ENV !== "production"
      ? () => [
          length !== lengthProp && [`length={${String(lengthProp)}} is not a positive whole number`, "<OtpField length={6}>"],
          validationType !== validationTypeProp && [
            `validationType="${String(validationTypeProp)}" is not a validation type; use ${otpValidationTypes.map((type) => `"${type}"`).join(", ")}`,
            '<OtpField validationType="numeric">',
          ],
          ...contractWarnings("OtpField", { errorMessage, helperText, isInvalid, invalid, isRequired, isDisabled }),
          maxLength !== undefined && ["maxLength is not a prop", `<OtpField length={${String(maxLength)}}>`],
          numInputs !== undefined && ["numInputs is not a prop", `<OtpField length={${String(numInputs)}}>`],
          pattern !== undefined && ["pattern is not a prop", '<OtpField validationType="alphanumeric">'],
          onComplete !== undefined && ["onComplete is not a prop", "<OtpField onValueComplete={(code) => …}>"],
          onChange !== undefined && ["onChange is not a prop", "<OtpField onValueChange={(code) => …}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <FieldOwnerContext.Provider value={owner}>
      <Field
        label={label}
        hideLabel={hideLabel}
        description={description}
        error={error}
        required={required}
        disabled={disabled}
        name={name}
        className={className}
      >
        <Slots
          ref={ref}
          length={length}
          validationType={validationType}
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          onValueComplete={onValueComplete}
          autoSubmit={autoSubmit}
          mask={mask}
          groupSize={groupSize}
          slotLabel={slotLabel}
          autoComplete={autoComplete}
          readOnly={readOnly}
          hasError={Array.isArray(error) ? error.some((message) => message !== "") : Boolean(error)}
        />
      </Field>
    </FieldOwnerContext.Provider>
  );
}
