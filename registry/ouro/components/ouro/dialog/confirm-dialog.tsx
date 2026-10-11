import { useRef, useState, type JSX, type ReactElement, type ReactNode } from "react";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";
import { checkOpenMode } from "@/registry/ouro/lib/ouro/open-mode";
import { toneWarning } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import {
  AlertDialogRoot,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogPopupUnchecked,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
} from "@/registry/ouro/components/ouro/dialog/dialog-parts";

/** Props shared by both ways of opening a ConfirmDialog. */
export interface ConfirmDialogBaseProps {
  /** The question, which names the dialog: `title="Delete recipe?"`. */
  title: string;
  /** What happens if the user confirms: `description="This can't be undone."`. */
  description?: ReactNode;
  /** The confirm button's label: the action, not "OK" (`confirmLabel="Delete"`). */
  confirmLabel: string;
  /** The cancel button's label. Cancel has focus when the dialog opens. @default "Cancel" */
  cancelLabel?: string | undefined;
  /** The confirm button's color role. Use `destructive` for destructive actions. @default "primary" */
  tone?: "primary" | "destructive" | undefined;
  /**
   * Runs the action. Return a promise to keep the dialog open while it runs: the
   * confirm button shows `loading` until it settles. When it resolves the dialog
   * closes; when it rejects (or `onConfirm` throws) the dialog stays open so the
   * user can retry or cancel. Cancel and Escape still close it while pending;
   * the result is then ignored.
   */
  onConfirm: () => void | Promise<void>;

  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<ConfirmDialog open={open} onOpenChange={setOpen}>`. */
  isOpen?: never;
  /** Not a prop. `onOpenChange(false)` fires on close: `<ConfirmDialog open={open} onOpenChange={setOpen}>`. */
  onClose?: never;
  /** Not a prop. Cancel calls `onOpenChange(false)`: `<ConfirmDialog open={open} onOpenChange={setOpen}>`. */
  onCancel?: never;
  /** Not a prop. Ouro UI uses `tone`: `<ConfirmDialog tone="destructive">`. */
  destructive?: never;
  /** Not a prop. Ouro UI uses `confirmLabel`: `<ConfirmDialog confirmLabel="Delete">`. */
  confirmText?: never;
  /** Not a prop. Ouro UI uses `cancelLabel`: `<ConfirmDialog cancelLabel="Keep">`. */
  cancelText?: never;
}

/** An uncontrolled ConfirmDialog: `trigger` opens it. */
export type ConfirmDialogWithTriggerProps = ConfirmDialogBaseProps & {
  /** The element that opens the confirmation, usually a Button: `trigger={<Button tone="destructive">Delete</Button>}`. */
  trigger: ReactElement;
  /** Not with `trigger`. Remove `trigger` to control the confirmation with `open` and `onOpenChange`. */
  open?: never;
  /** Not with `trigger`. Remove `trigger` to control the confirmation with `open` and `onOpenChange`. */
  onOpenChange?: never;
};

/** A controlled ConfirmDialog: you own `open` and update it in `onOpenChange`. */
export type ConfirmDialogControlledProps = ConfirmDialogBaseProps & {
  /** Whether the confirmation is open. */
  open: boolean;
  /** Called with `false` when the user cancels (Cancel or Escape) and when `onConfirm` finishes. */
  onOpenChange: (open: boolean) => void;
  /** Not with `open`. Remove `open` and `onOpenChange` to let a trigger open the confirmation. */
  trigger?: never;
};

/** Props for {@link ConfirmDialog}: either `trigger`, or `open` with `onOpenChange`. */
export type ConfirmDialogProps = ConfirmDialogWithTriggerProps | ConfirmDialogControlledProps;

/**
 * Asks the user to confirm an action, with Cancel focused first. It is always
 * a centered dialog, on phones too, and an outside press does not dismiss it.
 * The actions stack full width on phones, the confirm action at the bottom,
 * nearest the thumb.
 *
 * Use `tone="destructive"` for destructive actions, and return a promise from
 * `onConfirm` to show progress until the action finishes. Use `Dialog` instead
 * when the user has more to do than confirm or cancel.
 *
 * @example
 * <ConfirmDialog
 *   title="Delete recipe?"
 *   description="This can't be undone."
 *   confirmLabel="Delete"
 *   tone="destructive"
 *   onConfirm={() => deleteRecipe(id)}
 *   trigger={<Button tone="destructive" variant="soft">Delete</Button>}
 * />
 */
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element {
  const {
    title,
    description,
    confirmLabel,
    cancelLabel = "Cancel",
    tone: toneProp = "primary",
    onConfirm,
    trigger,
    open,
    onOpenChange,
    // Guard props: typed `never`, dropped here so they never reach the DOM.
    isOpen,
    onClose,
    onCancel,
    destructive,
    confirmText,
    cancelText,
  } = props as ConfirmDialogBaseProps & {
    trigger?: ReactElement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };

  // A tone that is not one of the confirm tones (a type error) warns and renders primary.
  const tone = toneProp === "destructive" ? "destructive" : "primary";

  checkOpenMode("ConfirmDialog", "confirmation", trigger !== undefined, open, onOpenChange);

  useDevWarnings(
    "ConfirmDialog",
    process.env.NODE_ENV !== "production"
      ? () => {
          const controlFix = "<ConfirmDialog open={open} onOpenChange={setOpen}>";
          return [
            tone !== toneProp && toneWarning("ConfirmDialog", String(toneProp), ["primary", "destructive"]),
            isOpen !== undefined && ["isOpen is not a prop", controlFix],
            onClose !== undefined && ["onClose is not a prop", controlFix],
            onCancel !== undefined && ["onCancel is not a prop; Cancel calls onOpenChange(false)", controlFix],
            destructive !== undefined && ["destructive is not a prop", '<ConfirmDialog tone="destructive">'],
            confirmText !== undefined && ["confirmText is not a prop", '<ConfirmDialog confirmLabel="Delete">'],
            cancelText !== undefined && ["cancelText is not a prop", '<ConfirmDialog cancelLabel="Keep">'],
          ];
        }
      : /* istanbul ignore next -- production only */ undefined,
  );

  const [ownOpen, setOwnOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Each open, close and confirm bumps the attempt, so a promise that settles
  // after the user cancelled does not close a dialog they have since reopened.
  const attempt = useRef(0);
  const warnKey = useRef({});
  const cancelRef = useRef<HTMLButtonElement>(null);

  const controlled = open !== undefined;
  const setOpen = (next: boolean) => {
    attempt.current++;
    setPending(false);
    if (controlled) onOpenChange!(next);
    else setOwnOpen(next);
  };

  const confirm = () => {
    let result: void | Promise<void>;
    try {
      result = onConfirm();
    } catch (error) {
      // A synchronous throw takes the rejection path: the dialog stays open and the error is reported.
      result = Promise.reject(error);
    }
    if (!result) {
      setOpen(false);
      return;
    }
    const current = ++attempt.current;
    setPending(true);
    result.then(
      () => {
        if (attempt.current === current) setOpen(false);
      },
      (error: unknown) => {
        // A rejection from an attempt the user already left (Cancel, Escape, a newer
        // confirm) must not clear a newer confirm's busy state; it is still reported.
        const stale = attempt.current !== current;
        if (!stale) setPending(false);
        // The else path only exists in production bundles; scripts/dev-strip.test.mjs covers it.
        /* istanbul ignore else */
        if (process.env.NODE_ENV !== "production") {
          const message = error instanceof Error ? error.message : String(error);
          devWarn(
            "ConfirmDialog",
            stale
              ? `onConfirm rejected with "${message}" after the user had left that confirmation`
              : `onConfirm rejected with "${message}", so the dialog stayed open`,
            "onConfirm={() => remove().catch((error) => { setError(error.message); throw error; })} description={error}",
            warnKey.current,
          );
        }
      },
    );
  };

  return (
    <AlertDialogRoot open={controlled ? open : ownOpen} onOpenChange={(next) => setOpen(next)}>
      {trigger !== undefined && <DialogTrigger render={trigger} />}
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPopupUnchecked size="sm" initialFocus={cancelRef} data-ouro-confirm="">
            <div data-ouro-dialog-header="" className="box-border grid shrink-0 gap-1 px-5 pt-5 pb-2">
              <DialogTitle>{title}</DialogTitle>
              {description !== undefined && <DialogDescription>{description}</DialogDescription>}
            </div>
            <DialogFooter>
              <DialogClose
                ref={cancelRef}
                render={
                  <Button variant="outline" tone="secondary">
                    {cancelLabel}
                  </Button>
                }
              />
              <Button tone={tone} loading={pending} onClick={confirm} data-tone={tone}>
                {confirmLabel}
              </Button>
            </DialogFooter>
          </DialogPopupUnchecked>
        </DialogViewport>
      </DialogPortal>
    </AlertDialogRoot>
  );
}
