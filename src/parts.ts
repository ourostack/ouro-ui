/**
 * Building-block parts for the rare case where a component's props cannot
 * express what you need. Prefer the props-first components from
 * `@ouro.bot/ui`.
 *
 * Each part checks that it sits inside its root and, in development, throws a
 * message with the JSX it belongs in.
 */
export {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
  type DialogContentProps,
  type DialogPopupProps,
  type DialogSize,
  type DialogTitleProps,
} from "@/registry/ouro/ui/dialog/dialog-parts";
export {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHandle,
  SheetPopup,
  SheetPortal,
  SheetRoot,
  SheetTitle,
  SheetTrigger,
  SheetViewport,
  type SheetContentProps,
  type SheetPopupProps,
  type SheetRootProps,
  type SheetSide,
  type SheetSnapPoint,
  type SheetTitleProps,
} from "@/registry/ouro/ui/sheet/sheet-parts";
