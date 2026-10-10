import { Drawer } from "@base-ui/react/drawer";
import { createContext, useContext, type JSX } from "react";
import { devThrow } from "../../internal/dev.ts";

/** The edge a sheet slides in from, and is dragged back to, to dismiss. */
export type SheetSide = "bottom" | "top" | "left" | "right";

/**
 * A snap point for a bottom or top sheet: a fraction of the viewport height
 * (`0.5`), or a height in `px` or `rem` (`"320px"`, `"20rem"`).
 */
export type SheetSnapPoint = number | `${number}px` | `${number}rem`;

interface SheetContextValue {
  side: SheetSide;
  snap: boolean;
}

const SheetContext = createContext<SheetContextValue | null>(null);

const swipeDirections = { bottom: "down", top: "up", left: "left", right: "right" } as const;

/** The JSX that puts a part in its place, for the dev message when it is not. */
function shape(inner: string): string {
  return `<SheetRoot><SheetTrigger render={<Button>Open</Button>} /><SheetPortal><SheetBackdrop /><SheetViewport><SheetPopup>${inner}</SheetPopup></SheetViewport></SheetPortal></SheetRoot>`;
}

/** Reads the sheet context, or throws in development with the JSX the part belongs in. */
function useSheetPart(part: string, inner: string): SheetContextValue {
  const context = useContext(SheetContext);
  if (!context) {
    devThrow(
      part,
      "must be rendered inside <SheetRoot>",
      process.env.NODE_ENV !== "production" ? shape(inner) : /* istanbul ignore next -- production only */ "",
    );
  }
  return context;
}

const join = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" ");

/** Props for {@link SheetRoot}: Base UI `Drawer.Root` props with `side` in place of `swipeDirection`. */
export type SheetRootProps = Omit<Drawer.Root.Props, "swipeDirection" | "snapPoints"> & {
  /** The edge the sheet slides in from. @default "bottom" */
  side?: SheetSide | undefined;
  /** Snap points for a bottom or top sheet. Without them the sheet fits its content. */
  snapPoints?: SheetSnapPoint[] | undefined;
};

/**
 * Part: the state owner of a sheet built from parts. Use the `Sheet` component
 * from `@ouro.bot/ui` instead unless its props cannot express your layout.
 *
 * @example
 * <SheetRoot side="bottom">
 *   <SheetTrigger render={<Button>Open</Button>} />
 *   <SheetPortal>
 *     <SheetBackdrop />
 *     <SheetViewport>
 *       <SheetPopup>
 *         <SheetHandle />
 *         <SheetTitle>Filters</SheetTitle>
 *         <SheetContent>…</SheetContent>
 *       </SheetPopup>
 *     </SheetViewport>
 *   </SheetPortal>
 * </SheetRoot>
 */
export function SheetRoot({ side = "bottom", snapPoints, ...props }: SheetRootProps): JSX.Element {
  const snap = Boolean(snapPoints && snapPoints.length > 0);
  return (
    <SheetContext.Provider value={{ side, snap }}>
      <Drawer.Root {...props} {...(snapPoints ? { snapPoints } : {})} swipeDirection={swipeDirections[side]} />
    </SheetContext.Provider>
  );
}

/** Part: the button that opens the sheet. Pass your button as `render={<Button>Open</Button>}`. */
export function SheetTrigger(props: Drawer.Trigger.Props): JSX.Element {
  useSheetPart("SheetTrigger", "…");
  return <Drawer.Trigger {...props} />;
}

/**
 * Part: moves the sheet to the end of `<body>` and makes it aware of the
 * software keyboard (`Drawer.VirtualKeyboardProvider`), so focused inputs stay visible.
 */
export function SheetPortal(props: Omit<Drawer.Portal.Props, "className">): JSX.Element {
  useSheetPart("SheetPortal", "…");
  return (
    <Drawer.VirtualKeyboardProvider>
      <Drawer.Portal {...props} data-ouro="sheet-portal" />
    </Drawer.VirtualKeyboardProvider>
  );
}

/** Part: the dimming layer. It lightens as the sheet is dragged away. */
export function SheetBackdrop(props: Omit<Drawer.Backdrop.Props, "className">): JSX.Element {
  useSheetPart("SheetBackdrop", "…");
  return <Drawer.Backdrop {...props} data-ouro="sheet-backdrop" />;
}

/** Part: the full-screen layer that positions the popup against its edge. */
export function SheetViewport(props: Omit<Drawer.Viewport.Props, "className">): JSX.Element {
  const { side } = useSheetPart("SheetViewport", "…");
  return <Drawer.Viewport {...props} data-ouro="sheet-viewport" data-side={side} />;
}

/** Props for {@link SheetPopup}. `className` is for layout only (width, margins). */
export type SheetPopupProps = Omit<Drawer.Popup.Props, "className"> & { className?: string | undefined };

/** Part: the sheet panel. It stretches past its edge when pulled and springs back on release. */
export function SheetPopup({ className, ...props }: SheetPopupProps): JSX.Element {
  const { side, snap } = useSheetPart("SheetPopup", "…");
  return (
    <Drawer.Popup
      {...props}
      className={className}
      data-ouro="sheet"
      data-side={side}
      data-snap-points={snap ? "" : undefined}
    />
  );
}

/** Part: the grab handle at the free edge of a bottom or top sheet. Decorative; renders nothing on side sheets. */
export function SheetHandle(): JSX.Element | null {
  const { side } = useSheetPart("SheetHandle", "<SheetHandle />…");
  if (side === "left" || side === "right") return null;
  return (
    <div
      aria-hidden="true"
      data-ouro-sheet-handle=""
      className="ou:flex ou:shrink-0 ou:justify-center ou:py-2 ou:touch-none"
    >
      <div className="ou:h-1.25 ou:w-9 ou:rounded-pill ou:bg-line" />
    </div>
  );
}

/** Props for {@link SheetTitle}. */
export type SheetTitleProps = Omit<Drawer.Title.Props, "className"> & {
  /** Hides the title visually; it still names the dialog for screen readers. */
  visuallyHidden?: boolean | undefined;
};

/** Part: the sheet's title, which names the dialog. Every sheet needs one. */
export function SheetTitle({ visuallyHidden, ...props }: SheetTitleProps): JSX.Element {
  useSheetPart("SheetTitle", "<SheetTitle>…</SheetTitle>…");
  return (
    <Drawer.Title
      {...props}
      data-ouro-sheet-title=""
      className={
        visuallyHidden
          ? "ou:sr-only"
          : "ou:m-0 ou:font-display ou:text-lg ou:leading-6 ou:font-semibold ou:text-ink ou:text-balance"
      }
    />
  );
}

/** Part: a line under the title that describes the dialog. */
export function SheetDescription(props: Omit<Drawer.Description.Props, "className">): JSX.Element {
  useSheetPart("SheetDescription", "<SheetDescription>…</SheetDescription>…");
  return (
    <Drawer.Description
      {...props}
      data-ouro-sheet-description=""
      className="ou:m-0 ou:font-body ou:text-sm ou:leading-5 ou:text-ink-muted"
    />
  );
}

/** Props for {@link SheetContent}. `className` is for layout only. */
export type SheetContentProps = Omit<Drawer.Content.Props, "className"> & { className?: string | undefined };

/**
 * Part: the scrollable body. A mouse can select text in it without dragging the
 * sheet; touch still drags from anywhere once the body is scrolled to the top.
 */
export function SheetContent({ className, ...props }: SheetContentProps): JSX.Element {
  useSheetPart("SheetContent", "<SheetContent>…</SheetContent>");
  return (
    <Drawer.Content
      {...props}
      data-ouro-sheet-content=""
      className={join(
        "ou:box-border ou:min-h-0 ou:flex-1 ou:overflow-y-auto ou:overscroll-contain ou:touch-auto ou:px-5 ou:pt-2 ou:pb-5",
        className,
      )}
    />
  );
}

/** Part: closes the sheet. Pass your button as `render={<Button>Done</Button>}`. */
export function SheetClose(props: Drawer.Close.Props): JSX.Element {
  useSheetPart("SheetClose", "<SheetContent><SheetClose>…</SheetClose></SheetContent>");
  return <Drawer.Close {...props} />;
}
