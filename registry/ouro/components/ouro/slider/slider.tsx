"use client";

import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cloneElement, useId, useLayoutEffect, useMemo, useRef, type JSX, type ReactElement, type ReactNode, type Ref } from "react";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { contractWarnings } from "@/registry/ouro/components/ouro/field/field-styles";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { FieldOwnerContext, useField, useFormErrors } from "@/registry/ouro/lib/ouro/use-field";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import {
  controlClass,
  indicatorClass,
  rootClass,
  sampleClass,
  thumbClass,
  trackClass,
  valueClass,
} from "@/registry/ouro/components/ouro/slider/slider-styles";

/** A slider's value: one number, or one per thumb for a range. */
export type SliderValue = number | readonly number[];

/** The value Slider reports: a number for one thumb, an array for a range. */
export type SliderOutput<Value extends SliderValue> = Value extends readonly number[] ? number[] : number;

/** Props for {@link Slider}. A `value` or `defaultValue` array gives a thumb per value. */
export interface SliderProps<Value extends SliderValue = number> {
  /**
   * What the slider sets, shown above it and read as its name. Required: every control
   * needs a name. To hide it visually, keep it and add `hideLabel`.
   */
  label: string;
  /** Hides the label visually; screen readers still read it as the slider's name. */
  hideLabel?: boolean | undefined;
  /** Supporting text under the label, read after the label through `aria-describedby`. */
  description?: ReactNode | undefined;
  /**
   * What is wrong, from your server action or client check. The message (or several, as a
   * list) shows under the slider, which gets `aria-invalid` and the destructive color. An empty string or array means valid.
   */
  error?: string | string[] | undefined;
  /** Disables the slider and fades it. */
  disabled?: boolean | undefined;
  /** The form field name the value submits under; a range submits one entry per thumb. */
  name?: string | undefined;
  /**
   * The value, when you control it. An array gives a thumb per value: `value={[20, 80]}`
   * is a range.
   */
  value?: Value | undefined;
  /** The starting value, when the slider keeps its own. An array gives a range: `defaultValue={[20, 80]}`. */
  defaultValue?: Value | undefined;
  /** Called with the new value as the user drags, presses the track or uses the keyboard: a number, or an array for a range. */
  onValueChange?: ((value: SliderOutput<Value>) => void) | undefined;
  /** Called once the user lets go (or with each key press), with the final value. Use it to save. */
  onValueCommitted?: ((value: SliderOutput<Value>) => void) | undefined;
  /** The lowest value. @default 0 */
  min?: number | undefined;
  /** The highest value. @default 100 */
  max?: number | undefined;
  /** The distance between values. @default 1 */
  step?: number | undefined;
  /** The step for Page Up, Page Down and Shift with an arrow key. @default 10 */
  largeStep?: number | undefined;
  /**
   * How the value reads, as `Intl.NumberFormat` options, for `showValue` and screen readers:
   * `{ style: "percent" }`, `{ style: "currency", currency: "EUR" }`.
   */
  format?: Intl.NumberFormatOptions | undefined;
  /** The locale for `format`. @default the browser's */
  locale?: Intl.LocalesArgument | undefined;
  /** Shows the formatted value at the end of the slider; a range shows both ends: `$10 – $40`. */
  showValue?: boolean | undefined;
  /**
   * What each thumb of a range is called, before the label: screen readers hear
   * "Minimum, Price". Translate them with your app.
   * @default ["Minimum", "Maximum"]
   */
  thumbLabels?: readonly string[] | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-4`, `col-span-2`). Appearance classes
   * warn in development; style sliders in your theme.
   */
  className?: string | undefined;
  /** The first thumb's `<input type="range">`. */
  ref?: Ref<HTMLInputElement> | undefined;

  /** Not a prop. Ouro UI uses `error`: `<Slider error="Required.">`. */
  errorMessage?: { 'Use <Slider error="Required.">': never };
  /** Not a prop. Ouro UI uses `description`: `<Slider description="...">`. */
  helperText?: { 'Use <Slider description="...">': never };
  /** Not a prop. `error` marks the slider invalid: `<Slider error="What is wrong">`. */
  isInvalid?: { 'Use <Slider error="What is wrong">': never };
  /** Not a prop. `error` marks the slider invalid: `<Slider error="What is wrong">`. */
  invalid?: { 'Use <Slider error="What is wrong">': never };
  /** Not a prop. Ouro UI uses `disabled`: `<Slider disabled>`. */
  isDisabled?: { 'Use <Slider disabled>': never };
  /** Not a prop. A slider always has a value, so it is never missing: `<Slider defaultValue={50}>`. */
  required?: { 'A slider always has a value: <Slider defaultValue={50}>': never };
  /** Not a prop. A slider always has a value, so it is never missing: `<Slider defaultValue={50}>`. */
  isRequired?: { 'A slider always has a value: <Slider defaultValue={50}>': never };
  /** Not a prop. A value array gives a thumb per value: `<Slider defaultValue={[20, 80]}>`. */
  range?: { 'Pass a value array: <Slider defaultValue={[20, 80]}>': never };
  /** Not a prop. Ouro UI uses `min`: `<Slider min={1}>`. */
  minValue?: { 'Use <Slider min={1}>': never };
  /** Not a prop. Ouro UI uses `max`: `<Slider max={10}>`. */
  maxValue?: { 'Use <Slider max={10}>': never };
  /** Not a prop. Slider reports the value itself: `<Slider onValueChange={(value) => …}>`. */
  onChange?: { 'Use <Slider onValueChange={(value) => ...}>': never };
  /** Not a prop. Ouro UI uses `showValue`: `<Slider showValue>`. */
  valueLabelDisplay?: { 'Use <Slider showValue>': never };
  /** Not a prop. Ouro UI uses `showValue`: `<Slider showValue>`. */
  showTooltip?: { 'Use <Slider showValue>': never };
}

/** Field's messages and root name Slider. */
const owner = { name: "Slider", data: "slider" };

/**
 * A range's label names its group, with an id the server knows, and each thumb has its own
 * name, so the label points at no single input.
 */
function rangeOwner(labelId: string) {
  return {
    ...owner,
    frame: (label: ReactElement, rest: ReactNode) => (
      <>
        {cloneElement(label as ReactElement<{ htmlFor?: string | undefined; id?: string }>, { htmlFor: undefined, id: labelId })}
        {rest}
      </>
    ),
  };
}

/** The default names for a range's thumbs: Minimum and Maximum, with Middle between. */
function defaultThumbLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => (index === 0 ? "Minimum" : index === count - 1 ? "Maximum" : "Middle"));
}

/**
 * A labeled slider on the Field contract: pass `label`, and a `defaultValue` (or `value`
 * with `onValueChange`). A value array, `defaultValue={[20, 80]}`, gives a range with a thumb
 * per value. `showValue` shows the value, formatted with `format`. Each thumb has a 44px
 * touch area on phones.
 *
 * Use `NumberField` instead when people need an exact number, and `RadioGroup` for a few
 * named choices.
 *
 * @group Forms
 * @see https://ourostack.github.io/ouro-ui/docs/slider
 *
 * @example
 * <Slider label="Servings" name="servings" defaultValue={4} min={1} max={12} showValue />
 * <Slider label="Price" name="price" defaultValue={[10, 40]} format={{ style: "currency", currency: "USD" }} showValue />
 */
export function Slider<Value extends SliderValue = number>(props: SliderProps<Value>): JSX.Element {
  const {
    label,
    hideLabel,
    description,
    error,
    disabled,
    name,
    value,
    defaultValue,
    onValueChange,
    onValueCommitted,
    min,
    max,
    step,
    largeStep,
    format,
    locale,
    showValue,
    thumbLabels: thumbLabelsProp,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    errorMessage,
    helperText,
    isInvalid,
    invalid,
    isDisabled,
    required,
    isRequired,
    range,
    minValue,
    maxValue,
    onChange,
    valueLabelDisplay,
    showTooltip,
  } = props;
  const form = useFormErrors();
  // A change drops a Form error for this name, as typing does in a text field.
  const handleValueChange = (next: number | number[]) => {
    if (name !== undefined) form?.clear(name);
    (onValueChange as ((value: number | number[]) => void) | undefined)?.(next);
  };
  const current = value ?? defaultValue;
  const count = Array.isArray(current) ? current.length : 1;
  const isRange = Array.isArray(current);
  const thumbLabels = thumbLabelsProp ?? defaultThumbLabels(count);
  const labelId = `${useId()}-label`;
  const fieldOwner = useMemo(() => (isRange ? rangeOwner(labelId) : owner), [isRange, labelId]);

  useDevWarnings(
    "Slider",
    process.env.NODE_ENV !== "production"
      ? () => {
          const always = "a slider always has a value";
          return [
            ...contractWarnings("Slider", { errorMessage, helperText, isInvalid, invalid, isDisabled }),
            required !== undefined && [`required is not a prop; ${always}`, "<Slider defaultValue={50}>"],
            isRequired !== undefined && [`isRequired is not a prop; ${always}`, "<Slider defaultValue={50}>"],
            range !== undefined && ["range is not a prop; a value array gives a thumb per value", "<Slider defaultValue={[20, 80]}>"],
            minValue !== undefined && ["minValue is not a prop", `<Slider min={${String(minValue)}}>`],
            maxValue !== undefined && ["maxValue is not a prop", `<Slider max={${String(maxValue)}}>`],
            onChange !== undefined && ["onChange is not a prop", "<Slider onValueChange={(value) => …}>"],
            valueLabelDisplay !== undefined && ["valueLabelDisplay is not a prop", "<Slider showValue>"],
            showTooltip !== undefined && ["showTooltip is not a prop", "<Slider showValue>"],
            isRange &&
              thumbLabels.length !== count && [
                `thumbLabels has ${thumbLabels.length} names for ${count} thumbs`,
                `<Slider thumbLabels={[${defaultThumbLabels(count)
                  .map((name) => `"${name}"`)
                  .join(", ")}]}>`,
              ],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <FieldOwnerContext.Provider value={fieldOwner}>
      <Field label={label} hideLabel={hideLabel} description={description} error={error} disabled={disabled} name={name} className={className}>
        <SliderControl
          label={label}
          labelId={isRange ? labelId : undefined}
          isRange={isRange}
          count={count}
          thumbLabels={thumbLabels}
          showValue={showValue}
          inputRef={ref}
          rootProps={{
            value: value as number | number[] | undefined,
            defaultValue: defaultValue as number | number[] | undefined,
            onValueChange: handleValueChange,
            onValueCommitted: onValueCommitted as ((value: number | number[]) => void) | undefined,
            min,
            max,
            step,
            largeStep,
            format,
            locale,
          }}
        />
      </Field>
    </FieldOwnerContext.Provider>
  );
}

/** The Base UI slider inside the Field, where it reads the field's server-known description ids. */
function SliderControl({
  label,
  labelId,
  isRange,
  count,
  thumbLabels,
  showValue,
  inputRef,
  rootProps,
}: {
  label: string;
  labelId: string | undefined;
  isRange: boolean;
  count: number;
  thumbLabels: readonly string[];
  showValue: boolean | undefined;
  inputRef: Ref<HTMLInputElement> | undefined;
  rootProps: Pick<
    BaseSlider.Root.Props,
    "value" | "defaultValue" | "min" | "max" | "step" | "largeStep" | "format" | "locale"
  > & {
    onValueChange: ((value: number | number[]) => void) | undefined;
    onValueCommitted: ((value: number | number[]) => void) | undefined;
  };
}): JSX.Element {
  const field = useField()!;
  // Ouro's own invalid state (the error prop or the Form's error for this name), not Base UI's,
  // which would count it as a failed check and block the next submit.
  const invalid = field.invalid;
  // Base UI builds each thumb's range input itself and takes aria-invalid only from its own
  // checks, so Ouro's state goes on the inputs directly.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    for (const input of rootRef.current!.querySelectorAll('input[type="range"]')) {
      if (invalid) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  });
  const { onValueChange, onValueCommitted, ...shared } = rootProps;
  // Samples of the widest value text, all reserved so the track keeps its length: each end's
  // integer part with the step's decimals (Base UI's defaults are 0, 100 and a step of 1), plus
  // values in each power of ten, since compact notation ("1.1K") can be wider than either end.
  const number = new Intl.NumberFormat(shared.locale, shared.format);
  const min = shared.min ?? 0;
  const max = shared.max ?? 100;
  const step = shared.step ?? 1;
  const decimals = (String(step).split(".")[1] ?? "").length;
  const withDecimals = (end: number) => {
    const whole = Math.trunc(end);
    return decimals === 0 ? end : Math.sign(end || 1) * (Math.abs(whole) + Number(`0.${"8".repeat(decimals)}`));
  };
  const values = [withDecimals(min), withDecimals(max)];
  for (let power = 1; power <= Math.max(Math.abs(min), Math.abs(max)); power *= 10) {
    for (const magnitude of [1.8 * power, 8.8 * power, 10 * power - step]) {
      for (const value of [magnitude, -magnitude]) {
        const snapped = min + Math.round((value - min) / step) * step;
        if (snapped >= min && snapped <= max) values.push(snapped);
      }
    }
  }
  const texts = [...new Set(values.map((value) => number.format(value)))];
  const samples = isRange ? texts.map((text) => `${text} – ${text}`) : texts;
  return (
    <BaseSlider.Root
      ref={rootRef}
      {...shared}
      {...(invalid ? { "data-ouro-invalid": "" } : {})}
      onValueChange={onValueChange && ((next) => onValueChange(next as number | number[]))}
      onValueCommitted={onValueCommitted && ((next) => onValueCommitted(next as number | number[]))}
      aria-labelledby={labelId}
      aria-describedby={field.describedBy}
      className={`group/slider ${rootClass}`}
    >
      <BaseSlider.Control
        data-ouro-slider-control=""
        className={controlClass}
      >
        <BaseSlider.Track className={trackClass}>
          <BaseSlider.Indicator data-ouro-slider-indicator="" className={indicatorClass} />
          {Array.from({ length: count }, (_, index) => (
            <BaseSlider.Thumb
              key={index}
              index={index}
              data-ouro-slider-thumb=""
              inputRef={index === 0 ? inputRef : undefined}
              aria-label={isRange ? `${thumbLabels[index] ?? index + 1}, ${label}` : undefined}
              aria-describedby={field.describedBy}
              className={thumbClass}
            >
              <TouchTarget />
            </BaseSlider.Thumb>
          ))}
        </BaseSlider.Track>
      </BaseSlider.Control>
      {showValue && (
        <BaseSlider.Value
          data-ouro-slider-value=""
          className={valueClass}
        >
          {(formatted) => (
            <>
              <span className="col-start-1 row-start-1">{formatted.join(" – ")}</span>
              {/* Empty, so they stay out of the text: each shows its sample as a hidden pseudo-element. */}
              {samples.map((sample) => (
                <span key={sample} aria-hidden="true" data-ouro-slider-sample={sample} className={sampleClass} />
              ))}
            </>
          )}
        </BaseSlider.Value>
      )}
    </BaseSlider.Root>
  );
}
