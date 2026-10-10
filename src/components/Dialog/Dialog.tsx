import {
  cloneElement,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { useAppearanceClassNameCheck } from "../../internal/classNameCheck.ts";
import { checkOpenMode } from "../../internal/openMode.ts";
import { useMergedRef } from "../../internal/refs.ts";
import { TouchTarget } from "../../internal/TouchTarget.tsx";
import { useDevWarnings } from "../../internal/useDevWarnings.ts";
import { useMediaQuery } from "../../internal/useMediaQuery.ts";
import { sheetHint } from "../Sheet/parts.tsx";
import { SheetFrame } from "../Sheet/Sheet.tsx";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogPopupUnchecked,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
  type DialogSize,
} from "./parts.tsx";

export type { DialogSize } from "./parts.tsx";

/** How a Dialog presents: `auto` is a centered dialog from 640px up and a bottom sheet below. */
export type DialogPresentation = "auto" | "dialog" | "sheet";

/** Props shared by both ways of opening a Dialog. */
export interface DialogBaseProps {
  /** Names the dialog for screen readers and shows at its top. Always required; hide it with `hideTitle`. */
  title: string;
  /** Hides the title visually. It still names the dialog for screen readers. */
  hideTitle?: boolean | undefined;
  /**
   * The label of the close button. A centered dialog shows it as an icon button
   * in the top corner; as a sheet it is hidden until it has keyboard focus.
   * Screen-reader users on phones (who have no Escape key) can always reach it.
   * @default "Close"
   */
  closeLabel?: string | undefined;
  /** A short line under the title, read out when the dialog opens. */
  description?: ReactNode;
  /**
   * `auto` renders a centered dialog from the `sm` breakpoint (640px) up and a
   * bottom sheet you can drag away below it. The server renders the dialog form
   * and corrects it on hydration; nothing shows until it opens, so nothing shifts.
   * @default "auto"
   */
  presentation?: DialogPresentation | undefined;
  /** The centered dialog's maximum width: `sm` 24rem, `md` 32rem, `lg` 40rem. @default "md" */
  size?: DialogSize | undefined;
  /**
   * The actions row: a row at the end on wider screens, stacked full width on
   * phones. Put the primary action last, so it sits on the right on wider
   * screens and at the bottom, nearest the thumb, on phones:
   * `footer={<><Button variant="outline" tone="neutral">Cancel</Button><Button>Save</Button></>}`.
   */
  footer?: ReactNode;
  /** The body. It scrolls when the dialog is taller than the screen. */
  children: ReactNode;
  /**
   * Layout only, applied to the panel: margins (`mt-4`). Use `size` for width.
   * Your classes win over Ouro UI's. Appearance classes warn in development.
   */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<Dialog open={open} onOpenChange={setOpen}>`. */
  isOpen?: never;
  /** Not a prop. `onOpenChange(false)` fires on close: `<Dialog open={open} onOpenChange={setOpen}>`. */
  onClose?: never;
  /** Not a prop. A Dialog is centered, or a bottom sheet on phones. For another edge use `<Sheet side="…">`. */
  position?: never;
  /** Not a prop. A Dialog is centered, or a bottom sheet on phones. For another edge use `<Sheet side="…">`. */
  side?: never;
  /** Not a prop. A Dialog fits its content. For snap points use `<Sheet snapPoints={[0.5, 1]}>`. */
  snapPoints?: never;
}

/** An uncontrolled Dialog: `trigger` opens it. */
export type DialogWithTriggerProps = DialogBaseProps & {
  /** The element that opens the dialog, usually a Button: `trigger={<Button>Edit</Button>}`. */
  trigger: ReactElement;
  /** Not with `trigger`. Remove `trigger` to control the dialog with `open` and `onOpenChange`. */
  open?: never;
  /** Not with `trigger`. Remove `trigger` to control the dialog with `open` and `onOpenChange`. */
  onOpenChange?: never;
};

/** A controlled Dialog: you own `open` and update it in `onOpenChange`. */
export type DialogControlledProps = DialogBaseProps & {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called with `false` when the user dismisses the dialog (close button, Escape, outside press, swipe). */
  onOpenChange: (open: boolean) => void;
  /** Not with `open`. Remove `open` and `onOpenChange` to let a trigger open the dialog. */
  trigger?: never;
};

/** Props for {@link Dialog}: either `trigger`, or `open` with `onOpenChange`. */
export type DialogProps = DialogWithTriggerProps | DialogControlledProps;

/** The props Dialog reads from, and adds to, its trigger element. */
type TriggerProps = {
  ref?: Ref<HTMLElement> | undefined;
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
  "aria-haspopup"?: string;
  "aria-expanded"?: boolean;
};

/** The close button's icon: a 16px cross in the text color. */
function CloseIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A dialog that presents itself for the screen: a centered dialog on wider
 * screens and a bottom sheet you can drag away on phones (below 640px). It
 * handles focus, Escape, outside presses, scroll locking and a close button.
 *
 * Use `trigger` for a dialog a button opens, or `open` with `onOpenChange` to
 * control it. Use `ConfirmDialog` instead to confirm an action, and `Sheet`
 * instead when the panel should slide in from an edge at every width.
 *
 * @example
 * <Dialog title="Edit recipe" trigger={<Button>Edit</Button>}>
 *   <RecipeForm />
 * </Dialog>
 * <Dialog
 *   title="Save to cookbook"
 *   open={open}
 *   onOpenChange={setOpen}
 *   footer={<Button onClick={() => setOpen(false)}>Done</Button>}
 * >
 *   <CookbookList />
 * </Dialog>
 */
export function Dialog(props: DialogProps): JSX.Element {
  const {
    title,
    hideTitle,
    closeLabel = "Close",
    description,
    presentation = "auto",
    size = "md",
    footer,
    children,
    className,
    trigger,
    open,
    onOpenChange,
    // Guard props: typed `never`, dropped here so they never reach the DOM.
    isOpen,
    onClose,
    position,
    side,
    snapPoints,
  } = props as DialogBaseProps & {
    trigger?: ReactElement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };

  checkOpenMode("Dialog", "dialog", trigger !== undefined, open, onOpenChange);

  useAppearanceClassNameCheck(
    "Dialog",
    className,
    process.env.NODE_ENV !== "production"
      ? sheetHint('<Dialog title="…">', "</Dialog>")
      : /* istanbul ignore next -- production only */ "",
  );
  useDevWarnings(
    "Dialog",
    process.env.NODE_ENV !== "production"
      ? () => {
          const where = "a Dialog is centered, or a bottom sheet on phones";
          return [
            isOpen !== undefined && ["isOpen is not a prop", "<Dialog open={open} onOpenChange={setOpen}>"],
            onClose !== undefined && ["onClose is not a prop", "<Dialog open={open} onOpenChange={setOpen}>"],
            position !== undefined && [`position is not a prop; ${where}`, '<Sheet side="bottom">'],
            side !== undefined && [`side is not a prop; ${where}`, `<Sheet side="${String(side)}">`],
            snapPoints !== undefined && [
              "snapPoints is not a prop; a Dialog fits its content",
              "<Sheet snapPoints={[0.5, 1]}>",
            ],
          ];
        }
      : /* istanbul ignore next -- production only */ undefined,
  );

  // The Dialog owns the open state even with a trigger, so the dialog stays open
  // when a resize across 640px swaps the centered dialog for the sheet.
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpenNow = controlled ? open : ownOpen;
  const setOpen = controlled ? onOpenChange! : setOwnOpen;

  // The trigger is rendered once, outside both presentations, so its DOM node (and
  // its focus, and the server-rendered node after hydration) survives a switch
  // between the centered dialog and the sheet.
  const triggerRef = useRef<HTMLElement>(null);
  const triggerProps = (trigger?.props ?? {}) as TriggerProps;
  const mergedTriggerRef = useMergedRef(triggerProps.ref, triggerRef);
  const triggerNode =
    trigger !== undefined &&
    cloneElement(trigger as ReactElement<TriggerProps>, {
      ref: mergedTriggerRef,
      onClick: (event: MouseEvent<HTMLElement>) => {
        triggerProps.onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      },
      "aria-haspopup": "dialog",
      "aria-expanded": isOpenNow,
    });
  // Focus returns to the trigger on close, in either presentation.
  const finalFocus = trigger !== undefined ? { finalFocus: triggerRef } : {};

  // The server and hydration render the dialog form; the client corrects it after.
  const wide = useMediaQuery("(min-width: 640px)", true);
  const presented =
    presentation === "sheet" || (presentation === "auto" && !wide) ? (
      <SheetFrame
        title={title}
        hideTitle={hideTitle}
        closeLabel={closeLabel}
        description={description}
        side="bottom"
        className={className}
        open={isOpenNow}
        onOpenChange={setOpen}
        footer={footer}
        presentation="sheet"
        {...finalFocus}
      >
        {children}
      </SheetFrame>
    ) : (
      <DialogRoot open={isOpenNow} onOpenChange={(next) => setOpen(next)}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogViewport>
            <DialogPopupUnchecked className={className} size={size} {...finalFocus}>
              {/* Always rendered: with a hidden title it still keeps the body clear of the close button. */}
              <div data-ouro-dialog-header="">
                <DialogTitle visuallyHidden={hideTitle}>{title}</DialogTitle>
                {description !== undefined && <DialogDescription>{description}</DialogDescription>}
              </div>
              <DialogContent>{children}</DialogContent>
              {footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
              <DialogClose data-ouro-dialog-close="" aria-label={closeLabel}>
                <TouchTarget />
                <CloseIcon />
              </DialogClose>
            </DialogPopupUnchecked>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>
    );

  return (
    <>
      {triggerNode}
      {presented}
    </>
  );
}
