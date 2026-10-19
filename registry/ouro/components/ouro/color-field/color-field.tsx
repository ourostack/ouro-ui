"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type JSX, type ReactNode, type Ref } from "react";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { FieldControl } from "@/registry/ouro/components/ouro/field/field-parts";
import { contractWarnings } from "@/registry/ouro/components/ouro/field/field-styles";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { FieldOwnerContext, useField, type ReadonlyErrorMessages } from "@/registry/ouro/lib/ouro/use-field";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import {
  boxClass,
  hexOf,
  pickerClass,
  plainSwatchClass,
  supportsColorInput,
  swatchClass,
  textClass,
  toHex,
} from "@/registry/ouro/components/ouro/color-field/color-field-styles";

/** Props for {@link ColorField}. */
export interface ColorFieldProps {
  /**
   * What the color is for ("Accent color"), shown above the field and read as the text input's
   * name. Required: every control needs a name. To hide it visually, keep it and add `hideLabel`.
   */
  label: string;
  /** Hides the label visually; screen readers still read it. */
  hideLabel?: boolean | undefined;
  /** Supporting text under the label, read through `aria-describedby`. */
  description?: ReactNode | undefined;
  /**
   * What is wrong, from your server action or client check. It shows under the field, which
   * gets `aria-invalid`. A message is text or a React node (one with a link); an empty string or array means valid.
   */
  error?: ReadonlyErrorMessages | undefined;
  /**
   * Marks the field required: it gets `aria-required`, and the label a marker. A color always
   * has a value, so it never blocks a submit, even with the text cleared.
   */
  required?: boolean | undefined;
  /** Disables the swatch and the text, and fades the field. */
  disabled?: boolean | undefined;
  /** The form field name the color submits under, always as `#rrggbb`. */
  name?: string | undefined;
  /** The color as hex (`#3366ff`, or short `#36f`), when you control it. Pair it with `onValueChange`. */
  value?: string | undefined;
  /** The color the field starts with, and goes back to when its form resets, as hex. @default "#000000" */
  defaultValue?: string | undefined;
  /** Called with the color as `#rrggbb` when it is picked, or typed as a whole hex. */
  onValueChange?: ((hex: string) => void) | undefined;
  /**
   * The name of the swatch that opens the system color picker. The swatch is a color input,
   * which can only be named by label text, so Playwright's loose `getByLabel("Color")` also
   * finds it when the field's label is in this name; find the field with
   * `getByLabel("Color", { exact: true })` or `getByRole("textbox", { name: "Color" })`.
   * Translate it with your app.
   * @default "Pick a color"
   */
  pickerLabel?: string | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-4`). Appearance classes warn in
   * development; style fields in your theme.
   */
  className?: string | undefined;
  /** The hex text input. */
  ref?: Ref<HTMLInputElement> | undefined;

  /** Not a prop. ColorField takes and gives `#rrggbb`: `<ColorField defaultValue="#3366ff">`. */
  format?: { 'ColorField takes and gives #rrggbb: <ColorField defaultValue="#3366ff">': never };
  /** Not supported. ColorField takes `#rrggbb`, with no transparency. */
  alpha?: { 'ColorField takes #rrggbb, with no transparency': never };
  /** Not a prop. Ouro UI uses `value` or `defaultValue`: `<ColorField defaultValue="#ff0000">`. */
  color?: { 'Use <ColorField defaultValue="#ff0000">': never };
  /** Not a prop. Ouro UI uses `onValueChange`, which gets the hex: `<ColorField onValueChange={(hex) => ...}>`. */
  onChange?: { 'Use <ColorField onValueChange={(hex) => ...}>': never };
  /** Not a prop. Ouro UI uses `error`: `<ColorField error="Pick a darker color.">`. */
  errorMessage?: { 'Use <ColorField error="Pick a darker color.">': never };
  /** Not a prop. Ouro UI uses `description`: `<ColorField description="...">`. */
  helperText?: { 'Use <ColorField description="...">': never };
  /** Not a prop. `error` marks the field invalid: `<ColorField error="What is wrong">`. */
  isInvalid?: { 'Use <ColorField error="What is wrong">': never };
  /** Not a prop. `error` marks the field invalid: `<ColorField error="What is wrong">`. */
  invalid?: { 'Use <ColorField error="What is wrong">': never };
  /** Not a prop. Ouro UI uses `required`: `<ColorField required>`. */
  isRequired?: { 'Use <ColorField required>': never };
  /** Not a prop. Ouro UI uses `disabled`: `<ColorField disabled>`. */
  isDisabled?: { 'Use <ColorField disabled>': never };
}

/** Field's messages and root name ColorField. */
const owner = { name: "ColorField", data: "color-field" };

interface ControlProps {
  color: string;
  onPick: (hex: string) => void;
  /** Puts the color back as the form resets, and gives the color it now has. */
  onReset: () => string;
  pickerLabel: string;
  disabled: boolean | undefined;
  inputRef: Ref<HTMLInputElement>;
  textRef: { current: HTMLInputElement | null };
}

/** Nothing to subscribe to: whether the browser has a color picker never changes. */
const subscribeNever = () => () => {};

/** The swatch and the text, inside the Field, where they read its server-known description ids. */
function Control({ color, onPick, onReset, pickerLabel, disabled, inputRef, textRef }: ControlProps): JSX.Element {
  const field = useField()!;
  const hasPicker = useSyncExternalStore(subscribeNever, supportsColorInput, () => true);
  // The text the person is typing; it follows the color whenever the color changes elsewhere.
  const [draft, setDraft] = useState(color);
  const [shown, setShown] = useState(color);
  if (shown !== color) {
    setShown(color);
    if (hexOf(draft) !== color) setDraft(color);
  }

  // The form gets the color as #rrggbb, whatever the text says at that moment, and a form
  // reset puts the color and the text back.
  useEffect(() => {
    const form = textRef.current!.form;
    if (!form) return;
    const onFormData = (event: FormDataEvent) => {
      const input = textRef.current!;
      if (input.name && !input.disabled) event.formData.set(input.name, color);
    };
    const onFormReset = () => setDraft(onReset());
    form.addEventListener("formdata", onFormData);
    form.addEventListener("reset", onFormReset);
    return () => {
      form.removeEventListener("formdata", onFormData);
      form.removeEventListener("reset", onFormReset);
    };
  }, [textRef, color, onReset]);

  return (
    <div data-ouro-input-group="" className={boxClass}>
      {hasPicker ? (
        <label className={swatchClass}>
          <TouchTarget />
          <input
            type="color"
            data-ouro-control="color-field"
            data-ouro-part="picker"
            value={color}
            aria-label={pickerLabel}
            aria-describedby={field.describedBy}
            disabled={disabled}
            onChange={(event) => {
              // Only a browser with a picker renders it, and its value is always #rrggbb.
              const hex = hexOf(event.currentTarget.value)!;
              setDraft(hex);
              onPick(hex);
            }}
            className={pickerClass}
          />
        </label>
      ) : (
        // Without a picker the swatch only shows the color; the hex text takes it.
        <span aria-hidden="true" data-ouro-color-swatch="" className={plainSwatchClass} style={{ backgroundColor: color }} />
      )}
      <FieldControl
        ref={inputRef}
        value={draft}
        onValueChange={(text) => {
          setDraft(text);
          const hex = hexOf(text);
          if (hex) onPick(hex);
        }}
        onBlur={() => setDraft(color)}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        // A color always has a value (the form gets it from formdata), so the text is never
        // natively required; aria-required and the label's marker still say it is.
        render={(controlProps) => <input {...controlProps} type="text" required={false} data-ouro-control="color-field" data-ouro-part="input" className={textClass} />}
      />
    </div>
  );
}

/**
 * A color on the Field contract: a swatch that opens the system color picker, next to the
 * same color as hex text, kept in step both ways. Typing a whole hex (`#36f` or `#3366ff`)
 * moves the swatch, leaving the text tidies it, and the form always gets `#rrggbb`.
 *
 * Use `RadioGroup` instead when the colors come from a short fixed list, such as tag colors.
 *
 * @group Forms
 * @see https://ourostack.github.io/ouro-ui/docs/color-field
 *
 * @example
 * <ColorField label="Accent color" name="accent" defaultValue="#3366ff" error={errors?.accent} />
 * <ColorField label="Tag color" value={color} onValueChange={setColor} />
 */
export function ColorField(props: ColorFieldProps): JSX.Element {
  const {
    label,
    hideLabel,
    description,
    error,
    required,
    disabled,
    name,
    value,
    defaultValue,
    onValueChange,
    pickerLabel = "Pick a color",
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    format,
    alpha,
    color: colorGuess,
    onChange,
    errorMessage,
    helperText,
    isInvalid,
    invalid,
    isRequired,
    isDisabled,
  } = props;
  useDevWarnings(
    "ColorField",
    process.env.NODE_ENV !== "production"
      ? () => [
          value !== undefined && !hexOf(value) && [`value="${value}" is not a hex color`, `<ColorField value="${toHex(value)}">`],
          defaultValue !== undefined &&
            !hexOf(defaultValue) && [`defaultValue="${defaultValue}" is not a hex color`, `<ColorField defaultValue="${toHex(defaultValue)}">`],
          ...contractWarnings("ColorField", { errorMessage, helperText, isInvalid, invalid, isRequired, isDisabled }),
          format !== undefined && ["format is not a prop; ColorField takes and gives #rrggbb", '<ColorField defaultValue="#3366ff">'],
          alpha !== undefined && ["alpha is not supported; ColorField takes #rrggbb", '<ColorField defaultValue="#3366ff">'],
          colorGuess !== undefined && ["color is not a prop", `<ColorField defaultValue="${String(colorGuess)}">`],
          onChange !== undefined && ["onChange is not a prop", "<ColorField onValueChange={(hex) => …}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const [own, setOwn] = useState(() => hexOf(defaultValue) ?? "#000000");
  const color = value !== undefined ? (hexOf(value) ?? "#000000") : own;
  const pick = (hex: string) => {
    if (value === undefined) setOwn(hex);
    if (hex !== color) onValueChange?.(hex);
  };
  // A form reset puts back defaultValue; a controlled color stays the app's.
  const reset = () => {
    if (value !== undefined) return color;
    const initial = hexOf(defaultValue) ?? "#000000";
    pick(initial);
    return initial;
  };
  const textRef = useRef<HTMLInputElement | null>(null);
  const setRef = useMergedRef(ref, textRef);

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
        <Control color={color} onPick={pick} onReset={reset} pickerLabel={pickerLabel} disabled={disabled} inputRef={setRef} textRef={textRef} />
      </Field>
    </FieldOwnerContext.Provider>
  );
}
