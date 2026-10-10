/**
 * Ouro UI: React components with handcrafted interactions, designed for coding
 * agents to use correctly without a skill.
 *
 * Import the styles once: `import "@ouro.bot/ui/styles.css"`.
 *
 * Component catalog, grouped by job:
 *
 * Actions
 * - `Button`: a button, or a link styled as one (`href`). `tone`, `variant`, `size`, `loading`.
 *
 * Overlays
 * - `Dialog`: a centered dialog that becomes a bottom sheet on phones. `title`, `trigger` or `open`, `footer`, `size`, `presentation`.
 * - `ConfirmDialog`: confirm an action, Cancel focused first. `title`, `confirmLabel`, `onConfirm`, `tone`.
 * - `Sheet`: a panel that slides in from an edge and is dragged back to dismiss. `title`, `trigger` or `open`, `side`, `snapPoints`.
 *
 * Text
 * - `Heading`: a section title, `<h1>`–`<h6>` from `level`; `size` changes only the look.
 * - `Text`: body text with `size`, `tone` (`muted`, `danger`…), `truncate` and `lines`.
 *
 * App setup
 * - `OuroProvider`: optional; supplies your router's link for internal `href`s.
 */
export { version } from "./internal/version";
export {
  OuroProvider,
  useOuro,
  type OuroContextValue,
  type OuroLinkComponent,
  type OuroProviderProps,
} from "./provider/OuroProvider";
export {
  Button,
  type ButtonBaseProps,
  type ButtonButtonProps,
  type ButtonIcon,
  type ButtonLinkProps,
  type ButtonProps,
} from "./components/Button/Button";
export {
  ConfirmDialog,
  type ConfirmDialogBaseProps,
  type ConfirmDialogControlledProps,
  type ConfirmDialogProps,
  type ConfirmDialogWithTriggerProps,
} from "./components/Dialog/ConfirmDialog";
export {
  Dialog,
  type DialogBaseProps,
  type DialogControlledProps,
  type DialogPresentation,
  type DialogProps,
  type DialogSize,
  type DialogWithTriggerProps,
} from "./components/Dialog/Dialog";
export {
  Sheet,
  type SheetBaseProps,
  type SheetControlledProps,
  type SheetProps,
  type SheetSide,
  type SheetSnapPoint,
  type SheetWithTriggerProps,
} from "./components/Sheet/Sheet";
export { Heading, type HeadingProps, type HeadingSize } from "./components/Text/Heading";
export { Text, type TextAlign, type TextProps } from "./components/Text/Text";
export type { ToneName } from "./theme/tokens";
