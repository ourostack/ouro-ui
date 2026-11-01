"use client";

import { useId, type HTMLAttributes, type JSX, type MouseEvent, type ReactNode, type Ref, type SVGProps } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Emoji, type EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";
import { catalogueIndex } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";

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
  /**
   * Who reacted, shown in a tooltip on hover and keyboard focus, which screen readers hear as its
   * description: "You and Riley Example". A tooltip never opens on touch, so keep the count
   * meaningful without it. Without it, the tooltip shows the reaction's name.
   *
   * @claim "A tooltip never opens on touch" registry/ouro/components/ouro/tooltip/tooltip.test.tsx verify:testExists(registry/ouro/components/ouro/tooltip/tooltip.test.tsx::Tooltip > never opens after a touch on the trigger, even when the touch focuses it)
   * @claim "screen readers hear as its description" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > shows who reacted in a tooltip on hover and keyboard focus, read as the reaction's description, and after a read-only one)
   */
  tooltip?: string | undefined;
}

/** A reaction on a message, by the emoji it is, for a ReactionBar with a `catalogue`. */
export interface CatalogueReaction {
  /** The emoji's id in the catalogue, or a tone's id (`"thumbs-up-tone3"`); `onReact` receives it. */
  key: string;
  /** How many people reacted this way. */
  count: number;
  /** The person using the app is one of them: the reaction is pressed and tinted. */
  mine?: boolean | undefined;
  /** What screen readers hear for it. @default the emoji's name in the catalogue */
  label?: string | undefined;
  /**
   * Who reacted, shown in a tooltip on hover and keyboard focus, which screen readers hear as its
   * description: "You and Riley Example". A tooltip never opens on touch, so keep the count
   * meaningful without it. Without it, the tooltip shows the reaction's name.
   *
   * @claim "A tooltip never opens on touch" registry/ouro/components/ouro/tooltip/tooltip.test.tsx verify:testExists(registry/ouro/components/ouro/tooltip/tooltip.test.tsx::Tooltip > never opens after a touch on the trigger, even when the touch focuses it)
   * @claim "screen readers hear as its description" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > shows who reacted in a tooltip on hover and keyboard focus, read as the reaction's description, and after a read-only one)
   */
  tooltip?: string | undefined;
  /**
   * What it shows when the catalogue has no emoji with this id, such as an emoji the catalogue dropped. @default the id as a `:token:`
   *
   * @claim "What it shows when the catalogue has no emoji" registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx::ReactionBar with a catalogue > shows a reaction the catalogue lacks as the app's fallback, else as its id, and names it in development)
   */
  emoji?: ReactNode;
}

/** The props ReactionBar adds to the `<div>` attributes it passes through, whichever way its reactions come. */
export interface ReactionBarOwnProps {
  /**
   * The message's reactions, in the order they show: each with its own emoji, or, with
   * `catalogue`, by emoji id.
   *
   * @claim "each with its own emoji, or" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > shows each reaction as a toggle button named by its label and count)
   * @claim "each with its own emoji, or" registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx::ReactionBar with a catalogue > draws each reaction and quick reaction as the catalogue's image, named by the emoji's name and count)
   */
  reactions: readonly Reaction[] | readonly CatalogueReaction[];
  /**
   * Reactions offered for a single press, after the counts: each with its own emoji, or, with
   * `catalogue`, an emoji's id. One that is already in `reactions` shows there instead, and an
   * id the catalogue lacks is left out. Shown only with `onReact`.
   *
   * @claim "after the counts: each with its own emoji" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > offers quick reactions that are not there yet, and moves one to the counts once chosen)
   * @claim "after the counts: each with its own emoji" registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx::ReactionBar with a catalogue > offers quick reactions by id that are not there yet, leaving out ids the catalogue lacks)
   * @claim "an id the catalogue lacks is left out" registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx::ReactionBar with a catalogue > offers quick reactions by id that are not there yet, leaving out ids the catalogue lacks)
   */
  quick?: readonly (ReactionOption | string)[] | undefined;
  /**
   * An image emoji catalogue, the same as the app's `EmojiPicker`: reactions and quick
   * reactions then go by emoji id, each showing the catalogue's image, named by the emoji's
   * name, an animated one playing while its button is under the mouse or in focus.
   *
   * @claim "each showing the catalogue's image, named" registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx::ReactionBar with a catalogue > draws each reaction and quick reaction as the catalogue's image, named by the emoji's name and count)
   * @claim "an animated one playing while" registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.catalogue.test.tsx::ReactionBar with a catalogue > plays an animated reaction while its button is under the mouse or in focus, and never with reduced motion)
   */
  catalogue?: EmojiCatalogue | undefined;
  /**
   * Called with a reaction's key when it is pressed, to add the person's reaction or take
   * it back. The click event comes second, so the app can check `event.isTrusted` before
   * it acts. Without it the reactions are read-only.
   */
  onReact?: ((key: string, event: MouseEvent<HTMLElement>) => void) | undefined;
  /**
   * Called when the "Add reaction" button at the end is pressed, to open the app's own
   * reaction picker. The button shows only with `onMore`. Anchor the picker to
   * `event.currentTarget`, and pass `moreOpen` while it is open.
   */
  onMore?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
  /**
   * Whether the picker that `onMore` opens is open, so the "Add reaction" button says so
   * (`aria-expanded`).
   */
  moreOpen?: boolean | undefined;
  /** The "Add reaction" button's name and tooltip, for other languages. @default "Add reaction" */
  moreLabel?: string | undefined;
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
  /** Not a prop. The "Add reaction" button calls `onMore`: `<ReactionBar onMore={openPicker}>`. */
  onAddReaction?: { 'Use onMore={openPicker}': never };
}

/** Props for {@link ReactionBar}: its own props and the `<div>` attributes it passes through. */
export type ReactionBarProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ReactionBarOwnProps> & ReactionBarOwnProps;

/**
 * A message's reactions: each one's emoji and how many chose it, with the person's own
 * pressed and tinted, and quick reactions to add with a single press. Pressing a reaction
 * calls `onReact` with its key, so the app adds the person's reaction or takes it back.
 * Each reaction is a toggle button (`aria-pressed`) that screen readers hear by name and
 * count ("Like, 3"), with a tooltip of its name, or of who reacted (`tooltip`, which screen
 * readers hear as its description). Without `onReact` the reactions are read-only, and with nothing to show
 * it renders nothing. `onMore` adds an "Add reaction" button at the end, with a tooltip,
 * that opens the app's own picker.
 *
 * With `catalogue`, reactions go by emoji id and show the catalogue's images, as `EmojiPicker`
 * with the same catalogue chooses them.
 *
 * Place it in `Message`'s `attachments`. Use `ToggleGroup` instead for a choice between
 * options, and `Badge` for a single count.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/reaction-bar
 *
 * @example
 * <ReactionBar reactions={message.reactions} quick={quickReactions} onReact={(key) => toggleReaction(message.id, key)} />
 * <ReactionBar reactions={message.reactions} onReact={react} onMore={(event) => openPicker(event.currentTarget)} moreOpen={pickerOpen} />
 * <ReactionBar catalogue={catalogue} reactions={[{ key: "party", count: 2, mine: true }]} quick={["like", "heart"]} onReact={react} />
 * @claim "reactions: each one's emoji and" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > shows each reaction as a toggle button named by its label and count)
 * @claim "reactions: each one's emoji and" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > tints the person's own reaction)
 * @claim "reactions: each one's emoji and" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > offers quick reactions that are not there yet, and moves one to the counts once chosen)
 * @claim "Each reaction is a toggle button" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > shows each reaction as a toggle button named by its label and count)
 * @claim "Without `onReact` the reactions are" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > is read-only without onReact, and says which reaction is yours)
 * @claim "Without `onReact` the reactions are" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > renders nothing with nothing to show)
 * @claim "`onMore` adds an" registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx verify:testExists(registry/ouro/components/ouro/reaction-bar/reaction-bar.test.tsx::ReactionBar > adds an Add reaction button with onMore, last, that opens the app's picker)
 */
export function ReactionBar(props: ReactionBarProps): JSX.Element | null {
  const {
    reactions,
    quick,
    catalogue,
    onReact,
    onMore,
    moreOpen,
    moreLabel = "Add reaction",
    disabled = false,
    label = "Reactions",
    mineLabel = "including you",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onReactionClick,
    items,
    onAddReaction,
    ...rest
  } = props;
  const id = useId();
  const given: readonly (Reaction | CatalogueReaction)[] = reactions ?? [];
  const shown = (catalogue ? given.map((reaction) => fromCatalogue(reaction, catalogue)) : given) as readonly Reaction[];
  const quickOptions = (quick ?? []).flatMap((option) =>
    typeof option !== "string" ? [option] : catalogue && catalogueIndex(catalogue).byId.has(option) ? [fromCatalogue({ key: option }, catalogue)] : [],
  );
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
          onAddReaction !== undefined && ["onAddReaction is not a prop", "<ReactionBar onMore={openPicker}>"],
          onMore === undefined && moreOpen !== undefined && ["moreOpen needs onMore, which opens the picker", "<ReactionBar onMore={openPicker} moreOpen={pickerOpen}>"],
          onReact === undefined && quick !== undefined && ["quick reactions need onReact, so they are hidden", "<ReactionBar quick={quick} onReact={react}>"],
          ...given
            .filter((reaction) => (catalogue ? !catalogueIndex(catalogue).byId.has(reaction.key) : true) && reaction.emoji === undefined)
            .map((reaction): DevWarning =>
              catalogue
                ? [`reaction "${reaction.key}" is not in the catalogue, so it shows as text`, `{ key: "${reaction.key}", count, emoji: <Fallback /> }`]
                : [`reaction "${reaction.key}" has no emoji; pass catalogue to draw it by id`, "<ReactionBar catalogue={catalogue} reactions={reactions}>"],
            ),
          !catalogue && quick?.some((option) => typeof option === "string") && ["quick reactions by id need catalogue, so they are hidden", '<ReactionBar catalogue={catalogue} quick={["like", "heart"]}>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const offered = onReact ? quickOptions.filter((option) => !shown.some((reaction) => reaction.key === option.key)) : [];
  if (shown.length === 0 && offered.length === 0 && !onMore) return null;
  return (
    <div {...rest} role="group" aria-label={label} data-ouro="reaction-bar" className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {/* One keyed list, counts then quick reactions: a quick reaction once chosen, or the last one
          taken back, keeps its button, so keyboard focus stays on it. */}
      {[...shown, ...offered].map((entry, index) => {
        const reaction: Partial<Reaction> & ReactionOption = entry;
        const described = reaction.tooltip ? `${id}-${index}` : undefined;
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
        // Every pressable reaction has a tooltip, its name or who reacted, so a reaction keeps its button as one comes.
        return onReact ? (
          <Tooltip key={reaction.key} content={reaction.tooltip ?? reaction.label}>
            <Badge
              data-ouro-control="reaction-bar"
              data-ouro-part={counted ? "reaction" : "quick"}
              {...look}
              aria-pressed={reaction.mine === true}
              aria-describedby={described}
              disabled={disabled}
              onClick={(event) => onReact(reaction.key, event)}
            >
              {face}
              {described && (
                <span id={described} hidden>
                  {reaction.tooltip}
                </span>
              )}
            </Badge>
          </Tooltip>
        ) : (
          <Badge key={reaction.key} {...look}>
            {face}
            {reaction.mine && <span className="sr-only">, {mineLabel}</span>}
            {reaction.tooltip && <span className="sr-only">, {reaction.tooltip}</span>}
          </Badge>
        );
      })}
      {onMore && (
        <Tooltip content={moreLabel}>
          <Badge
            data-ouro-control="reaction-bar"
            data-ouro-part="more"
            tone="secondary"
            variant="soft"
            icon={AddReactionIcon}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            disabled={disabled}
            onClick={onMore}
          >
            <span className="sr-only">{moreLabel}</span>
          </Badge>
        </Tooltip>
      )}
    </div>
  );
}

/** A catalogue reaction as one with its own emoji: the catalogue's image and name, else the app's fallback or the id as a token. */
function fromCatalogue(reaction: Partial<CatalogueReaction | Reaction> & { key: string }, catalogue: EmojiCatalogue): Reaction {
  const found = catalogueIndex(catalogue).byId.get(reaction.key);
  return {
    ...(reaction as Reaction),
    label: reaction.label ?? found?.item.name ?? reaction.key,
    emoji: found ? <Emoji item={found.item} skinTone={found.tone} /> : (reaction.emoji ?? `:${reaction.key}:`),
  };
}

/** A smiling face with a plus: add a reaction. */
function AddReactionIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11v1a10 10 0 1 1-9-10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
      <path d="M16 5h6" />
      <path d="M19 2v6" />
    </svg>
  );
}
