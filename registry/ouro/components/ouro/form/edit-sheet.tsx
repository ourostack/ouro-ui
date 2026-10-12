"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type ReactElement, type ReactNode } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";
import { checkOpenMode } from "@/registry/ouro/lib/ouro/open-mode";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DialogFrame } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Form, type FormErrors } from "@/registry/ouro/components/ouro/form/form";
import { sheetHint } from "@/registry/ouro/components/ouro/sheet/sheet-styles";

/** What `onSubmit` may return: nothing (saved), or errors by field name (not saved). */
export type EditSheetResult = void | undefined | FormErrors;

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
   * with each message on its field and focus on the first. Return a promise to show
   * `loading` on the save button until it settles. If it rejects (or throws), the sheet stays
   * open; Cancel and Escape still close it, and a result that arrives later is ignored.
   */
  onSubmit: (data: FormData) => EditSheetResult | Promise<EditSheetResult>;
  /** The save button's label: the action, such as `"Save recipe"`. Translate it with your app. @default "Save" */
  submitLabel?: string | undefined;
  /** The cancel button's label. Translate it with your app. @default "Cancel" */
  cancelLabel?: string | undefined;
  /** The label of the close button in the corner. Translate it with your app. @default "Close" */
  closeLabel?: string | undefined;
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
  /** Called with `false` when the user cancels or dismisses the sheet, and when a save succeeds. */
  onOpenChange: (open: boolean) => void;
  /** Not with `open`. Remove `open` and `onOpenChange` to let a trigger open the sheet. */
  trigger?: never;
};

/** Props for {@link EditSheet}: either `trigger`, or `open` with `onOpenChange`. */
export type EditSheetProps = EditSheetWithTriggerProps | EditSheetControlledProps;

/** Whether `onSubmit` returned errors to show, rather than nothing or an empty object. */
const hasErrors = (result: EditSheetResult): result is FormErrors => Boolean(result) && Object.keys(result!).length > 0;

/**
 * Edits something in a form inside a dialog: the whole interaction, done right. It opens
 * from `trigger` as a centered dialog, or a bottom sheet on phones, with your fields, Cancel
 * and a save button. Saving runs the browser's checks, then `onSubmit` with the fields as
 * `FormData`; a promise shows `loading` on the save button and keeps the sheet open. Errors
 * it returns land on the matching fields, with focus on the first; success closes the sheet
 * and returns focus to the trigger.
 *
 * Use `Form` instead for a form on the page, `Dialog` for a dialog that is not a form, and
 * `ConfirmDialog` to confirm one action.
 *
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
  const [errors, setErrors] = useState<FormErrors | undefined>();
  const [pending, setPending] = useState(false);
  // Each opening starts clean, however it opened (the app may set `open` itself).
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    setErrors(undefined);
    setPending(false);
  }
  // Each open and close bumps the attempt, so a save that settles after the user left
  // (Cancel, Escape) neither closes nor marks a sheet they have since reopened.
  const attempt = useRef(0);
  useEffect(() => {
    attempt.current++;
  }, [shown]);
  const warnKey = useRef({});

  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange!(next);
    else setOwnOpen(next);
  };

  // Nothing (or no errors) closes the sheet; errors stay on the fields, focus on the first.
  const finish = (result: EditSheetResult) => {
    if (hasErrors(result)) setErrors(result);
    else setOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    let result: EditSheetResult | Promise<EditSheetResult>;
    try {
      result = onSubmit(new FormData(event.currentTarget));
    } catch (error) {
      // A synchronous throw takes the rejection path: the sheet stays open and the error is reported.
      result = Promise.reject(error);
    }
    if (!(result instanceof Promise)) {
      finish(result);
      return;
    }
    const current = attempt.current;
    setPending(true);
    result.then(
      (value) => {
        if (attempt.current !== current) return;
        setPending(false);
        finish(value);
      },
      (error: unknown) => {
        const stale = attempt.current !== current;
        if (!stale) setPending(false);
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
      onOpenChange={setOpen}
      footer={
        <>
          <Button variant="outline" tone="secondary" onClick={() => setOpen(false)}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <Form id={formId} errors={errors} onSubmit={submit}>
        {children}
      </Form>
    </DialogFrame>
  );
}
