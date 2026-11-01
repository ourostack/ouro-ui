"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Emoji, type EmojiCatalogue, type EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { emojiToken, searchCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import { floatingMotionClass, floatingPortalClass, floatingSurfaceClass } from "@/registry/ouro/lib/ouro/floating";
import { PortalScope, usePortalContainer } from "@/registry/ouro/lib/ouro/portal-container";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { serverElement } from "@/registry/ouro/lib/ouro/server-element";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { caretRect, filterItems, findMatch, insertText, matchAt, type AutocompleteMatch } from "@/registry/ouro/components/ouro/autocomplete/autocomplete-styles";

/** One suggestion in the list a trigger opens. */
export interface AutocompleteItem {
  /** Identifies the suggestion, such as a person's id. Unique within one list. */
  value: string;
  /** The suggestion's name, shown in the list and read by screen readers. */
  label: string;
  /** Quieter text at the end of the row, such as a role or the shortcode `:tada:`. */
  description?: string | undefined;
  /** Shows an `Avatar` for the label, with its picture when `src` is set and its initials otherwise: `avatar: { src }`. */
  avatar?: { src?: string | undefined; initials?: string | undefined } | undefined;
  /** A small picture before the label instead of an avatar, such as an emoji: `glyph: "🎉"`. */
  glyph?: ReactNode;
  /**
   * An image catalogue's emoji, drawn before the label instead of an avatar or glyph; an
   * animated one plays while the suggestion is active. A trigger with `catalogue` sets it.
   */
  emoji?: EmojiItem | undefined;
  /**
   * The text that replaces the trigger and what follows it when the suggestion is picked.
   * @default the trigger character, the label and a space: "@Avery Kim "
   */
  insert?: string | undefined;
}

/** A character that opens suggestions, such as `@` for people or `:` for emoji. */
export interface AutocompleteTrigger {
  /** The character, such as "@". It opens the list at the start of the text or after a space or an opening bracket. */
  char: string;
  /** Names the list for screen readers: "People", "Emoji". */
  label: string;
  /**
   * An image emoji catalogue to suggest from instead of `items`: the emoji whose shortcode,
   * name or keyword starts with what follows the character, shortcodes first, at most eight,
   * each drawn as its image with its `:shortcode:` token. Picking one inserts the token and a
   * space, which `EmojiText` draws as the image once the message is sent.
   *
   * @claim "shortcodes first, at most eight" registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx::Autocomplete with a catalogue > suggests emoji by shortcode, name and keyword, shortcodes first, drawn as images)
   * @claim "Picking one inserts the token and a space" registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx::Autocomplete with a catalogue > inserts the picked emoji's token and a space in a Composer, which EmojiText draws as its image)
   */
  catalogue?: EmojiCatalogue | undefined;
  /**
   * The suggestions: a list, which shows the items whose label, a word of it, or whose value
   * starts with what follows the character, or a function of that text (`query`, "" just
   * after the character) that filters and caps them itself. The list closes when none match.
   * @claim "The list closes when none match" registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx::Autocomplete > filters by what follows the trigger, and closes when nothing matches)
   */
  items?: readonly AutocompleteItem[] | ((query: string) => readonly AutocompleteItem[]) | undefined;
  /** Called after a suggestion is inserted, with the suggestion and the query it replaced. */
  onPick?: ((item: AutocompleteItem, query: string) => void) | undefined;
  /** How many characters must follow the trigger before the list opens: a couple for emoji shortcodes, so a colon in a time stays quiet. @default 0 */
  minQueryLength?: number | undefined;
  /** Keeps the list open across spaces, for names with a first and last name. A line break still closes it. */
  allowSpaces?: boolean | undefined;
}

/** Props for {@link Autocomplete}. */
export interface AutocompleteProps {
  /** The characters that open suggestions, such as `@` for people and `:` for emoji, with their lists. */
  triggers: readonly AutocompleteTrigger[];
  /**
   * The text control: one `TextArea`, `TextField`, `Composer`, `<textarea>` or `<input>`. Autocomplete
   * gives it the list's ARIA, its keys while the list is open, and its ref.
   */
  children: ReactElement;
  /**
   * What screen readers hear when the list opens or its length changes.
   * @default (count) => "1 suggestion" or "{count} suggestions"
   */
  resultsLabel?: ((count: number, trigger: AutocompleteTrigger) => string) | undefined;

  /** Not a prop. Ouro UI takes a list: `<Autocomplete triggers={[{ char: "@", label: "People", items }]}>`. */
  trigger?: { 'Use triggers={[{ char: "@", label: "People", items }]}': never };
  /** Not a prop. A trigger's `items` holds its suggestions. */
  suggestions?: { 'Use triggers={[{ char: "@", label: "People", items: (query) => [...] }]}': never };
  /** Not a prop. A trigger takes `onPick`: `{ char: "@", onPick: (item) => ... }`. */
  onSelect?: { 'Use onPick on the trigger: { char: "@", onPick: (item) => ... }': never };
}

/** The props Autocomplete sets on the text control and reads back from it. */
type ControlProps = {
  ref?: Ref<HTMLTextAreaElement | HTMLInputElement>;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onSelect?: (event: SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onInput?: (event: FormEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
};

const defaultResultsLabel = (count: number) => (count === 1 ? "1 suggestion" : `${count} suggestions`);
const preventDefault = (event: MouseEvent) => event.preventDefault();
const sameMatch = (a: AutocompleteMatch | null, b: AutocompleteMatch | null) =>
  a !== null && b !== null && a.trigger === b.trigger && a.start === b.start && a.query === b.query;

const popupClass = cn(
  floatingSurfaceClass,
  floatingMotionClass,
  "max-h-[min(16rem,var(--available-height))] w-max min-w-56 max-w-[min(22rem,var(--available-width))] overflow-y-auto overscroll-contain p-1 scroll-py-1",
);

const optionClass =
  "box-border flex min-h-11 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-base leading-5 outline-none select-none " +
  "sm:pointer-fine:min-h-9 sm:pointer-fine:text-sm " +
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground " +
  // Forced colours drop the fill, so the active option takes the system's pair.
  "forced-colors:data-highlighted:bg-[Highlight] forced-colors:data-highlighted:text-[HighlightText]";

/**
 * Suggestions at the text caret: typing a trigger character, such as `@` for people or `:` for
 * emoji, in a `TextArea` or `TextField` opens a list beside the caret, filtered by what follows
 * the character. The arrow keys move through it, Enter or Tab inserts the suggestion in place
 * of the trigger and its query, and Escape closes it. Focus stays in the text throughout: the
 * text control points at the active suggestion with `aria-activedescendant`, and screen readers
 * hear how many suggestions there are. The typed part of a suggestion's label shows in bold
 * where it starts the label or one of its words. One control can have several triggers.
 *
 * Insertion goes through the browser's own text editing, so Undo takes it back and the
 * control's `onChange` and `onValueChange` run, controlled or not. `TextArea`'s `autoGrow`
 * grows with it. In a `Composer`, the Enter that picks a suggestion does not send. A trigger
 * with an image emoji `catalogue` suggests its emoji as images and inserts their `:shortcode:`
 * tokens, which `EmojiText` draws as images in the sent message.
 *
 * Use `Combobox` instead to choose one value for a field from a list, and `Command` for a
 * command palette.
 *
 * @group Forms
 * @see https://ui.ouro.bot/docs/autocomplete
 * @claim "In a `Composer`, the Enter that picks" registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.test.tsx::Autocomplete > picks with Enter in a Composer without sending, and leaves the next Enter to send)
 *
 * @example
 * <Autocomplete
 *   triggers={[
 *     { char: "@", label: "People", allowSpaces: true, items: (query) => people.filter((p) => p.label.toLowerCase().includes(query.toLowerCase())).slice(0, 6) },
 *     { char: ":", label: "Emoji", minQueryLength: 2, catalogue },
 *   ]}
 * >
 *   <TextArea label="Message" hideLabel autoGrow rows={1} maxRows={8} value={text} onValueChange={setText} />
 * </Autocomplete>
 */
export function Autocomplete(props: AutocompleteProps): JSX.Element {
  const { triggers, children, resultsLabel = defaultResultsLabel } = props;
  // A Server Component's field can arrive as a lazy wrapper; resolve it before cloning.
  const child = serverElement(children);
  useAutocompleteChecks(props, child);

  const control = child as ReactElement<ControlProps>;
  const controlRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const setRef = useMergedRef(control.props.ref, controlRef);
  const listId = useId();
  const state = useSuggestions(triggers);
  const { match, trigger, items, open, current } = state;

  const pick = (item: AutocompleteItem, element: HTMLTextAreaElement | HTMLInputElement) => {
    insertPick(element, match!, trigger!, item);
    state.setDismissed(match!.start);
  };

  useAnnouncedCount(open ? resultsLabel(items.length, trigger!) : null);
  useActiveInView(open ? `${listId}-${current}` : undefined);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const action = open ? keyAction(event, current, items.length) : null;
    if (action === null) {
      control.props.onKeyDown?.(event);
      return;
    }
    event.preventDefault();
    if (action === "pick") pick(items[current]!, event.currentTarget);
    else if (action === "dismiss") {
      // The list's Escape: a dialog around the field stays open.
      event.stopPropagation();
      state.setDismissed(match!.start);
    } else state.setActive(action);
  };

  // The list's anchor: the trigger character, measured each time the list is placed. It
  // keeps the last trigger while the list closes, so the list leaves from where it was.
  const { anchorAt } = state;
  const anchor = useCallback(() => {
    const element = controlRef.current!;
    return { getBoundingClientRect: () => caretRect(element, anchorAt), contextElement: element };
  }, [anchorAt]);

  return (
    <>
      {cloneElement(control, {
        ref: setRef,
        "aria-autocomplete": "list",
        "aria-controls": open ? listId : undefined,
        "aria-activedescendant": open ? `${listId}-${current}` : undefined,
        onKeyDown,
        ...watchedHandlers(control.props, state),
      } as ControlProps & Record<string, unknown>)}
      <SuggestionList
        open={open}
        listId={listId}
        label={trigger?.label}
        query={match?.query}
        items={items}
        current={current}
        anchor={anchor}
        onHover={state.setActive}
        onPick={(item) => pick(item, controlRef.current!)}
      />
    </>
  );
}

/** Throws unless children is one element, and warns in development about unusable triggers and props. */
function useAutocompleteChecks(props: AutocompleteProps, child: unknown): void {
  if (!isValidElement(child)) {
    devThrow(
      "Autocomplete",
      "children is not one element, so there is no text control to watch",
      process.env.NODE_ENV !== "production"
        ? '<Autocomplete triggers={…}><TextArea label="Message" /></Autocomplete>'
        : // Stryker disable next-line StringLiteral: production only; the check never runs there.
          /* istanbul ignore next @preserve -- production only */ "",
    );
  }
  useDevWarnings(
    "Autocomplete",
    process.env.NODE_ENV !== "production"
      ? () => [...triggerWarnings(props.triggers), ...hintWarnings(props)]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
}

/** The development warnings for Autocomplete's triggers, with their fixes. */
function triggerWarnings(triggers: readonly AutocompleteTrigger[]): DevWarning[] {
  const chars = triggers.map((candidate) => candidate.char);
  const long = triggers.find((candidate) => [...candidate.char].length !== 1);
  const repeated = chars.find((char, index) => chars.indexOf(char) !== index);
  const unnamed = triggers.find((candidate) => !candidate.label);
  const empty = triggers.find((candidate) => !candidate.items && !candidate.catalogue);
  return [
    triggers.length === 0 && ["triggers is empty, so nothing opens suggestions", '<Autocomplete triggers={[{ char: "@", label: "People", items }]}>'],
    long && [`char "${long.char}" is not one character`, `{ char: "${[...long.char][0] ?? "@"}", label: "${long.label}", items }`],
    repeated !== undefined && [`two triggers use "${repeated}"`, "give each trigger its own char"],
    unnamed && [`the "${unnamed.char}" trigger's label is empty, so its list has no name`, `{ char: "${unnamed.char}", label: "People", items }`],
    empty && [`the "${empty.char}" trigger has neither items nor catalogue, so it suggests nothing`, `{ char: "${empty.char}", label: "${empty.label}", items }`],
  ];
}

/** The development warnings for props Autocomplete does not take, with their fixes. */
function hintWarnings(props: AutocompleteProps): DevWarning[] {
  const { trigger: triggerHint, suggestions, onSelect } = props;
  return [
    triggerHint !== undefined && ["trigger is not a prop; Autocomplete takes a list", '<Autocomplete triggers={[{ char: "@", label: "People", items }]}>'],
    suggestions !== undefined && ["suggestions is not a prop; a trigger's items holds them", '{ char: "@", label: "People", items: (query) => […] }'],
    onSelect !== undefined && ["onSelect is not a prop; a trigger takes onPick", '{ char: "@", label: "People", items, onPick: (item) => … }'],
  ];
}

/** What Autocomplete knows about the caret: the trigger it is in, its suggestions, and whether the list is open. */
interface SuggestionState {
  match: AutocompleteMatch | null;
  trigger: AutocompleteTrigger | undefined;
  items: readonly AutocompleteItem[];
  open: boolean;
  current: number;
  anchorAt: number;
  setActive: (index: number) => void;
  setFocused: (focused: boolean) => void;
  setDismissed: (start: number) => void;
  evaluate: (element: HTMLTextAreaElement | HTMLInputElement) => void;
}

function useSuggestions(triggers: readonly AutocompleteTrigger[]): SuggestionState {
  const [match, setMatch] = useState<AutocompleteMatch | null>(null);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  // The trigger the person closed with Escape, or picked from: it stays closed until the caret
  // leaves it.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [anchorAt, setAnchorAt] = useState(0);

  const trigger = match ? triggers[match.trigger] : undefined;
  const items = useMemo(() => {
    // No trigger without a match, or when `triggers` no longer has the match's.
    if (!trigger) return [];
    const { query } = match!;
    if (trigger.catalogue) return searchCatalogue(trigger.catalogue, query, 8).map(emojiSuggestion);
    return typeof trigger.items === "function" ? trigger.items(query) : filterItems(trigger.items ?? [], query);
  }, [match, trigger]);
  const open = focused && match !== null && dismissed !== match.start && items.length > 0;
  const current = Math.min(active, items.length - 1);

  const evaluate = (element: HTMLTextAreaElement | HTMLInputElement) => {
    // Null for an input type with no caret (email, number), which finds no match.
    const caret = element.selectionStart!;
    const next = element.selectionEnd === caret ? findMatch(element.value, caret, triggers) : null;
    setMatch((previous) => (sameMatch(previous, next) ? previous : next));
    if (next) setAnchorAt(next.start);
    if (!sameMatch(match, next)) setActive(0);
    if (next?.start !== dismissed) setDismissed(null);
  };

  return { match, trigger, items, open, current, anchorAt, setActive, setFocused, setDismissed, evaluate };
}

/** A catalogue's emoji as a suggestion: its name, its token as the description and what it inserts, and its image. */
function emojiSuggestion(item: EmojiItem): AutocompleteItem {
  const token = emojiToken(item);
  return { value: item.id, label: item.name, description: token, emoji: item, insert: `${token} ` };
}

/** Inserts the pick in place of the trigger and its query, then tells the trigger's `onPick`. */
function insertPick(element: HTMLTextAreaElement | HTMLInputElement, match: AutocompleteMatch, trigger: AutocompleteTrigger, item: AutocompleteItem): void {
  const { start, query } = match;
  insertText(element, start, start + 1 + query.length, item.insert ?? `${trigger.char}${item.label} `);
  trigger.onPick?.(item, query);
}

/**
 * What a key does while the list is open: the index the arrow keys move to, "pick" for Enter
 * and Tab, "dismiss" for Escape, or null to leave the key to the field (with Alt, Control,
 * Meta or Shift held, or while an input method is composing).
 */
function keyAction(event: KeyboardEvent, current: number, count: number): number | "pick" | "dismiss" | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return null;
  if (event.key === "Escape") return "dismiss";
  if (event.shiftKey) return null;
  if (event.key === "Enter" || event.key === "Tab") return "pick";
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  return step === 0 ? null : (current + step + count) % count;
}

/** Speaks `message` when the list opens and when it changes, and leaves the last one when the list closes. */
function useAnnouncedCount(message: string | null): void {
  useEffect(() => {
    if (message !== null) announce(message);
  }, [message]);
}

/** Keeps the active suggestion in view as the arrow keys move. */
function useActiveInView(activeId: string | undefined): void {
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: with no active suggestion, no element has the id, and nothing scrolls.
    if (activeId === undefined) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);
}

/** The field's handlers that look for a trigger at the caret, or open and close the list, then run its own. */
function watchedHandlers(own: ControlProps, state: SuggestionState): ControlProps {
  return {
    onInput: (event) => {
      state.evaluate(event.currentTarget);
      own.onInput?.(event);
    },
    onSelect: (event) => {
      state.evaluate(event.currentTarget);
      own.onSelect?.(event);
    },
    onFocus: (event) => {
      state.setFocused(true);
      own.onFocus?.(event);
    },
    onBlur: (event) => {
      state.setFocused(false);
      own.onBlur?.(event);
    },
  };
}

interface SuggestionListProps {
  open: boolean;
  listId: string;
  label: string | undefined;
  query: string | undefined;
  items: readonly AutocompleteItem[];
  current: number;
  anchor: () => { getBoundingClientRect: () => DOMRect; contextElement: Element };
  onHover: (index: number) => void;
  onPick: (item: AutocompleteItem) => void;
}

// The listbox beside the caret. Focus stays in the text, so its blur closes the list on a press elsewhere.
function SuggestionList({ open, listId, label, query, items, current, anchor, onHover, onPick }: SuggestionListProps): JSX.Element {
  const portal = usePortalContainer("Autocomplete");
  return (
    <BasePopover.Root open={open}>
      <BasePopover.Portal {...portal} data-ouro="autocomplete-portal" className={floatingPortalClass}>
        <PortalScope>
          <BasePopover.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} collisionPadding={8} data-ouro="autocomplete-positioner">
            <BasePopover.Popup initialFocus={false} finalFocus={false} role="listbox" id={listId} aria-label={label} data-ouro="autocomplete" className={popupClass}>
              {items.map((item, index) => (
                <div
                  key={item.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === current}
                  data-highlighted={index === current ? "" : undefined}
                  data-ouro-control="autocomplete"
                  data-ouro-part="option"
                  className={optionClass}
                  onMouseDown={preventDefault}
                  onMouseMove={() => onHover(index)}
                  onClick={() => onPick(item)}
                >
                  <OptionContent item={item} query={query!} active={index === current} />
                </div>
              ))}
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </PortalScope>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/** A suggestion's row: its avatar, emoji or glyph, its label with the typed part in bold, and its description. */
function OptionContent({ item, query, active }: { item: AutocompleteItem; query: string; active: boolean }): JSX.Element {
  const at = matchAt(item.label, query);
  return (
    <>
      {item.emoji ? (
        <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center text-lg leading-none">
          <Emoji item={item.emoji} play={active} />
        </span>
      ) : item.avatar ? (
        <Avatar name={item.label} alt="" size="xs" src={item.avatar.src} initials={item.avatar.initials} className="shrink-0" />
      ) : item.glyph !== undefined ? (
        <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center text-lg leading-none">
          {item.glyph}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        {at < 0 ? (
          item.label
        ) : (
          <>
            {item.label.slice(0, at)}
            <span data-ouro-autocomplete-match="" className="font-semibold">
              {item.label.slice(at, at + query.length)}
            </span>
            {item.label.slice(at + query.length)}
          </>
        )}
      </span>
      {item.description && (
        <span className="ms-2 shrink-0 text-sm text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))] sm:pointer-fine:text-xs">{item.description}</span>
      )}
    </>
  );
}
