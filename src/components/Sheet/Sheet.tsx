import type { JSX, ReactElement, ReactNode } from "react";
import { useAppearanceClassNameCheck } from "../../internal/classNameCheck.ts";
import { devThrow } from "../../internal/dev.ts";
import { useDevWarnings } from "../../internal/useDevWarnings.ts";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHandle,
  SheetPopupUnchecked,
  SheetPortal,
  SheetRoot,
  SheetTitle,
  SheetTrigger,
  SheetViewport,
  sheetHint,
  type SheetSide,
  type SheetSnapPoint,
} from "./parts.tsx";

export type { SheetSide, SheetSnapPoint } from "./parts.tsx";

/** Props shared by both ways of opening a Sheet. */
export interface SheetBaseProps {
  /** Names the sheet for screen readers and shows at its top. Always required; hide it with `hideTitle`. */
  title: string;
  /** Hides the title visually. It still names the dialog for screen readers. */
  hideTitle?: boolean | undefined;
  /**
   * The label of the sheet's close button. The button is the last control in the
   * sheet, hidden until it has keyboard focus, so screen-reader users on phones
   * (who have no Escape key) can always close the sheet. @default "Close"
   */
  closeLabel?: string | undefined;
  /** A short line under the title, read out when the sheet opens. */
  description?: ReactNode;
  /** The edge the sheet slides in from and is dragged back to. @default "bottom" */
  side?: SheetSide | undefined;
  /**
   * Heights a bottom or top sheet rests at, smallest first: fractions of the
   * viewport (`0.5`), `px` or `rem`. `snapPoints={[0.5, 1]}` opens at half
   * height and drags up to full. Without snap points the sheet fits its content.
   */
  snapPoints?: SheetSnapPoint[] | undefined;
  /** The body. It scrolls when it is taller than the sheet. */
  children: ReactNode;
  /**
   * Layout only, applied to the sheet panel: width and margins (`max-w-lg`,
   * `mx-auto`). Your classes win over Ouro UI's. Appearance classes warn in development.
   */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<Sheet open={open} onOpenChange={setOpen}>`. */
  isOpen?: never;
  /** Not a prop. `onOpenChange(false)` fires on close: `<Sheet open={open} onOpenChange={setOpen}>`. */
  onClose?: never;
  /** Not a prop. Ouro UI uses `side`: `<Sheet side="bottom">`. */
  position?: never;
  /** Not a prop. A sheet fits its content; to set heights use `snapPoints={[0.5, 1]}`. */
  size?: never;
}

/** An uncontrolled Sheet: `trigger` opens it. */
export type SheetWithTriggerProps = SheetBaseProps & {
  /** The element that opens the sheet, usually a Button: `trigger={<Button>Save</Button>}`. */
  trigger: ReactElement;
  /** Not with `trigger`. Remove `trigger` to control the sheet with `open` and `onOpenChange`. */
  open?: never;
  /** Not with `trigger`. Remove `trigger` to control the sheet with `open` and `onOpenChange`. */
  onOpenChange?: never;
};

/** A controlled Sheet: you own `open` and update it in `onOpenChange`. */
export type SheetControlledProps = SheetBaseProps & {
  /** Whether the sheet is open. */
  open: boolean;
  /** Called with `false` when the user dismisses the sheet (swipe, Escape, outside press). */
  onOpenChange: (open: boolean) => void;
  /** Not with `open`. Remove `open` and `onOpenChange` to let a trigger open the sheet. */
  trigger?: never;
};

/** Props for {@link Sheet}: either `trigger`, or `open` with `onOpenChange`. */
export type SheetProps = SheetWithTriggerProps | SheetControlledProps;

/** The exact fix for a Sheet that has no single way to open. */
const OPEN_FIX = "Pass trigger={<Button>…</Button>} for an uncontrolled sheet, or open and onOpenChange to control it";

/** Throws for a Sheet without exactly one way to open, with the fix in development. */
function throwOpenMode(problem: string): never {
  return devThrow(
    "Sheet",
    problem,
    process.env.NODE_ENV !== "production" ? OPEN_FIX : /* istanbul ignore next -- production only */ "",
  );
}

/**
 * A panel that slides in from an edge and is dragged back to dismiss: the
 * mobile form of a dialog. It stretches when pulled past its edge, its backdrop
 * lightens as it is dragged away, and it springs back on release. It handles
 * focus, Escape, scroll locking, safe areas and the software keyboard.
 *
 * Use `trigger` for a sheet a button opens, or `open` with `onOpenChange` to
 * control it. Use `Dialog` instead when the content should be a centered
 * dialog on larger screens; it renders this sheet on phones.
 *
 * @example
 * <Sheet title="Save to cookbook" trigger={<Button>Save</Button>}>
 *   <CookbookList />
 * </Sheet>
 * <Sheet title="Filters" open={open} onOpenChange={setOpen} snapPoints={[0.5, 1]}>
 *   <FilterForm />
 * </Sheet>
 */
export function Sheet(props: SheetProps): JSX.Element {
  const {
    title,
    hideTitle,
    closeLabel = "Close",
    description,
    side = "bottom",
    snapPoints,
    children,
    className,
    trigger,
    open,
    onOpenChange,
    // Guard props: typed `never`, dropped here so they never reach the DOM.
    isOpen,
    onClose,
    position,
    size,
  } = props as SheetBaseProps & {
    trigger?: ReactElement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };

  const controlled = open !== undefined;
  if (trigger !== undefined && controlled) throwOpenMode("takes trigger or open, not both");
  if (trigger === undefined && !controlled) throwOpenMode("needs trigger or open with onOpenChange");
  if (controlled && typeof onOpenChange !== "function") throwOpenMode("open needs onOpenChange");

  useAppearanceClassNameCheck(
    "Sheet",
    className,
    process.env.NODE_ENV !== "production"
      ? sheetHint('<Sheet title="…">', "</Sheet>")
      : /* istanbul ignore next -- production only */ "",
  );
  useDevWarnings(
    "Sheet",
    process.env.NODE_ENV !== "production"
      ? () => [
          isOpen !== undefined && ["isOpen is not a prop", "<Sheet open={open} onOpenChange={setOpen}>"],
          onClose !== undefined && ["onClose is not a prop", "<Sheet open={open} onOpenChange={setOpen}>"],
          position !== undefined && ["position is not a prop", '<Sheet side="bottom">'],
          size !== undefined && ["size is not a prop; a sheet fits its content", "<Sheet snapPoints={[0.5, 1]}>"],
        ]
      : /* istanbul ignore next -- production only */ undefined,
  );

  const showHeader = !hideTitle || description !== undefined;
  const titleNode = <SheetTitle visuallyHidden={hideTitle}>{title}</SheetTitle>;

  return (
    <SheetRoot
      side={side}
      snapPoints={snapPoints}
      {...(controlled ? { open, onOpenChange: (next: boolean) => onOpenChange!(next) } : {})}
    >
      {trigger !== undefined && <SheetTrigger render={trigger} />}
      <SheetPortal>
        <SheetBackdrop />
        <SheetViewport>
          <SheetPopupUnchecked className={className}>
            {side === "bottom" && <SheetHandle />}
            {showHeader ? (
              <div data-ouro-sheet-header="" className="ou:grid ou:shrink-0 ou:gap-1 ou:px-5 ou:pt-3 ou:pb-2">
                {titleNode}
                {description !== undefined && <SheetDescription>{description}</SheetDescription>}
              </div>
            ) : (
              titleNode
            )}
            <SheetContent>{children}</SheetContent>
            {side === "top" && <SheetHandle />}
            <SheetClose data-ouro-sheet-close="">{closeLabel}</SheetClose>
          </SheetPopupUnchecked>
        </SheetViewport>
      </SheetPortal>
    </SheetRoot>
  );
}
