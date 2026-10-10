import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { createContext, useContext, type JSX, type Ref } from "react";
import { useAppearanceClassNameCheck } from "../../internal/classNameCheck.ts";
import { devThrow } from "../../internal/dev.ts";
import { useBackdropAnchor } from "../../internal/useBackdropAnchor.ts";
import { sheetHint } from "../Sheet/parts.tsx";

/** A centered dialog's maximum width: `sm` 24rem, `md` 32rem, `lg` 40rem. */
export type DialogSize = "sm" | "md" | "lg";

const DialogContext = createContext(false);

/** The JSX that puts a part in its place, for the dev message when it is not. */
function shape(inner: string): string {
  return `<DialogRoot><DialogTrigger render={<Button>Open</Button>} /><DialogPortal><DialogBackdrop /><DialogViewport><DialogPopup>${inner}</DialogPopup></DialogViewport></DialogPortal></DialogRoot>`;
}

/** Throws in development, with the JSX the part belongs in, unless it sits inside a dialog root. */
function useDialogPart(part: string, inner: string): void {
  if (!useContext(DialogContext)) {
    devThrow(
      part,
      "must be rendered inside <DialogRoot>",
      process.env.NODE_ENV !== "production" ? shape(inner) : /* istanbul ignore next -- production only */ "",
    );
  }
}

/**
 * Part: the state owner of a centered dialog built from parts. Use the `Dialog`
 * component from `@ouro.bot/ui` instead unless its props cannot express your
 * layout; `Dialog` also becomes a bottom sheet on phones, which parts do not.
 *
 * @example
 * <DialogRoot>
 *   <DialogTrigger render={<Button>Edit</Button>} />
 *   <DialogPortal>
 *     <DialogBackdrop />
 *     <DialogViewport>
 *       <DialogPopup size="sm">
 *         <DialogTitle>Edit recipe</DialogTitle>
 *         <DialogContent>…</DialogContent>
 *         <DialogFooter>
 *           <DialogClose render={<Button>Done</Button>} />
 *         </DialogFooter>
 *       </DialogPopup>
 *     </DialogViewport>
 *   </DialogPortal>
 * </DialogRoot>
 */
export function DialogRoot(props: BaseDialog.Root.Props): JSX.Element {
  return (
    <DialogContext.Provider value>
      <BaseDialog.Root {...props} />
    </DialogContext.Provider>
  );
}

/**
 * The root for `ConfirmDialog`: Base UI's alert dialog, which an outside press
 * cannot dismiss. It shares every other part with `DialogRoot`.
 *
 * Internal; not exported from the package.
 */
export function AlertDialogRoot(props: AlertDialog.Root.Props): JSX.Element {
  return (
    <DialogContext.Provider value>
      <AlertDialog.Root {...props} />
    </DialogContext.Provider>
  );
}

/** Part: the button that opens the dialog. Pass your button as `render={<Button>Open</Button>}`. */
export function DialogTrigger(props: BaseDialog.Trigger.Props): JSX.Element {
  useDialogPart("DialogTrigger", "…");
  return <BaseDialog.Trigger {...props} />;
}

/** Part: moves the dialog to the end of `<body>`, in its own stacking context. */
export function DialogPortal(props: Omit<BaseDialog.Portal.Props, "className">): JSX.Element {
  useDialogPart("DialogPortal", "…");
  return <BaseDialog.Portal {...props} data-ouro="dialog-portal" />;
}

/**
 * Part: the dimming layer behind the dialog. On iOS it stays anchored to the top
 * of the screen on a scrolled page. A `ref` reaches the backdrop element.
 */
export function DialogBackdrop({
  ref,
  ...props
}: Omit<BaseDialog.Backdrop.Props, "className"> & { ref?: Ref<HTMLDivElement> | undefined }): JSX.Element {
  useDialogPart("DialogBackdrop", "…");
  const anchorRef = useBackdropAnchor(ref);
  return <BaseDialog.Backdrop {...props} ref={anchorRef} data-ouro="dialog-backdrop" />;
}

/** Part: the full-screen layer that centers the popup and keeps it clear of the screen edges. */
export function DialogViewport(props: Omit<BaseDialog.Viewport.Props, "className">): JSX.Element {
  useDialogPart("DialogViewport", "…");
  return <BaseDialog.Viewport {...props} data-ouro="dialog-viewport" />;
}

/** Props for {@link DialogPopup}. `className` is for layout only (margins, width). */
export type DialogPopupProps = Omit<BaseDialog.Popup.Props, "className"> & {
  className?: string | undefined;
  /** Maximum width: `sm` 24rem, `md` 32rem, `lg` 40rem. @default "md" */
  size?: DialogSize | undefined;
};

/**
 * Part: the dialog panel. It scales up from 0.96 and fades in with the theme
 * spring, and scales and fades out; reduced motion keeps only the fade.
 */
export function DialogPopup(props: DialogPopupProps): JSX.Element {
  useAppearanceClassNameCheck(
    "DialogPopup",
    props.className,
    process.env.NODE_ENV !== "production"
      ? sheetHint("<DialogPopup>", "</DialogPopup>")
      : /* istanbul ignore next -- production only */ "",
  );
  return <DialogPopupUnchecked {...props} />;
}

/** The popup without its own className check, for `Dialog` and `ConfirmDialog`, which check their own. */
export function DialogPopupUnchecked({ className, size = "md", ...props }: DialogPopupProps): JSX.Element {
  useDialogPart("DialogPopup", "…");
  return (
    <BaseDialog.Popup
      {...props}
      className={className}
      data-ouro="dialog"
      data-ouro-presentation="dialog"
      data-size={size}
    />
  );
}

/** Props for {@link DialogTitle}. */
export type DialogTitleProps = Omit<BaseDialog.Title.Props, "className"> & {
  /** Hides the title visually; it still names the dialog for screen readers. */
  visuallyHidden?: boolean | undefined;
};

/** Part: the dialog's title, which names it. Every dialog needs one. */
export function DialogTitle({ visuallyHidden, ...props }: DialogTitleProps): JSX.Element {
  useDialogPart("DialogTitle", "<DialogTitle>…</DialogTitle>…");
  return (
    <BaseDialog.Title
      {...props}
      data-ouro-dialog-title=""
      className={
        visuallyHidden
          ? "ou:sr-only"
          : "ou:m-0 ou:font-display ou:text-lg ou:leading-6 ou:font-semibold ou:text-ink ou:text-balance"
      }
    />
  );
}

/** Part: a line under the title that describes the dialog. */
export function DialogDescription(props: Omit<BaseDialog.Description.Props, "className">): JSX.Element {
  useDialogPart("DialogDescription", "<DialogTitle>…</DialogTitle><DialogDescription>…</DialogDescription>…");
  return (
    <BaseDialog.Description
      {...props}
      data-ouro-dialog-description=""
      className="ou:m-0 ou:font-body ou:text-sm ou:leading-5 ou:text-ink-muted ou:text-pretty"
    />
  );
}

/** Props for {@link DialogContent}. `className` is for layout only. */
export type DialogContentProps = Omit<JSX.IntrinsicElements["div"], "className"> & { className?: string | undefined };

/** Part: the dialog's body. It scrolls when the dialog is taller than the screen. */
export function DialogContent({ className, ...props }: DialogContentProps): JSX.Element {
  useDialogPart("DialogContent", "<DialogTitle>…</DialogTitle><DialogContent>…</DialogContent>");
  useAppearanceClassNameCheck(
    "DialogContent",
    className,
    process.env.NODE_ENV !== "production"
      ? sheetHint("<DialogContent>", "</DialogContent>")
      : /* istanbul ignore next -- production only */ "",
  );
  return <div {...props} data-ouro-dialog-content="" className={className} />;
}

/**
 * Part: the actions row. A row at the end on wider screens; on phones the
 * actions stack full width in reverse, so put the primary action last.
 */
export function DialogFooter(props: Omit<JSX.IntrinsicElements["div"], "className">): JSX.Element {
  useDialogPart(
    "DialogFooter",
    "<DialogTitle>…</DialogTitle><DialogContent>…</DialogContent><DialogFooter>…</DialogFooter>",
  );
  return <div {...props} data-ouro-footer="" />;
}

/** Part: closes the dialog. Pass your button as `render={<Button>Done</Button>}`. */
export function DialogClose(props: BaseDialog.Close.Props): JSX.Element {
  useDialogPart("DialogClose", "<DialogTitle>…</DialogTitle><DialogFooter><DialogClose>…</DialogClose></DialogFooter>");
  return <BaseDialog.Close {...props} />;
}
