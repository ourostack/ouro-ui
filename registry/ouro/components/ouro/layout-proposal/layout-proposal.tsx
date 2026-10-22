"use client";

import { useEffect, useId, useRef, type HTMLAttributes, type JSX, type MouseEvent, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** A decision about a proposal: its `id` as it was when the person began the press, and the click. */
export type LayoutProposalHandler = (id: string, event: MouseEvent<HTMLElement>) => void;

/** The props LayoutProposal adds to the `<section>` attributes it passes through. */
export interface LayoutProposalOwnProps {
  /**
   * Identifies the proposal. The handlers receive the `id` that was on screen when the person
   * began the press, so the app can refuse a decision about a proposal it has since replaced.
   */
  id: string;
  /** What the change is, in a few words ("Customers first"). */
  title: string;
  /** Who proposed it, usually the agent's name ("Ouro"). */
  by: string;
  /** When, already formatted ("2 min ago", `<RelativeTime>`). */
  time?: ReactNode;
  /** Why, in a sentence from whoever proposed it. Hidden while previewing. */
  reason?: ReactNode;
  /** A sketch or summary of the change, such as the proposed columns. */
  children?: ReactNode;
  /** The proposal is on screen in place of the current arrangement. @default false */
  previewing?: boolean | undefined;
  /** Adds Preview, which shows the proposal in place without applying it. */
  onPreview?: LayoutProposalHandler | undefined;
  /** Ends the preview and returns to the current arrangement. Needed with `onPreview`. */
  onEndPreview?: LayoutProposalHandler | undefined;
  /**
   * Called when the person applies the proposal. Applying is a person's decision: check
   * `event.isTrusted`, and that `id` is still the proposal you hold, before you apply it.
   */
  onApply: LayoutProposalHandler;
  /** Called when the person discards the proposal, with the same checks as `onApply`. */
  onDiscard: LayoutProposalHandler;
  /** The badge, for other languages. @default "Proposed change" */
  proposedLabel?: string | undefined;
  /** The badge while previewing, for other languages. @default "Previewing" */
  previewingLabel?: string | undefined;
  /** The line shown, and spoken, while previewing. @default "This is a preview. Nothing changes until you apply it." */
  previewNote?: string | undefined;
  /** The Preview button's word, for other languages. @default "Preview" */
  previewLabel?: string | undefined;
  /** The button that ends the preview, for other languages. @default "Back to current" */
  endPreviewLabel?: string | undefined;
  /** The Apply button's word, for other languages. @default "Apply" */
  applyLabel?: string | undefined;
  /** The Discard button's word, for other languages. @default "Discard" */
  discardLabel?: string | undefined;
  /** Layout only: margins, width, grid placement (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Applying calls `onApply`: `<LayoutProposal onApply={(id, event) => apply(id, event)}>`. */
  onAccept?: { 'Use onApply={(id, event) => apply(id, event)}': never };
  /** Not a prop. Discarding calls `onDiscard`: `<LayoutProposal onDiscard={(id) => discard(id)}>`. */
  onReject?: { 'Use onDiscard={(id) => discard(id)}': never };
  /** Not a prop. Discarding calls `onDiscard`: `<LayoutProposal onDiscard={(id) => discard(id)}>`. */
  onDismiss?: { 'Use onDiscard={(id) => discard(id)}': never };
  /** Not a prop. Ending the preview calls `onEndPreview`: `<LayoutProposal onEndPreview={(id) => endPreview(id)}>`. */
  onBack?: { 'Use onEndPreview={(id) => endPreview(id)}': never };
  /** Not a prop. The reason is `reason`: `<LayoutProposal reason="You open customer chats first.">`. */
  note?: { 'Use reason="You open customer chats first."': never };
}

/** Props for {@link LayoutProposal}: its own props and the `<section>` attributes it passes through. */
export type LayoutProposalProps = Omit<HTMLAttributes<HTMLElement>, keyof LayoutProposalOwnProps> & LayoutProposalOwnProps;

const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/**
 * A change an agent proposes to the surface the person is using (a layout, a set of columns, an
 * arrangement), which the person previews, then applies or discards. It says who proposed it,
 * when and why, with a sketch of the change, and Preview, Apply and Discard. Preview turns into
 * "Back to current" in place, so focus stays on the button, and screen readers hear that
 * nothing changes until the person applies it. Applying and discarding are a person's decisions:
 * the handlers receive the click event, so the app can check `event.isTrusted`, and the
 * proposal's `id` as it was when the press began, so the app can refuse a decision about a
 * proposal that was replaced under the person's pointer.
 *
 * Use `Alert` instead for a notice that asks for no decision, and `DraftReview` for changes to
 * text that are accepted one by one.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/layout-proposal
 *
 * @example
 * <LayoutProposal
 *   id={proposal.id}
 *   title="Customers first"
 *   by="Ouro"
 *   reason="You open customer chats first most mornings."
 *   previewing={previewing}
 *   onPreview={() => setPreviewing(true)}
 *   onEndPreview={() => setPreviewing(false)}
 *   onApply={(id, event) => event.isTrusted && id === proposal.id && apply(id)}
 *   onDiscard={(id, event) => event.isTrusted && id === proposal.id && discard(id)}
 * />
 * @claim "Preview turns into" registry/ouro/components/ouro/layout-proposal/layout-proposal.test.tsx verify:testExists(registry/ouro/components/ouro/layout-proposal/layout-proposal.test.tsx::LayoutProposal > turns Preview into Back to current in place, keeping focus, and speaks the preview note)
 * @claim "the handlers receive the click event" registry/ouro/components/ouro/layout-proposal/layout-proposal.test.tsx verify:testExists(registry/ouro/components/ouro/layout-proposal/layout-proposal.test.tsx::LayoutProposal > applies and discards with the proposal's id and the person's click)
 * @claim "the proposal's `id` as it was" registry/ouro/components/ouro/layout-proposal/layout-proposal.test.tsx verify:testExists(registry/ouro/components/ouro/layout-proposal/layout-proposal.test.tsx::LayoutProposal > passes the id that was on screen when the press began, so a swapped proposal can be refused)
 */
export function LayoutProposal(props: LayoutProposalProps): JSX.Element {
  const {
    id,
    title,
    by,
    time,
    reason,
    children,
    previewing = false,
    onPreview,
    onEndPreview,
    onApply,
    onDiscard,
    proposedLabel = "Proposed change",
    previewingLabel = "Previewing",
    previewNote = "This is a preview. Nothing changes until you apply it.",
    previewLabel = "Preview",
    endPreviewLabel = "Back to current",
    applyLabel = "Apply",
    discardLabel = "Discard",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onAccept,
    onReject,
    onDismiss,
    onBack,
    note,
    ...rest
  } = props;
  const labelId = useId();
  // The id on screen when a press began. A click finishes the press with it, so a proposal
  // replaced between the press and the click is reported as the one the person saw.
  const pressed = useRef<string | null>(null);
  const begin = () => {
    pressed.current = id;
    const clear = () => setTimeout(() => (pressed.current = null), 0);
    // A listener left behind would only clear a later press after that press's own click, as this one does.
    // Stryker disable next-line ObjectLiteral,BooleanLiteral,StringLiteral: the same press is cleared either way, by this event or the other.
    window.addEventListener("pointerup", clear, { once: true });
    // Stryker disable next-line ObjectLiteral,BooleanLiteral,StringLiteral: the same press is cleared either way, by this event or the other.
    window.addEventListener("keyup", clear, { once: true });
  };
  const toggle = previewing ? onEndPreview : onPreview;
  const decisions: Record<string, LayoutProposalHandler | undefined> = { toggle, apply: onApply, discard: onDiscard };
  const finish = (event: MouseEvent<HTMLElement>) => {
    const seen = pressed.current ?? id;
    pressed.current = null;
    decisions[event.currentTarget.dataset.decision!]!(seen, event);
  };

  // Speak the note when a preview starts, not when the bar first renders.
  const wasPreviewing = useRef(previewing);
  useEffect(() => {
    if (previewing && !wasPreviewing.current) announce(previewNote);
    wasPreviewing.current = previewing;
  }, [previewing, previewNote]);

  useAppearanceClassNameCheck(
    "LayoutProposal",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; LayoutProposal takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "LayoutProposal",
    process.env.NODE_ENV !== "production"
      ? () => [
          id === undefined && ["id is missing, so the app cannot tell a replaced proposal from the one the person saw", '<LayoutProposal id={proposal.id} title="Customers first" by="Ouro">'],
          onPreview !== undefined &&
            onEndPreview === undefined && ["onPreview needs onEndPreview, so the person can leave the preview", "<LayoutProposal onPreview={(id) => preview(id)} onEndPreview={(id) => endPreview(id)}>"],
          onAccept !== undefined && ["onAccept is not a prop", "<LayoutProposal onApply={(id, event) => apply(id, event)}>"],
          (onReject !== undefined || onDismiss !== undefined) && [`${onReject !== undefined ? "onReject" : "onDismiss"} is not a prop`, "<LayoutProposal onDiscard={(id) => discard(id)}>"],
          onBack !== undefined && ["onBack is not a prop", "<LayoutProposal onEndPreview={(id) => endPreview(id)}>"],
          note !== undefined && ["note is not a prop", '<LayoutProposal reason="You open customer chats first.">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <section
      {...rest}
      data-ouro="layout-proposal"
      data-proposal-id={id}
      data-previewing={previewing ? "" : undefined}
      aria-labelledby={`${labelId}-badge ${labelId}-title`}
      className={cn(
        "relative box-border flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-xl border border-solid border-border bg-card py-2 ps-4 pe-3 text-card-foreground",
        "before:absolute before:inset-y-0 before:start-0 before:w-1 before:bg-primary forced-colors:before:bg-[CanvasText]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Badge id={`${labelId}-badge`} tone="primary" variant="soft">
            {previewing ? previewingLabel : proposedLabel}
          </Badge>
          <span id={`${labelId}-title`} className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
            {title}
          </span>
          <span data-ouro-proposal-by="" className={cn("text-xs", quiet)}>
            {by}
            {time !== undefined && time !== null && <> · {time}</>}
          </span>
        </div>
        {previewing ? (
          <p data-ouro-proposal-note="" className={cn("m-0 text-sm", quiet)}>
            {previewNote}
          </p>
        ) : (
          reason !== undefined &&
          reason !== null && (
            <p data-ouro-proposal-reason="" className={cn("m-0 line-clamp-2 text-sm", quiet)}>
              {reason}
            </p>
          )
        )}
        {children !== undefined && children !== null && <div className="min-w-0">{children}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {toggle && (
          <Button size="sm" variant="outline" data-decision="toggle" onPointerDown={begin} onKeyDown={begin} onClick={finish}>
            {previewing ? endPreviewLabel : previewLabel}
          </Button>
        )}
        <Button size="sm" data-decision="apply" onPointerDown={begin} onKeyDown={begin} onClick={finish}>
          {applyLabel}
        </Button>
        <Button size="sm" variant="plain" data-decision="discard" onPointerDown={begin} onKeyDown={begin} onClick={finish}>
          {discardLabel}
        </Button>
      </div>
    </section>
  );
}
