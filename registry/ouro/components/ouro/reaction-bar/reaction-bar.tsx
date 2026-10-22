"use client";

import type { HTMLAttributes, JSX, MouseEvent, ReactNode, Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** A reaction someone can add: its key, its spoken name and what it shows. */
export interface ReactionOption {
  /** Identifies the reaction ("like"); `onReact` receives it. */
  key: string;
  /** What screen readers hear for it ("Like"). */
  label: string;
  /** What it shows: an emoji ("👍") or an icon element. Screen readers hear `label` instead. */
  emoji: ReactNode;
}

/** A reaction on a message, with how many people chose it. */
export interface Reaction extends ReactionOption {
  /** How many people reacted this way. */
  count: number;
  /** The person using the app is one of them: the reaction is pressed and tinted. */
  mine?: boolean | undefined;
}

/** The props ReactionBar adds to the `<div>` attributes it passes through. */
export interface ReactionBarOwnProps {
  /** The message's reactions, in the order they show. */
  reactions: readonly Reaction[];
  /**
   * Reactions offered for a single press, after the counts. One that is already in
   * `reactions` shows there instead. Shown only with `onReact`.
   */
  quick?: readonly ReactionOption[] | undefined;
  /**
   * Called with a reaction's key when it is pressed, to add the person's reaction or take
   * it back. The click event comes second, so the app can check `event.isTrusted` before
   * it acts. Without it the reactions are read-only.
   */
  onReact?: ((key: string, event: MouseEvent<HTMLElement>) => void) | undefined;
  /** Keeps the counts but turns off reacting, for example while the app is offline. */
  disabled?: boolean | undefined;
  /** What screen readers hear for the group, for other languages. @default "Reactions" */
  label?: string | undefined;
  /** What screen readers hear after a read-only reaction that is the person's own. @default "including you" */
  mineLabel?: string | undefined;
  /** Layout only: margins, placement (`mt-1`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. A pressed reaction calls `onReact`: `<ReactionBar onReact={(key) => react(key)}>`. */
  onReactionClick?: { 'Use onReact={(key) => react(key)}': never };
  /** Not a prop. The reactions are `reactions`: `<ReactionBar reactions={message.reactions}>`. */
  items?: { 'Use reactions={message.reactions}': never };
}

/** Props for {@link ReactionBar}: its own props and the `<div>` attributes it passes through. */
export type ReactionBarProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ReactionBarOwnProps> & ReactionBarOwnProps;

/**
 * A message's reactions: each one's emoji and how many chose it, with the person's own
 * pressed and tinted, and quick reactions to add with a single press. Pressing a reaction
 * calls `onReact` with its key, so the app adds the person's reaction or takes it back.
 * Each reaction is a toggle button (`aria-pressed`) that screen readers hear by name and
 * count ("Like, 3"). Without `onReact` the reactions are read-only, and with nothing to show
 * it renders nothing.
 *
 * Place it in `Message`'s `attachments`. Use `ToggleGroup` instead for a choice between
 * options, and `Badge` for a single count.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/reaction-bar
 *
 * @example
 * <ReactionBar reactions={message.reactions} quick={quickReactions} onReact={(key) => toggleReaction(message.id, key)} />
 * @claim "reactions: each one's emoji and" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > shows each reaction as a toggle button named by its label and count)
 * @claim "reactions: each one's emoji and" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > tints the person's own reaction)
 * @claim "reactions: each one's emoji and" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > offers quick reactions that are not there yet, and moves one to the counts once chosen)
 * @claim "Each reaction is a toggle button" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > shows each reaction as a toggle button named by its label and count)
 * @claim "Without `onReact` the reactions are" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > is read-only without onReact, and says which reaction is yours)
 * @claim "Without `onReact` the reactions are" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > renders nothing with nothing to show)
 */
export function ReactionBar(props: ReactionBarProps): JSX.Element | null {
  const {
    reactions,
    quick,
    onReact,
    disabled = false,
    label = "Reactions",
    mineLabel = "including you",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onReactionClick,
    items,
    ...rest
  } = props;
  const shown = reactions ?? [];
  useAppearanceClassNameCheck(
    "ReactionBar",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ReactionBar takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ReactionBar",
    process.env.NODE_ENV !== "production"
      ? () => [
          reactions === undefined && ["reactions is missing", "<ReactionBar reactions={message.reactions} onReact={react}>"],
          onReactionClick !== undefined && ["onReactionClick is not a prop", "<ReactionBar onReact={(key) => react(key)}>"],
          items !== undefined && ["items is not a prop", "<ReactionBar reactions={message.reactions}>"],
          onReact === undefined && quick !== undefined && ["quick reactions need onReact, so they are hidden", "<ReactionBar quick={quick} onReact={react}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const offered = onReact ? (quick ?? []).filter((option) => !shown.some((reaction) => reaction.key === option.key)) : [];
  if (shown.length === 0 && offered.length === 0) return null;
  return (
    <div {...rest} role="group" aria-label={label} data-ouro="reaction-bar" className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {/* One keyed list, counts then quick reactions: a quick reaction once chosen, or the last one
          taken back, keeps its button, so keyboard focus stays on it. */}
      {[...shown, ...offered].map((entry) => {
        const reaction: Partial<Reaction> & ReactionOption = entry;
        const counted = reaction.count !== undefined;
        const look = reaction.mine ? ({ tone: "primary", variant: "soft" } as const) : counted ? ({ tone: "secondary", variant: "outline" } as const) : ({ tone: "secondary", variant: "soft" } as const);
        const face = (
          <>
            <span aria-hidden="true">{reaction.emoji}</span>
            {counted ? (
              <>
                <span className="sr-only">{reaction.label}, </span>
                {reaction.count}
              </>
            ) : (
              <span className="sr-only">{reaction.label}</span>
            )}
          </>
        );
        return onReact ? (
          <Badge
            key={reaction.key}
            data-ouro-control="reaction-bar"
            data-ouro-part={counted ? "reaction" : "quick"}
            {...look}
            aria-pressed={reaction.mine === true}
            disabled={disabled}
            onClick={(event) => onReact(reaction.key, event)}
          >
            {face}
          </Badge>
        ) : (
          <Badge key={reaction.key} {...look}>
            {face}
            {reaction.mine && <span className="sr-only">, {mineLabel}</span>}
          </Badge>
        );
      })}
    </div>
  );
}
