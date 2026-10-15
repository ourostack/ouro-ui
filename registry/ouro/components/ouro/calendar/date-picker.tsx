"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type JSX, type MouseEvent, type ReactNode, type Ref } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Calendar } from "@/registry/ouro/components/ouro/calendar/calendar";
import { isIsoDate, isoWarning } from "@/registry/ouro/components/ouro/calendar/calendar-styles";
import { formatDateInput, parseDateInput } from "@/registry/ouro/components/ouro/calendar/date-picker-styles";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { FieldControl } from "@/registry/ouro/components/ouro/field/field-parts";
import { contractWarnings } from "@/registry/ouro/components/ouro/field/field-styles";
import {
  PopoverClose,
  PopoverPopupUnchecked,
  PopoverPortal,
  PopoverPositionerUnchecked,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "@/registry/ouro/components/ouro/popover/popover-parts";
import { endSlotClass, groupClass, inputClass } from "@/registry/ouro/components/ouro/text-field/text-field-styles";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { FieldOwnerContext, useFormErrors, type ErrorMessages } from "@/registry/ouro/lib/ouro/use-field";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";

/** Props for {@link DatePicker}. */
export interface DatePickerProps {
  /**
   * What the date is for, shown above the field and read as its name. Required: every control
   * needs a name. To hide it visually, keep it and add `hideLabel`.
   */
  label: string;
  /** Hides the label visually; screen readers still read it as the field's name. */
  hideLabel?: boolean | undefined;
  /** Supporting text under the label, read after the label through `aria-describedby`. */
  description?: ReactNode | undefined;
  /**
   * What is wrong, from your server action or client check. The message (or several, as a
   * list) shows under the field, which gets `aria-invalid`. A message is text or a React node (one with a link); an empty string or array means valid.
   */
  error?: ErrorMessages | undefined;
  /** A date must be given: the field gets `required` and `aria-required`, and the label a marker. */
  required?: boolean | undefined;
  /** Disables the field and its calendar button, and fades it. */
  disabled?: boolean | undefined;
  /** The form field name. The form submits the ISO date (`2026-10-11`) under it, or an empty string. */
  name?: string | undefined;
  /** The date as an ISO date (`"2026-10-11"`), or `""` for none. Pass it with `onValueChange` to control the field. */
  value?: string | undefined;
  /** The date at first, as an ISO date, when you do not control `value`. */
  defaultValue?: string | undefined;
  /**
   * Called with the ISO date when the user picks or types an allowed date, and with `""` when
   * the field no longer holds one. A date before `min`, after `max` or named by
   * `isDateDisabled`, typed or chosen in the phone's own picker, is not a value: it reports
   * `""`, and the field shows why and blocks the submit.
   */
  onValueChange?: ((value: string) => void) | undefined;
  /** The earliest date allowed, as an ISO date. Earlier days are unavailable in the calendar, and a typed one is invalid. */
  min?: string | undefined;
  /** The latest date allowed, as an ISO date. Later days are unavailable in the calendar, and a typed one is invalid. */
  max?: string | undefined;
  /**
   * Marks single days unavailable: `isDateDisabled={(date) => booked.has(date)}`. It gets each
   * day as an ISO date. Such a day, typed or picked in the phone's own picker, is invalid.
   */
  isDateDisabled?: ((date: string) => boolean) | undefined;
  /**
   * The BCP 47 locale for the calendar and the typed format: `"en-GB"` reads 11/10/2026 as
   * 11 October and starts weeks on Monday. Pass your app's locale; the default is the same
   * on the server and in the browser. Phones show their own picker in the phone's language.
   * @default "en-US"
   */
  locale?: string | undefined;
  /** An example of what to type, shown while the field is empty: `"MM/DD/YYYY"`. It is not a label. */
  placeholder?: string | undefined;
  /** The field shows its date but cannot be changed; its calendar button is disabled. */
  readOnly?: boolean | undefined;
  /**
   * The name of the button that opens the calendar, as visually hidden text and not an
   * `aria-label`, so a test's `getByLabel("Date")` finds the text box alone. Translate it with your app.
   * @default "Choose date"
   */
  chooseDateLabel?: string | undefined;
  /**
   * The calendar's previous month button's label. Translate it with your app.
   * @default "Previous month"
   */
  previousMonthLabel?: string | undefined;
  /**
   * The calendar's next month button's label. Translate it with your app.
   * @default "Next month"
   */
  nextMonthLabel?: string | undefined;
  /**
   * The label of the calendar's close button, which only screen readers and the keyboard
   * reach. Translate it with your app.
   * @default "Close"
   */
  closeLabel?: string | undefined;
  /**
   * The browser's message for typed text that is not a date, or a date `isDateDisabled` names. Translate it with your app.
   * @default "Enter a valid date."
   */
  invalidDateMessage?: string | undefined;
  /**
   * The browser's message for a typed date before `min` or after `max`. Translate it with your app.
   * @default "Enter a date in the allowed range."
   */
  outOfRangeMessage?: string | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-4`, `col-span-2`). Appearance classes
   * warn in development; style fields in your theme.
   */
  className?: string | undefined;
  /** The input element. */
  ref?: Ref<HTMLInputElement> | undefined;

  /** Not a prop. Ouro UI uses `error`: `<DatePicker error="Required.">`. */
  errorMessage?: { 'Use <DatePicker error="Required.">': never };
  /** Not a prop. Ouro UI uses `description`: `<DatePicker description="...">`. */
  helperText?: { 'Use <DatePicker description="...">': never };
  /** Not a prop. `error` marks the field invalid: `<DatePicker error="What is wrong">`. */
  isInvalid?: { 'Use <DatePicker error="What is wrong">': never };
  /** Not a prop. `error` marks the field invalid: `<DatePicker error="What is wrong">`. */
  invalid?: { 'Use <DatePicker error="What is wrong">': never };
  /** Not a prop. Ouro UI uses `required`: `<DatePicker required>`. */
  isRequired?: { 'Use <DatePicker required>': never };
  /** Not a prop. Ouro UI uses `disabled`: `<DatePicker disabled>`. */
  isDisabled?: { 'Use <DatePicker disabled>': never };
  /** Not a prop. Ouro UI uses `onValueChange`, which gets the ISO date: `<DatePicker onValueChange={setDate}>`. */
  onChange?: { 'Use onValueChange={setDate}; it gets the ISO date': never };
  /** Not a prop. Ouro UI uses `value`: `<DatePicker value={date} onValueChange={setDate}>`. */
  selected?: { 'Use value={date} onValueChange={setDate}': never };
  /** Not a prop. Ouro UI uses `min`: `<DatePicker min="2026-10-11">`. */
  minDate?: { 'Use min="2026-10-11"': never };
  /** Not a prop. Ouro UI uses `max`: `<DatePicker max="2026-12-31">`. */
  maxDate?: { 'Use max="2026-12-31"': never };
  /** Not a prop. The locale sets the format: `<DatePicker locale="en-GB">`. */
  dateFormat?: { 'The locale sets it: locale="en-GB"': never };
  /** Not a prop. The locale sets the format: `<DatePicker locale="en-GB">`. */
  format?: { 'The locale sets it: locale="en-GB"': never };
}

/** Field's messages and root name DatePicker. */
const owner = { name: "DatePicker", data: "date-picker" };

/**
 * A labeled date field. With a mouse or trackpad it is a text box you can type the date into
 * (in the locale's numbers, or ISO; a two-digit year is the one within 50 years of today) with a button that opens a `Calendar` in a popover; on a
 * touch screen it is the phone's own date picker (`<input type="date">`). Either way the
 * value is an ISO date (`"2026-10-11"`) and the form submits it under `name`, as a native
 * date input does.
 *
 * Use `Calendar` instead for a calendar always on the page or for a range of dates, and
 * `TextField type="time"` for a time.
 *
 * @group Forms
 * @see https://ourostack.github.io/ouro-ui/docs/date-picker
 *
 * @example
 * <DatePicker label="Delivery date" name="delivery" min="2026-10-11" required error={errors?.delivery} />
 * <DatePicker label="Birthday" value={birthday} onValueChange={setBirthday} locale="en-GB" />
 */
export function DatePicker(props: DatePickerProps): JSX.Element {
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
    min,
    max,
    isDateDisabled,
    locale = "en-US",
    placeholder,
    readOnly,
    chooseDateLabel = "Choose date",
    previousMonthLabel,
    nextMonthLabel,
    closeLabel = "Close",
    invalidDateMessage = "Enter a valid date.",
    outOfRangeMessage = "Enter a date in the allowed range.",
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    errorMessage,
    helperText,
    isInvalid,
    invalid,
    isRequired,
    isDisabled,
    onChange,
    selected,
    minDate,
    maxDate,
    dateFormat,
    format,
  } = props;

  useDevWarnings(
    "DatePicker",
    process.env.NODE_ENV !== "production"
      ? () => [
          ...(
            [
              ["value", value],
              ["defaultValue", defaultValue],
              ["min", min],
              ["max", max],
            ] as const
          ).map(([prop, given]) => given !== undefined && given !== "" && !isIsoDate(given) && isoWarning("DatePicker", prop, given)),
          ...contractWarnings("DatePicker", { errorMessage, helperText, isInvalid, invalid, isRequired, isDisabled }),
          onChange !== undefined && ["onChange is not a prop; onValueChange gets the ISO date", "<DatePicker onValueChange={setDate}>"],
          selected !== undefined && ["selected is not a prop", "<DatePicker value={date} onValueChange={setDate}>"],
          minDate !== undefined && ["minDate is not a prop", '<DatePicker min="2026-10-11">'],
          maxDate !== undefined && ["maxDate is not a prop", '<DatePicker max="2026-12-31">'],
          dateFormat !== undefined && ["dateFormat is not a prop; the locale sets the format", '<DatePicker locale="en-GB">'],
          format !== undefined && ["format is not a prop; the locale sets the format", '<DatePicker locale="en-GB">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // A touch screen gets the phone's own picker; the server renders the text box and calendar.
  const touch = useMediaQuery("(pointer: coarse)", false);

  const low = isIsoDate(min) ? min : undefined;
  const high = isIsoDate(max) ? max : undefined;
  const inRange = (date: string) => !(low && date < low) && !(high && date > high);
  /** The value a date stands for: itself when it is an allowed one, else `""`. */
  const allowedOrEmpty = (date: string | null) => (date !== null && date !== "" && inRange(date) && !isDateDisabled?.(date) ? date : "");
  const defaultDate = isIsoDate(defaultValue) ? defaultValue : "";
  // An invalid default remains visible as a draft, but is not a submitted date.
  const [own, setOwn] = useState(() => allowedOrEmpty(defaultDate));
  const controlled = value !== undefined;
  const iso = controlled ? (isIsoDate(value) ? value : "") : own;
  const currentIso = useRef(iso);
  const formErrors = useFormErrors();
  const report = (next: string) => {
    if (name !== undefined) formErrors?.clear(name);
    onValueChange?.(next);
  };
  const commit = (next: string) => {
    if (next === currentIso.current) return;
    if (!controlled) {
      currentIso.current = next;
      setOwn(next);
    }
    report(next);
  };

  /** The value a typed text stands for. */
  const valueOf = (typedText: string) => allowedOrEmpty(parseDateInput(typedText, locale));

  // What the phone's own picker shows: the date the user chose, which may not be an allowed one.
  const initialDate = controlled ? iso : defaultDate;
  const [chosen, setChosen] = useState(initialDate);
  // What the text box shows. A new value from outside rewrites it, unless it already stands for that value.
  const [text, setText] = useState(() => formatDateInput(initialDate, locale));
  const [shown, setShown] = useState(`${iso} ${locale}`);
  if (shown !== `${iso} ${locale}`) {
    setShown(`${iso} ${locale}`);
    if (valueOf(text) !== iso) setText(formatDateInput(iso, locale));
    if (allowedOrEmpty(isIsoDate(chosen) ? chosen : null) !== iso) setChosen(iso);
  }

  // The browser blocks the submit with a message while the field holds what is not an
  // allowed date.
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = text.trim() === "" ? null : parseDateInput(text, locale);
  // Both paths give the same messages; the native input checks its own format.
  const problem = touch
    ? isIsoDate(chosen) && (isDateDisabled?.(chosen) ? invalidDateMessage : !inRange(chosen) && outOfRangeMessage)
    : text.trim() !== "" && (typed === null || isDateDisabled?.(typed) ? invalidDateMessage : !inRange(typed) && outOfRangeMessage);
  const message = problem || "";
  useEffect(() => {
    inputRef.current!.setCustomValidity(message);
  }, [message, touch]);

  // What the field holds as a value: the picker's or the box's date when it is allowed. Typing
  // and picking report it as they go; when the app changes min, max or isDateDisabled, a held
  // date can become allowed (or stop being allowed), so report the change then too.
  const held = touch ? allowedOrEmpty(isIsoDate(chosen) ? chosen : null) : valueOf(text);
  const lastHeld = useRef(held);
  useEffect(() => {
    if (held === lastHeld.current) return;
    lastHeld.current = held;
    commit(held);
  });

  const backingRef = useRef<HTMLInputElement>(null);
  const resetDate = controlled ? iso : defaultDate;
  const resetIso = controlled ? iso : allowedOrEmpty(resetDate);
  const restore = () => {
    const changed = resetIso !== currentIso.current;
    lastHeld.current = allowedOrEmpty(resetDate);
    if (!controlled) {
      currentIso.current = resetIso;
      setOwn(resetIso);
    }
    setText(formatDateInput(resetDate, locale));
    setChosen(resetDate);
    if (!controlled && changed) report(resetIso);
  };
  const restoreRef = useRef(restore);
  useLayoutEffect(() => {
    currentIso.current = iso;
    restoreRef.current = restore;
    // Native reset needs defaults distinct from the current React-owned draft and ISO value.
    if (backingRef.current) backingRef.current.value = iso;
    inputRef.current!.defaultValue = touch ? resetDate : formatDateInput(resetDate, locale);
  });
  const lastReset = useRef<Event | undefined>(undefined);
  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!form) return;
    const reset = (event: Event) => {
      lastReset.current = event;
      queueMicrotask(() => {
        if (lastReset.current !== event) return;
        lastReset.current = undefined;
        // Observe cancellation after propagation; a later edit or replacement wins over this reset.
        const current = inputRef.current;
        if (!event.defaultPrevented && event.target === form && current === input && current.value === current.defaultValue) restoreRef.current();
      });
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [touch]);

  // A typed date outside min and max, or one isDateDisabled names, is not a value: the field
  // reports `""` and shows why, as the browser blocks the submit.
  const onType = (event: ChangeEvent<HTMLInputElement>) => {
    lastReset.current = undefined;
    const next = event.currentTarget.value;
    setText(next);
    commit(valueOf(next));
  };
  // Leaving the box writes a typed date the locale's way: 10/11/26 becomes 10/11/2026.
  const tidy = () => {
    if (typed !== null) setText(formatDateInput(typed, locale));
  };

  const [open, setOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const pick = (date: string) => {
    lastReset.current = undefined;
    commit(date);
    setText(formatDateInput(date, locale));
    setOpen(false);
  };

  // Pressing the box outside the input focuses the input, as TextField does; the button keeps its own focus.
  const focusInput = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target === inputRef.current || target.closest("button")) return;
    event.preventDefault();
    inputRef.current!.focus();
  };

  const setRef = useMergedRef(ref, inputRef);

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
        <div data-ouro-input-group="" className={groupClass} onMouseDown={focusInput}>
          {touch ? (
            <FieldControl
              ref={setRef}
              type="date"
              value={chosen}
              min={low}
              max={high}
              readOnly={readOnly}
              onChange={(event) => {
                lastReset.current = undefined;
                const next = event.currentTarget.value;
                setChosen(next);
                commit(allowedOrEmpty(isIsoDate(next) ? next : null));
              }}
              render={(controlProps) => <input {...controlProps} name={undefined} className={inputClass} />}
            />
          ) : (
            <>
              {/* The text box submits nothing; the hidden input submits the ISO date, as the native input does. */}
              <FieldControl
                ref={setRef}
                type="text"
                value={text}
                placeholder={placeholder}
                readOnly={readOnly}
                autoComplete="off"
                spellCheck={false}
                onChange={onType}
                onBlur={tidy}
                render={(controlProps) => <input {...controlProps} name={undefined} className={inputClass} />}
              />
              <span className={endSlotClass}>
                <PopoverRoot open={open} onOpenChange={setOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="plain"
                        tone="secondary"
                        size="sm"
                        data-ouro-choose-date=""
                        disabled={disabled || readOnly}
                        className="aspect-square px-0"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-4"
                        >
                          <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
                          <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
                        </svg>
                        {/* Named by hidden text, not `aria-label`, which is label text: a label
                            lookup for a field called "Date" would also find "Choose date". */}
                        <span className="sr-only">{chooseDateLabel}</span>
                      </Button>
                    }
                  />
                  <PopoverPortal>
                    <PopoverPositionerUnchecked side="bottom" align="end">
                      <PopoverPopupUnchecked
                        className="w-auto"
                        initialFocus={() => calendarRef.current!.querySelector<HTMLElement>('[data-ouro-day][tabindex="0"]')}
                      >
                        <PopoverTitle visuallyHidden>{label}</PopoverTitle>
                        <Calendar
                          ref={calendarRef}
                          label={label}
                          value={iso}
                          onValueChange={pick}
                          min={low}
                          max={high}
                          isDateDisabled={isDateDisabled}
                          locale={locale}
                          previousMonthLabel={previousMonthLabel}
                          nextMonthLabel={nextMonthLabel}
                        />
                        <PopoverClose data-ouro-popover-close="">{closeLabel}</PopoverClose>
                      </PopoverPopupUnchecked>
                    </PopoverPositionerUnchecked>
                  </PopoverPortal>
                </PopoverRoot>
              </span>
            </>
          )}
          {name !== undefined && <input ref={backingRef} type="text" hidden readOnly name={name} defaultValue={resetIso} disabled={disabled} />}
        </div>
      </Field>
    </FieldOwnerContext.Provider>
  );
}
