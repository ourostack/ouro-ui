"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type JSX, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";
import { checkOpenMode } from "@/registry/ouro/lib/ouro/open-mode";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DialogFrame } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Form, type ReadonlyFormErrors } from "@/registry/ouro/components/ouro/form/form";
import { sheetHint } from "@/registry/ouro/components/ouro/sheet/sheet-styles";
import { formErrors } from "@/registry/ouro/lib/ouro/form-answer";

/**
 * Pressing Save or Cancel leaves focus in the field. On a phone, focus leaving the field
 * drops the software keyboard and its inset, which moves the footer down before the click
 * lands, so the tap would miss. A tap moves focus on its compatibility `mousedown`, so
 * cancelling that is enough, and `pointerdown` is left alone.
 */
const keepFieldFocus = {
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
};

/** What `onSubmit` may return: nothing (saved), or errors by field name (not saved). */
export type EditSheetResult = void | undefined | ReadonlyFormErrors;

/** Props shared by both ways of opening an EditSheet. */
export interface EditSheetBaseProps {
  /** Names the sheet for screen readers and shows at its top: `title="Edit recipe"`. Hide it with `hideTitle`. */
  title: string;
  /** Hides the title visually. It still names the sheet for screen readers. */
  hideTitle?: boolean | undefined;
  /** A short line under the title, read out when the sheet opens. */
  description?: ReactNode;
  /**
   * Saves the form. It gets the fields as `FormData`, after the browser's own checks
   * (`required`, `type="email"`) pass. Return nothing to close the sheet and return focus to
   * the trigger, or errors by field name (`{ name: "That name is taken." }`) to keep it open
   * with each message on its field and focus on the first; a `form` key, or a key no field
   * is named, shows in an alert at the top of the form. Return a promise to show `loading`
   * on the save button until it settles; meanwhile Cancel is disabled and the sheet cannot
   * be dismissed. If it rejects (or throws), the sheet stays open with `failureMessage`.
   */
  onSubmit: (data: FormData) => EditSheetResult | Promise<EditSheetResult>;
  /** The save button's label: the action, such as `"Save recipe"`. Translate it with your app. @default "Save" */
  submitLabel?: string | undefined;
  /** The cancel button's label. Translate it with your app. @default "Cancel" */
  cancelLabel?: string | undefined;
  /** The label of the close button in the corner. Translate it with your app. @default "Close" */
  closeLabel?: string | undefined;
  /** What the sheet shows, at the top of the form, when `onSubmit` rejects or throws. Translate it with your app. @default "Couldn't save. Try again." */
  failureMessage?: string | undefined;
  /**
   * The question the sheet asks, in place of its buttons, when the user dismisses it (Escape,
   * a tap outside, a swipe down, Cancel or the close button) after changing a field.
   * Translate it with your app. @default "Discard your changes?"
   */
  discardMessage?: string | undefined;
  /** The button that discards the edits and closes the sheet. @default "Discard" */
  discardLabel?: string | undefined;
  /** The button that goes back to the form with the edits kept; it takes focus. @default "Keep editing" */
  keepEditingLabel?: string | undefined;
  /**
   * Called when the user confirms Discard, before the sheet closes. With controlled fields
   * (`value` and `onValueChange`), reset your state here: the sheet cannot reset values it
   * does not own, so they would come back on the next opening:
   * `<TextField name="name" value={name} onValueChange={setName} />` with
   * `onDiscard={() => setName(recipe.name)}`. Not called for a save, or a dismissal with
   * nothing changed.
   */
  onDiscard?: (() => void) | undefined;
  /** The fields: `TextField`, `Select` and other controls with a `name`. */
  children: ReactNode;
  /**
   * Layout only, applied to the panel: margins (`mt-4`). Your classes win over Ouro UI's.
   * Appearance classes warn in development.
   */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `onSubmit`: `<EditSheet onSubmit={(data) => save(data)}>`. */
  onSave?: { 'Use <EditSheet onSubmit={(data) => save(data)}>': never };
  /** Not a prop. Ouro UI uses `submitLabel`: `<EditSheet submitLabel="Save">`. */
  saveLabel?: { 'Use <EditSheet submitLabel="Save">': never };
  /** Not a prop. Ouro UI uses `submitLabel`: `<EditSheet submitLabel="Save">`. */
  submitText?: { 'Use <EditSheet submitLabel="Save">': never };
  /** Not a prop. Return errors from `onSubmit`: `onSubmit={async (data) => (await save(data)).errors}`. */
  errors?: { 'Return errors from onSubmit: onSubmit={async (data) => (await save(data)).errors}': never };
  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<EditSheet open={open} onOpenChange={setOpen}>`. */
  isOpen?: { 'Use <EditSheet open={open} onOpenChange={setOpen}>': never };
  /** Not a prop. `onOpenChange(false)` fires on close: `<EditSheet open={open} onOpenChange={setOpen}>`. */
  onClose?: { 'Use <EditSheet open={open} onOpenChange={setOpen}>': never };
}

/** An uncontrolled EditSheet: `trigger` opens it. */
export type EditSheetWithTriggerProps = EditSheetBaseProps & {
  /** The element that opens the sheet, usually a Button: `trigger={<Button>Edit</Button>}`. */
  trigger: ReactElement;
  /** Not with `trigger`. Remove `trigger` to control the sheet with `open` and `onOpenChange`. */
  open?: never;
  /** Not with `trigger`. Remove `trigger` to control the sheet with `open` and `onOpenChange`. */
  onOpenChange?: never;
};

/** A controlled EditSheet: you own `open` and update it in `onOpenChange`. */
export type EditSheetControlledProps = EditSheetBaseProps & {
  /** Whether the sheet is open. */
  open: boolean;
  /** Called with `false` when the user cancels or dismisses the sheet (after confirming, with edits), and when a save succeeds. */
  onOpenChange: (open: boolean) => void;
  /** Not with `open`. Remove `open` and `onOpenChange` to let a trigger open the sheet. */
  trigger?: never;
};

/** Props for {@link EditSheet}: either `trigger`, or `open` with `onOpenChange`. */
export type EditSheetProps = EditSheetWithTriggerProps | EditSheetControlledProps;

/** The form's fields as text, to compare with how they were when the sheet opened. */
const serialize = (form: HTMLFormElement) =>
  [...new FormData(form)].map(([name, value]) => `${name}=${typeof value === "string" ? value : value.name}`).join("&");

/**
 * The confirmation that takes the buttons' place: the question, then Keep editing and
 * Discard, wrapping on a narrow sheet.
 */
const discardClass = "flex w-full flex-wrap items-center justify-end gap-2";

/** Whether `onSubmit` returned errors to show, rather than nothing or an empty object. */
const hasErrors = (result: EditSheetResult): result is ReadonlyFormErrors => Boolean(result) && Object.keys(result!).length > 0;

/**
 * Edits something in a form inside a dialog: the whole interaction, done right. It opens
 * from `trigger` as a centered dialog, or a bottom sheet on phones, with your fields, Cancel
 * and a save button. Saving runs the browser's checks, then `onSubmit` with the fields as
 * `FormData`; a promise shows `loading` on the save button and keeps the sheet open (it
 * cannot be dismissed meanwhile). Errors it returns land on the matching fields, with focus
 * on the first; a failed save shows `failureMessage` at the top of the form; success closes
 * the sheet and returns focus to the trigger. Dismissing it after changing a field (Escape,
 * a tap outside, a swipe down, Cancel) asks inside the sheet before the edits are lost.
 * With controlled fields, reset your state in `onDiscard`, or the discarded values come back
 * on the next opening.
 *
 * Use `Form` instead for a form on the page, `Dialog` for a dialog that is not a form, and
 * `ConfirmDialog` to confirm one action.
 *
 * @group Overlays
 * @see https://ourostack.github.io/ouro-ui/docs/edit-sheet
 *
 * @example
 * <EditSheet
 *   title="Edit recipe"
 *   trigger={<Button variant="outline">Edit</Button>}
 *   onSubmit={async (data) => (await saveRecipe(data)).errors}
 * >
 *   <TextField label="Name" name="name" defaultValue={recipe.name} required />
 *   <Select label="Course" name="course" defaultValue={recipe.course} options={courses} />
 * </EditSheet>
 */
export function EditSheet(props: EditSheetProps): JSX.Element {
  const {
    title,
    hideTitle,
    description,
    onSubmit,
    submitLabel = "Save",
    cancelLabel = "Cancel",
    closeLabel = "Close",
    failureMessage = "Couldn't save. Try again.",
    discardMessage = "Discard your changes?",
    discardLabel = "Discard",
    keepEditingLabel = "Keep editing",
    onDiscard,
    children,
    className,
    trigger,
    open,
    onOpenChange,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onSave,
    saveLabel,
    submitText,
    errors: errorsGuess,
    isOpen,
    onClose,
  } = props as EditSheetBaseProps & {
    trigger?: ReactElement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };

  checkOpenMode("EditSheet", "edit sheet", trigger !== undefined, open, onOpenChange);

  useAppearanceClassNameCheck(
    "EditSheet",
    className,
    process.env.NODE_ENV !== "production"
      ? sheetHint('<EditSheet title="…">', "</EditSheet>")
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "EditSheet",
    process.env.NODE_ENV !== "production"
      ? () => {
          const controlFix = "<EditSheet open={open} onOpenChange={setOpen}>";
          return [
            !title && ["title is required; it names the sheet for screen readers", '<EditSheet title="Edit recipe">'],
            onSave !== undefined && ["onSave is not a prop", "<EditSheet onSubmit={(data) => save(data)}>"],
            saveLabel !== undefined && ["saveLabel is not a prop", '<EditSheet submitLabel="Save">'],
            submitText !== undefined && ["submitText is not a prop", '<EditSheet submitLabel="Save">'],
            errorsGuess !== undefined && [
              "errors is not a prop; return them from onSubmit",
              "<EditSheet onSubmit={async (data) => (await save(data)).errors}>",
            ],
            isOpen !== undefined && ["isOpen is not a prop", controlFix],
            onClose !== undefined && ["onClose is not a prop", controlFix],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const formId = useId();
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = open !== undefined;
  const shown = controlled ? open : ownOpen;
  const [answer, setAnswer] = useState<{ key: number; errors: ReadonlyFormErrors | undefined }>({ key: 0, errors: undefined });
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Each opening starts clean, however it opened (the app may set `open` itself).
  const [wasShown, setWasShown] = useState(shown);
  // Each opening gets a fresh form: Base UI keeps the old one mounted through the close
  // animation, and a reopen inside it would otherwise keep an edit the user discarded.
  const [opening, setOpening] = useState(0);
  if (shown !== wasShown) {
    setWasShown(shown);
    if (shown) setOpening(opening + 1);
    setAnswer((previous) => ({ ...previous, errors: undefined }));
    setPending(false);
    setConfirming(false);
  }
  // The fields as the sheet opened, to tell whether the user changed any (a Select's value
  // is in its hidden input, so every control counts). Taken once per opening, when that
  // opening's form first mounts, so a render after an edit (a controlled field, a save that
  // failed) keeps the opening's values; a resize that swaps the dialog for the sheet mounts
  // a new form without retaking it. Closing clears it for the next opening.
  const initial = useRef<{ opening: number; values: string } | undefined>(undefined);
  const formRef = useCallback((form: HTMLFormElement | null) => {
    if (form && initial.current?.opening !== opening) initial.current = { opening, values: serialize(form) };
  }, [opening]);
  const edited = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    return form !== null && serialize(form) !== initial.current?.values;
  };
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keepRef.current!.focus({ preventScroll: true });
  }, [confirming]);
  // Each open and close bumps the attempt, so a save that settles after the user left
  // (Cancel, Escape) neither closes nor marks a sheet they have since reopened.
  const attempt = useRef(0);
  useLayoutEffect(() => {
    const lifetime = attempt;
    lifetime.current++;
    return () => { lifetime.current++; };
  }, [shown]);
  const warnKey = useRef({});

  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange!(next);
    else setOwnOpen(next);
  };

  // A dismissal (Escape, a tap outside, a swipe, Cancel, the close button) does nothing while
  // a save runs, asks first when a field changed, and goes back to the form while asking.
  const dismiss = () => {
    if (pending) return;
    if (confirming) setConfirming(false);
    else if (edited()) setConfirming(true);
    else setOpen(false);
  };
  const onFrameOpenChange = (next: boolean) => {
    if (next) setOpen(true);
    else dismiss();
  };

  // Nothing (or no errors) closes the sheet; errors stay on the fields, focus on the first.
  const refuse = (errors: ReadonlyFormErrors) => setAnswer((previous) => ({ key: previous.key + 1, errors }));
  const finish = (result: EditSheetResult) => {
    if (hasErrors(result)) refuse(result);
    else setOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const current = attempt.current;
    let result: EditSheetResult | Promise<EditSheetResult>;
    try {
      result = onSubmit(new FormData(event.currentTarget));
    } catch (error) {
      // A synchronous throw takes the rejection path: the sheet stays open and the error is reported.
      result = Promise.reject(error);
    }
    if (!(result instanceof Promise)) {
      if (attempt.current === current) finish(result);
      return;
    }
    if (attempt.current === current) setPending(true);
    result.then(
      (value) => {
        if (attempt.current !== current) return;
        setPending(false);
        finish(value);
      },
      (error: unknown) => {
        const stale = attempt.current !== current;
        if (!stale) {
          setPending(false);
          refuse({ form: failureMessage });
        }
        /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
        if (process.env.NODE_ENV !== "production") {
          const message = error instanceof Error ? error.message : String(error);
          devWarn(
            "EditSheet",
            stale ? `onSubmit rejected with "${message}" after the user had left that edit` : `onSubmit rejected with "${message}", so the sheet stayed open`,
            "return the message as an error for a field: onSubmit={async (data) => (await save(data)).errors}",
            warnKey.current,
          );
        }
      },
    );
  };

  return (
    <DialogFrame
      title={title}
      hideTitle={hideTitle}
      closeLabel={closeLabel}
      description={description}
      presentation="auto"
      size="md"
      className={className}
      trigger={trigger}
      open={shown}
      onOpenChange={onFrameOpenChange}
      closeDisabled={pending}
      footer={
        confirming ? (
          <div data-ouro="edit-sheet-discard" role="group" aria-labelledby={`${formId}-discard`} className={discardClass}>
            <p id={`${formId}-discard`} role="alert" className="m-0 me-auto text-sm leading-5 font-medium text-foreground">
              {discardMessage}
            </p>
            <Button ref={keepRef} variant="outline" tone="secondary" data-ouro-control="edit-sheet" data-ouro-part="keep-editing" onClick={() => setConfirming(false)}>
              {keepEditingLabel}
            </Button>
            <Button
              tone="destructive"
              data-ouro-control="edit-sheet"
              data-ouro-part="discard"
              onClick={() => {
                onDiscard?.();
                setOpen(false);
              }}
            >
              {discardLabel}
            </Button>
          </div>
        ) : (
          <>
            <Button variant="outline" tone="secondary" disabled={pending} data-ouro-control="edit-sheet" data-ouro-part="cancel" onClick={dismiss} {...keepFieldFocus}>
              {cancelLabel}
            </Button>
            <Button type="submit" form={formId} loading={pending} data-ouro-control="edit-sheet" data-ouro-part="submit" {...keepFieldFocus}>
              {submitLabel}
            </Button>
          </>
        )
      }
    >
      <Form key={opening} ref={formRef} id={formId} errors={formErrors(undefined, answer.errors, { key: answer.key })} onSubmit={submit}>
        {children}
      </Form>
    </DialogFrame>
  );
}
