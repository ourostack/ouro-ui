"use client";

import {
  cloneElement,
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { checkOpenMode } from "@/registry/ouro/lib/ouro/open-mode";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { serverElement } from "@/registry/ouro/lib/ouro/server-element";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useSheetPresentation } from "@/registry/ouro/lib/ouro/use-sheet-presentation";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Popover, type PopoverAlign, type PopoverPresentation, type PopoverSide } from "@/registry/ouro/components/ouro/popover/popover";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import {
  barButtonClass,
  barClass,
  cellClass,
  COLUMNS,
  emojiSkinTones,
  fillCount,
  gridClass,
  headingClass,
  matchEmoji,
  panelClass,
  previewClass,
  previewGlyphClass,
  quickClass,
  scrollerClass,
  skinToneNames as defaultSkinToneNames,
  stepInRow,
  toned,
  toneOptionClass,
  type EmojiSkinTone,
} from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker-styles";

export type { EmojiSkinTone } from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker-styles";

/** One emoji the picker offers: the character, its name and the words that find it. */
export interface EmojiPickerEmoji {
  /** The emoji as text, drawn with the platform's own emoji font: `"👍"`. */
  emoji: string;
  /** Its name, which screen readers hear and the search matches: `"thumbs up"`. */
  name: string;
  /** More words the search matches: `["like", "yes", "approve"]`. */
  keywords?: readonly string[] | undefined;
  /**
   * It comes in skin tones. `true` puts Unicode's tone modifier after its first character
   * (right for one person or hand, such as 👍 or 🧑‍💻); for an emoji where that is not
   * right, such as two people holding hands, list its five toned forms, light to dark.
   *
   * @claim "list its five toned forms" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker skin tones > puts the tone into what it chooses, by Unicode's modifier or the toned forms the app listed)
   */
  skinTones?: boolean | readonly string[] | undefined;
}

/** A category of emoji: its name, the icon its button shows, and its emoji in order. */
export interface EmojiPickerCategory {
  /** The category's name, shown as its heading and read for its button: `"Smileys"`. Unique within the picker. */
  label: string;
  /** What its button in the category bar shows: an icon element. Defaults to its first emoji. */
  icon?: ReactNode;
  /** The category's emoji, in the order they show. */
  emoji: readonly EmojiPickerEmoji[];
}

/** What `onSelect` receives: the emoji chosen, in the skin tone it was chosen in. */
export interface EmojiPickerSelection {
  /** The emoji as text, in the chosen skin tone when it has tones: `"👍🏽"`. */
  emoji: string;
  /** Its name: `"thumbs up"`. */
  name: string;
  /** The skin tone it was chosen in; `"default"` for an emoji without tones. */
  skinTone: EmojiSkinTone;
  /** The entry from `categories`, `frequent` or `quick` that was chosen, as the app passed it. */
  item: EmojiPickerEmoji;
}

/** Props shared by both ways of opening an EmojiPicker. */
export interface EmojiPickerBaseProps {
  /** What the picker is for, which names it for screen readers: `"Add a reaction"`, `"Insert emoji"`. Required. */
  label: string;
  /**
   * Every emoji the picker offers, by category, in order. The app supplies them, so it picks the set, the names and the language.
   *
   * @claim "Every emoji the picker offers" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker content > shows the quick row, the frequently used emoji and every category, each emoji named for screen readers)
   */
  categories: readonly EmojiPickerCategory[];
  /** The person's frequently used emoji, which the app keeps. Shown first, under `frequentLabel`, with its own button in the category bar. */
  frequent?: readonly EmojiPickerEmoji[] | undefined;
  /** A row of emoji above the categories for a single press, such as the quick reactions on a message. */
  quick?: readonly EmojiPickerEmoji[] | undefined;
  /**
   * Called with the chosen emoji when the person presses one, or presses Enter in the search
   * for its first result; the picker then closes. The event comes second, so the app can check
   * `event.isTrusted` before it acts.
   */
  onSelect: (selection: EmojiPickerSelection, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void;
  /**
   * The skin tone the emoji show in, when you keep it (in the person's settings, say). Pair it
   * with `onSkinToneChange`. Without it, the picker remembers the tone while it is mounted.
   */
  skinTone?: EmojiSkinTone | (string & { 'Use "default", "light", "medium-light", "medium", "medium-dark" or "dark"': never }) | undefined;
  /** Called with the new skin tone when the person picks one, so the app can keep it. */
  onSkinToneChange?: ((skinTone: EmojiSkinTone) => void) | undefined;
  /**
   * `auto`, the default, is a popover from 640px up and a bottom sheet below. `popover` stays
   * beside the trigger at every width; `sheet` is always a bottom sheet.
   * @default "auto"
   * @claim "a popover from 640px up" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker opening and closing > is a bottom sheet below 640px, filling its width, and a popover from 640px up)
   * @claim "beside the trigger at every width" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker opening and closing > stays a popover on a phone with presentation popover, and falls back to it for an unknown presentation)
   * @claim "is always a bottom sheet" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker opening and closing > is a sheet at every width with presentation sheet)
   */
  presentation?: PopoverPresentation | (string & { 'Use "auto", "popover" or "sheet"': never }) | undefined;
  /**
   * The side of the trigger the popover sits on; it flips when there is no room. @default "bottom"
   *
   * @claim "it flips when there is no room" https://base-ui.com/react/components/popover verify:urlOk(https://base-ui.com/react/components/popover)
   */
  side?: PopoverSide | (string & { 'Use "top", "bottom", "left" or "right"': never }) | undefined;
  /** How the popover lines up with the trigger along that side. @default "center" */
  align?: PopoverAlign | (string & { 'Use "start", "center" or "end": left is "start", right is "end"': never }) | undefined;
  /** The search field's label and placeholder. @default "Search emoji" */
  searchLabel?: string | undefined;
  /** The heading of the frequently used emoji. @default "Frequently used" */
  frequentLabel?: string | undefined;
  /** What screen readers hear for the `quick` row. @default "Quick reactions" */
  quickLabel?: string | undefined;
  /** What screen readers hear for the category bar. @default "Categories" */
  categoriesLabel?: string | undefined;
  /** The name of the skin tone button and its choices. @default "Skin tone" */
  skinToneLabel?: string | undefined;
  /**
   * The name of each skin tone, for other languages.
   * @default { default: "Default", light: "Light", "medium-light": "Medium-light", medium: "Medium", "medium-dark": "Medium-dark", dark: "Dark" }
   * @claim "name of each skin tone" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker labels > takes every word it shows or speaks from its props, for other languages)
   */
  skinToneNames?: Readonly<Record<EmojiSkinTone, string>> | undefined;
  /** The heading of the search results, also announced as they change; `{count}` is the number found. @default "{count} emoji" */
  resultsLabel?: string | undefined;
  /** What shows, and is announced, when nothing matches the search. @default "No emoji found" */
  noResultsLabel?: string | undefined;
  /** The label of the popover's close button, which only screen-reader and keyboard users see. @default "Close" */
  closeLabel?: string | undefined;
  /** Layout only, applied to the panel inside the popover: width (`w-96`). Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. A chosen emoji calls `onSelect`: `<EmojiPicker onSelect={(selection) => insert(selection.emoji)}>`. */
  onEmojiSelect?: { 'Use onSelect={(selection) => insert(selection.emoji)}': never };
  /** Not a prop. A chosen emoji calls `onSelect`: `<EmojiPicker onSelect={(selection) => insert(selection.emoji)}>`. */
  onEmojiClick?: { 'Use onSelect={(selection) => insert(selection.emoji)}': never };
  /** Not a prop. The emoji come by category in `categories`: `<EmojiPicker categories={[{ label, emoji }]}>`. */
  data?: { 'Use categories={[{ label: "Smileys", emoji: [{ emoji, name }] }]}': never };
  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<EmojiPicker open={open} onOpenChange={setOpen} anchor={buttonRef}>`. */
  isOpen?: { 'Use <EmojiPicker open={open} onOpenChange={setOpen} anchor={buttonRef}>': never };
  /** Not a prop. `onOpenChange(false)` fires on close: `<EmojiPicker open={open} onOpenChange={setOpen} anchor={buttonRef}>`. */
  onClose?: { 'Use <EmojiPicker open={open} onOpenChange={setOpen} anchor={buttonRef}>': never };
}

/** An uncontrolled EmojiPicker: `trigger` opens and closes it. */
export type EmojiPickerWithTriggerProps = EmojiPickerBaseProps & {
  /** The element that opens and closes the picker, usually an icon Button: `trigger={<Button aria-label="Add a reaction">…</Button>}`. */
  trigger: ReactElement;
  /** Not with `trigger`. Remove `trigger` to control the picker with `open`, `onOpenChange` and `anchor`. */
  open?: never;
  /** Not with `trigger`. Remove `trigger` to control the picker with `open`, `onOpenChange` and `anchor`. */
  onOpenChange?: never;
  /** Not with `trigger`. The picker sits beside its trigger. */
  anchor?: never;
};

/** A controlled EmojiPicker: you own `open`, update it in `onOpenChange`, and say what it points at with `anchor`. */
export type EmojiPickerControlledProps = EmojiPickerBaseProps & {
  /** Whether the picker is open. */
  open: boolean;
  /** Called with `false` when the person dismisses the picker (Escape, an outside press, the close button) or chooses an emoji. */
  onOpenChange: (open: boolean) => void;
  /** The element the picker points at, usually the button that toggles it: `anchor={buttonRef}`. */
  anchor: RefObject<HTMLElement | null>;
  /** Not with `open`. Remove `open`, `onOpenChange` and `anchor` to let a trigger open the picker. */
  trigger?: never;
};

/** Props for {@link EmojiPicker}: either `trigger`, or `open` with `onOpenChange` and `anchor`. */
export type EmojiPickerProps = EmojiPickerWithTriggerProps | EmojiPickerControlledProps;

type TriggerProps = {
  ref?: Ref<HTMLElement> | undefined;
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
};

const categoriesFix = '<EmojiPicker label="Add a reaction" categories={[{ label: "Smileys", emoji: [{ emoji: "😀", name: "grinning face" }] }]} onSelect={react}>';
const selectFix = "<EmojiPicker onSelect={(selection) => insert(selection.emoji)}>";
const controlFix = "<EmojiPicker open={open} onOpenChange={setOpen} anchor={buttonRef}>";

/**
 * An emoji picker for reactions and for putting emoji into text. It has a search field, a bar
 * of categories, an optional row of quick reactions, a skin tone choice and a grid of the
 * platform's own emoji, in a `Popover` that is a bottom sheet on phones. The app passes the
 * emoji by category, with names and keywords in its own language, and the person's
 * frequently used ones.
 *
 * The search matches the start of any word in an emoji's name or keywords, ignoring case and
 * accents, and announces how many it found. The grid is one Tab stop: the arrow keys move
 * through it, Home and End go to the ends of a row (with Ctrl, of the grid), Page Down and
 * Page Up go to the next and previous category, and Enter chooses. Every emoji is named for
 * screen readers, and the one in focus shows large with its name under the grid. Choosing one
 * calls `onSelect` and closes the picker; Escape closes it too.
 *
 * Use `ReactionBar` instead to show a message's reactions and its few quick ones, with an
 * EmojiPicker beside it for the rest. Use `Command` instead for a searchable list of actions.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/emoji-picker
 *
 * @example
 * <EmojiPicker
 *   label="Add a reaction"
 *   trigger={<Button variant="plain" aria-label="Add a reaction"><SmileIcon /></Button>}
 *   categories={categories}
 *   frequent={frequent}
 *   quick={quickReactions}
 *   skinTone={tone}
 *   onSkinToneChange={setTone}
 *   onSelect={(selection) => react(message.id, selection.emoji)}
 * />
 * @claim "Every emoji is named for" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker content > shows the quick row, the frequently used emoji and every category, each emoji named for screen readers)
 * @claim "the one in focus shows large" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker content > shows the name of the emoji in focus, or under the mouse, large beside its glyph)
 * @claim "announces how many it found" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker search > announces how many it found as the count changes, once each, and when nothing matches)
 * @claim "The grid is one Tab stop" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker keyboard > is one Tab stop that follows focus)
 * @claim "Page Up go to the next" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker keyboard > goes to the next and previous category with Page Down and Page Up, keeping the column)
 * @claim "Home and End go to the" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker keyboard > goes to the ends of a row with Home and End, and of the grid with Ctrl)
 * @claim "calls `onSelect` and closes the picker" registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.test.tsx::EmojiPicker content > chooses an emoji with a press: onSelect gets it, its name, its tone and the event, and the picker closes)
 */
export function EmojiPicker(props: EmojiPickerProps): JSX.Element {
  const {
    label,
    categories,
    frequent,
    quick,
    onSelect,
    skinTone: skinToneProp,
    onSkinToneChange,
    presentation = "auto",
    side,
    align,
    searchLabel = "Search emoji",
    frequentLabel = "Frequently used",
    quickLabel = "Quick reactions",
    categoriesLabel = "Categories",
    skinToneLabel = "Skin tone",
    skinToneNames = defaultSkinToneNames,
    resultsLabel = "{count} emoji",
    noResultsLabel = "No emoji found",
    closeLabel = "Close",
    className,
    trigger,
    open,
    onOpenChange,
    anchor,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onEmojiSelect,
    onEmojiClick,
    data,
    isOpen,
    onClose,
  } = props as EmojiPickerBaseProps & {
    trigger?: ReactElement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    anchor?: RefObject<HTMLElement | null>;
  };

  checkOpenMode("EmojiPicker", "emoji picker", trigger !== undefined, open, onOpenChange);

  const knownTone = skinToneProp === undefined || emojiSkinTones.includes(skinToneProp as EmojiSkinTone);
  useAppearanceClassNameCheck(
    "EmojiPicker",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; EmojiPicker takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "EmojiPicker",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is required; it names the picker for screen readers", '<EmojiPicker label="Add a reaction">'],
          !categories?.length && ["categories is empty; pass the emoji to offer", categoriesFix],
          !knownTone && [
            `skinTone="${String(skinToneProp)}" is not a skin tone; use ${emojiSkinTones.map((tone) => `"${tone}"`).join(", ")}`,
            '<EmojiPicker skinTone="medium">',
          ],
          onEmojiSelect !== undefined && ["onEmojiSelect is not a prop", selectFix],
          onEmojiClick !== undefined && ["onEmojiClick is not a prop", selectFix],
          data !== undefined && ["data is not a prop; the emoji come by category in categories", categoriesFix],
          isOpen !== undefined && ["isOpen is not a prop", controlFix],
          onClose !== undefined && ["onClose is not a prop", controlFix],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The picker owns the open state even with a trigger, so choosing an emoji can close it.
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpenNow = controlled ? open : ownOpen;
  const setOpen = controlled ? onOpenChange! : setOwnOpen;

  const [ownTone, setOwnTone] = useState<EmojiSkinTone>("default");
  const tone: EmojiSkinTone = skinToneProp === undefined ? ownTone : knownTone ? (skinToneProp as EmojiSkinTone) : "default";
  const setTone = (next: EmojiSkinTone) => {
    setOwnTone(next);
    onSkinToneChange?.(next);
  };

  // A presentation that is not one of Popover's is a popover there, and is no sheet here either.
  const asSheet = useSheetPresentation(presentation);

  const triggerRef = useRef<HTMLElement>(null);
  // A Server Component's trigger can arrive as a lazy wrapper; resolve it before cloning.
  const triggerElement = serverElement(trigger);
  const triggerProps = (triggerElement?.props ?? {}) as TriggerProps;
  const mergedTriggerRef = useMergedRef(triggerProps.ref, triggerRef);
  const triggerNode =
    triggerElement !== undefined &&
    cloneElement(triggerElement as ReactElement<TriggerProps & { "aria-haspopup"?: string; "aria-expanded"?: boolean }>, {
      ref: mergedTriggerRef,
      onClick: (event: MouseEvent<HTMLElement>) => {
        triggerProps.onClick?.(event);
        if (!event.defaultPrevented) setOwnOpen(!ownOpen);
      },
      "aria-haspopup": "dialog",
      "aria-expanded": isOpenNow,
    });

  return (
    <>
      {triggerNode}
      <Popover
        // Without a label (a development message names the fix), the dialog still has a name.
        title={label || "Emoji"}
        hideTitle
        closeLabel={closeLabel}
        presentation={presentation}
        side={side}
        align={align}
        className="w-auto p-1"
        open={isOpenNow}
        onOpenChange={setOpen}
        anchor={controlled ? anchor! : triggerRef}
      >
        <Panel
          categories={categories ?? []}
          frequent={frequent}
          quick={quick}
          tone={tone}
          setTone={setTone}
          asSheet={asSheet}
          labels={{ searchLabel, frequentLabel, quickLabel, categoriesLabel, skinToneLabel, skinToneNames, resultsLabel, noResultsLabel }}
          className={className}
          onChoose={(item, event) => {
            onSelect({ emoji: toned(item, tone), name: item.name, skinTone: item.skinTones ? tone : "default", item }, event);
            setOpen(false);
          }}
        />
      </Popover>
    </>
  );
}

/** A run of grid cells: one category, or the search results. */
interface Section {
  label: string;
  icon: ReactNode;
  items: readonly EmojiPickerEmoji[];
  /** Where its first emoji is among the grid's cells. */
  start: number;
}

/** One row of the grid: the section it is in and the cells it holds. */
interface Row {
  section: number;
  start: number;
  length: number;
}

interface PanelLabels {
  searchLabel: string;
  frequentLabel: string;
  quickLabel: string;
  categoriesLabel: string;
  skinToneLabel: string;
  skinToneNames: Readonly<Record<EmojiSkinTone, string>>;
  resultsLabel: string;
  noResultsLabel: string;
}

interface PanelProps {
  categories: readonly EmojiPickerCategory[];
  frequent: readonly EmojiPickerEmoji[] | undefined;
  quick: readonly EmojiPickerEmoji[] | undefined;
  tone: EmojiSkinTone;
  setTone: (tone: EmojiSkinTone) => void;
  asSheet: boolean;
  labels: PanelLabels;
  className: string | undefined;
  onChoose: (item: EmojiPickerEmoji, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void;
}

const isRtl = (element: Element) => getComputedStyle(element).direction === "rtl";
const offersTones = (items: readonly EmojiPickerEmoji[] | undefined) => items?.some((item) => Boolean(item.skinTones)) ?? false;

/** A clock, the frequently used category's icon. */
function ClockIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A magnifier, the search field's icon. */
function SearchIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** One emoji button. Memoized, so moving focus re-renders only the cells it leaves and reaches. */
const Cell = memo(function Cell({ glyph, name, index, active, quick }: { glyph: string; name: string; index: number; active: boolean; quick: boolean }) {
  return (
    <button
      type="button"
      tabIndex={active ? 0 : -1}
      aria-label={name}
      data-cell={index}
      data-ouro-control="emoji-picker"
      data-ouro-part={quick ? "quick" : "emoji"}
      className={cellClass}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
});

/** The grid's sections and rows: the search's results while there is a search, else the frequently used emoji and the categories. */
function useSections(categories: readonly EmojiPickerCategory[], frequent: readonly EmojiPickerEmoji[] | undefined, query: string, labels: PanelLabels) {
  const searching = query.trim() !== "";
  const results = useMemo(() => {
    if (!searching) return [];
    const seen = new Set<string>();
    return [...(frequent ?? []), ...categories.flatMap((category) => category.emoji)].filter((item) => {
      if (seen.has(item.emoji) || !matchEmoji(item, query)) return false;
      seen.add(item.emoji);
      return true;
    });
  }, [searching, query, frequent, categories]);
  const { resultsLabel, frequentLabel } = labels;
  const sections = useMemo(() => {
    const list: Omit<Section, "start">[] = searching
      ? [{ label: fillCount(resultsLabel, results.length), icon: null, items: results }]
      : [
          ...(frequent?.length ? [{ label: frequentLabel, icon: <ClockIcon />, items: frequent }] : []),
          ...categories
            .filter((category) => category.emoji.length)
            .map((category) => ({ label: category.label, icon: category.icon ?? category.emoji[0]!.emoji, items: category.emoji })),
        ];
    let start = 0;
    return list.map((section) => {
      const placed = { ...section, start };
      start += section.items.length;
      return placed;
    });
  }, [searching, results, frequent, categories, resultsLabel, frequentLabel]);
  const rows = useMemo(() => {
    const list: Row[] = [];
    sections.forEach((section, index) => {
      for (let offset = 0; offset < section.items.length; offset += COLUMNS) {
        list.push({ section: index, start: section.start + offset, length: Math.min(COLUMNS, section.items.length - offset) });
      }
    });
    return list;
  }, [sections]);
  const total = rows.length ? rows.at(-1)!.start + rows.at(-1)!.length : 0;
  return { searching, results, sections, rows, total };
}

/** Speaks a message politely when it changes, and nothing when it is empty. */
function useAnnouncement(message: string): void {
  const announced = useRef("");
  useEffect(() => {
    if (message && message !== announced.current) announce(message);
    announced.current = message;
  }, [message]);
}

/** Where a key takes focus in the grid. */
interface GridStep {
  /** The cell focus moves to, or -1 for the search field. */
  next: number;
  /** The column an Up, Down or page key keeps, for the next one. */
  column?: number;
}

/**
 * Where a key moves focus in the grid from cell `at`: the arrows (Left and Right swapped in a
 * right-to-left page), Up from the first row to the search, Home and End to the ends of the row
 * (with Ctrl or Command, of the grid), Page Down and Page Up by category. Up, Down and the page
 * keys keep `column` across shorter rows. Any other key is not the grid's.
 */
function gridStep(key: string, ctrl: boolean, at: number, column: number, rows: readonly Row[], sectionCount: number, rtl: boolean): GridStep | undefined {
  const rowIndex = rows.findLastIndex((row) => row.start <= at);
  const row = rows[rowIndex]!;
  const total = rows.at(-1)!.start + rows.at(-1)!.length;
  const inRow = (other: Row | undefined) => (other ? other.start + Math.min(column, other.length - 1) : undefined);
  const firstRowOf = (section: number) => rows.find((entry) => entry.section === section)!;
  const vertical = (next: number | undefined) => (next === undefined ? undefined : { next, column });
  if (key === "ArrowDown") return vertical(inRow(rows[rowIndex + 1]));
  if (key === "ArrowUp") return vertical(rowIndex === 0 ? -1 : inRow(rows[rowIndex - 1]));
  if (key === "PageDown") return vertical(inRow(row.section + 1 < sectionCount ? firstRowOf(row.section + 1) : rows.at(-1)));
  if (key === "PageUp") return vertical(inRow(firstRowOf(firstRowOf(row.section) === row ? Math.max(row.section - 1, 0) : row.section)));
  if (key === "Home" || key === "End") return { next: ctrl ? (key === "Home" ? 0 : total - 1) : row.start + stepInRow(key, at - row.start, row.length, false)! };
  if (key !== "ArrowRight" && key !== "ArrowLeft") return undefined;
  const forward = (key === "ArrowRight") !== rtl;
  return { next: Math.min(Math.max(at + (forward ? 1 : -1), 0), total - 1) };
}

/** The skin tones as a radio group, in place of the search while the person chooses. */
function ToneChoice({ tone, setTone, label, names, onDone }: { tone: EmojiSkinTone; setTone: (tone: EmojiSkinTone) => void; label: string; names: Readonly<Record<EmojiSkinTone, string>>; onDone: (returnFocus: boolean) => void }) {
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => group.current!.querySelector<HTMLElement>('[aria-checked="true"]')!.focus(), []);
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className="flex min-h-9 min-w-0 flex-1 items-center justify-between gap-1 pointer-coarse:min-h-11"
      // Keeps focus on the checked tone while another is pressed: Safari does not focus a
      // pressed button, and the row would close on the blur before the press lands.
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDone(true);
          return;
        }
        const arrows: Record<string, string> = { ArrowDown: "ArrowRight", ArrowUp: "ArrowLeft" };
        const key = arrows[event.key] ?? event.key;
        const next = stepInRow(key, emojiSkinTones.indexOf(tone), emojiSkinTones.length, key === event.key && isRtl(event.currentTarget));
        if (next === undefined) return;
        event.preventDefault();
        setTone(emojiSkinTones[next]!);
        event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]!.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDone(false);
      }}
    >
      {emojiSkinTones.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === tone}
          aria-label={names[option]}
          tabIndex={option === tone ? 0 : -1}
          data-ouro-control="emoji-picker"
          data-ouro-part="tone"
          className={toneOptionClass}
          onClick={() => {
            setTone(option);
            onDone(true);
          }}
        >
          <span aria-hidden="true">{toned(hand, option)}</span>
        </button>
      ))}
    </div>
  );
}

/** The raised hand the skin tone button and its choices show. */
const hand = { emoji: "✋", name: "", skinTones: true };

/** The categories' or results' grids, each labelled by its heading, which stays at the top as its emoji scroll. */
function Grids({ id, sections, rows, tone, active, sectionRefs }: { id: string; sections: readonly Section[]; rows: readonly Row[]; tone: EmojiSkinTone; active: number; sectionRefs: RefObject<(HTMLElement | null)[]> }) {
  return sections.map((section, index) => (
    <div
      key={index}
      ref={(element) => {
        sectionRefs.current[index] = element;
      }}
    >
      <div id={`${id}-s${index}`} className={headingClass}>
        {section.label}
      </div>
      <div role="grid" aria-labelledby={`${id}-s${index}`} className="grid">
        {rows
          .filter((row) => row.section === index)
          .map((row) => (
            <div role="row" key={row.start} className={gridClass}>
              {section.items.slice(row.start - section.start, row.start - section.start + row.length).map((item, offset) => (
                <div role="gridcell" key={offset} className="flex justify-center">
                  <Cell glyph={toned(item, tone)} name={item.name} index={row.start + offset} active={row.start + offset === active} quick={false} />
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  ));
}

function Panel({ categories, frequent, quick, tone, setTone, asSheet, labels, className, onChoose }: PanelProps): JSX.Element {
  const id = useId();
  const [query, setQuery] = useState("");
  const [activeCell, setActive] = useState(0);
  const [quickActive, setQuickActive] = useState(0);
  const [categoryActive, setCategoryActive] = useState(0);
  const [inView, setInView] = useState(0);
  const [hovered, setHovered] = useState<EmojiPickerEmoji | undefined>(undefined);
  const [choosingTone, setChoosingTone] = useState(false);
  const toneReturn = useRef(false);
  // The column Up and Down keep while they cross shorter rows, for the cell they last moved to.
  const sticky = useRef<{ at: number; column: number } | null>(null);
  // Where a category button scrolled the grid, so that scroll does not mark another category.
  const jumpedTo = useRef(-1);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const toneButtonRef = useRef<HTMLButtonElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  const { searching, results, sections, rows, total } = useSections(categories, frequent, query, labels);
  // The app can take emoji away while the picker is open; the Tab stop stays on the last one.
  const active = Math.min(activeCell, total - 1);
  const itemAt = (index: number) => {
    const section = sections.findLast((entry) => entry.start <= index)!;
    return section.items[index - section.start]!;
  };

  useAnnouncement(searching ? (results.length ? fillCount(labels.resultsLabel, results.length) : labels.noResultsLabel) : "");

  const tonesShown = offersTones(frequent) || offersTones(quick) || categories.some((category) => offersTones(category.emoji));

  useEffect(() => {
    if (!choosingTone && toneReturn.current) toneButtonRef.current!.focus();
    toneReturn.current = false;
  }, [choosingTone]);
  const doneChoosingTone = (returnFocus: boolean) => {
    toneReturn.current = returnFocus;
    setChoosingTone(false);
  };

  const focusCell = (index: number) => {
    setActive(index);
    scrollerRef.current!.querySelector<HTMLElement>(`[data-cell="${index}"]`)!.focus();
  };

  const target = (event: { target: EventTarget }) => (event.target as Element).closest<HTMLElement>("[data-cell]");

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const cell = target(event);
    if (!cell) return;
    const at = Number(cell.dataset.cell);
    const column = sticky.current?.at === at ? sticky.current.column : at - rows[rows.findLastIndex((row) => row.start <= at)]!.start;
    const step = gridStep(event.key, event.ctrlKey || event.metaKey, at, column, rows, sections.length, isRtl(event.currentTarget));
    if (!step) return;
    event.preventDefault();
    sticky.current = step.column === undefined ? null : { at: step.next, column: step.column };
    if (step.next < 0) searchRef.current!.focus();
    else focusCell(step.next);
  };

  const onRowKey = (event: KeyboardEvent<HTMLDivElement>, count: number, at: number, move: (index: number) => void) => {
    const next = stepInRow(event.key, at, count, isRtl(event.currentTarget));
    if (next === undefined) return;
    event.preventDefault();
    move(next);
    event.currentTarget.querySelectorAll<HTMLElement>("button")[next]!.focus();
  };

  const onScroll = () => {
    if (scrollerRef.current!.scrollTop === jumpedTo.current) return;
    jumpedTo.current = -1;
    const top = scrollerRef.current!.scrollTop + 1;
    // The first section starts at the top, so one always qualifies.
    setInView(sectionRefs.current.findLastIndex((section) => section !== null && section.offsetTop <= top));
  };

  const jumpTo = (index: number) => {
    setCategoryActive(index);
    setInView(index);
    scrollerRef.current!.scrollTop = sectionRefs.current[index]!.offsetTop;
    jumpedTo.current = scrollerRef.current!.scrollTop;
    // The cell sits just under its sticky heading, which its scroll margin clears, so focus does not scroll.
    focusCell(sections[index]!.start);
  };

  const preview = hovered ?? (total ? itemAt(active) : undefined);

  return (
    <div data-ouro="emoji-picker" className={cn(panelClass, asSheet ? "w-full" : "w-[21rem] max-w-full", className)}>
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        {choosingTone ? (
          <ToneChoice tone={tone} setTone={setTone} label={labels.skinToneLabel} names={labels.skinToneNames} onDone={doneChoosingTone} />
        ) : (
          <>
            <TextField
              ref={searchRef}
              type="search"
              label={labels.searchLabel}
              hideLabel
              placeholder={labels.searchLabel}
              clearable
              startAdornment={<SearchIcon />}
              value={query}
              className="min-w-0 flex-1"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActive(0);
                setHovered(undefined);
                scrollerRef.current!.scrollTop = 0;
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && total) {
                  event.preventDefault();
                  focusCell(active);
                } else if (event.key === "Enter" && searching && results.length) {
                  event.preventDefault();
                  onChoose(results[0]!, event);
                }
              }}
            />
            {tonesShown && (
              <Button
                ref={toneButtonRef}
                variant="plain"
                tone="secondary"
                aria-label={`${labels.skinToneLabel}: ${labels.skinToneNames[tone]}`}
                aria-expanded={false}
                data-ouro-control="emoji-picker"
                data-ouro-part="skin-tone"
                className="aspect-square shrink-0 px-0"
                onClick={() => setChoosingTone(true)}
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  {toned(hand, tone)}
                </span>
              </Button>
            )}
          </>
        )}
      </div>
      {quick?.length ? (
        <div
          role="toolbar"
          aria-label={labels.quickLabel}
          className={quickClass}
          onKeyDown={(event) => onRowKey(event, quick.length, quickActive, setQuickActive)}
          onClick={(event) => {
            const cell = target(event);
            if (cell) onChoose(quick[Number(cell.dataset.cell)]!, event);
          }}
        >
          {quick.map((item, index) => (
            <Cell key={index} glyph={toned(item, tone)} name={item.name} index={index} active={index === quickActive} quick />
          ))}
        </div>
      ) : null}
      {!searching && sections.length > 1 && (
        <div role="toolbar" aria-label={labels.categoriesLabel} className={barClass} onKeyDown={(event) => onRowKey(event, sections.length, categoryActive, setCategoryActive)}>
          {sections.map((section, index) => (
            <button
              key={index}
              type="button"
              aria-label={section.label}
              aria-current={index === inView ? "true" : undefined}
              tabIndex={index === categoryActive ? 0 : -1}
              data-ouro-control="emoji-picker"
              data-ouro-part="category"
              className={barButtonClass}
              onClick={() => jumpTo(index)}
            >
              <span aria-hidden="true" className="flex items-center justify-center">
                {section.icon}
              </span>
            </button>
          ))}
        </div>
      )}
      <div
        ref={scrollerRef}
        className={scrollerClass}
        onScroll={onScroll}
        onKeyDown={onGridKey}
        onClick={(event) => {
          const cell = target(event);
          if (cell) onChoose(itemAt(Number(cell.dataset.cell)), event);
        }}
        onPointerOver={(event) => {
          const cell = target(event);
          if (cell && event.pointerType === "mouse") setHovered(itemAt(Number(cell.dataset.cell)));
        }}
        onPointerLeave={() => setHovered(undefined)}
        onFocus={(event) => {
          const cell = target(event);
          if (cell) setActive(Number(cell.dataset.cell));
        }}
      >
        {total === 0 ? (
          <p className="m-0 px-1 py-6 text-sm leading-5 text-muted-foreground">{searching ? labels.noResultsLabel : null}</p>
        ) : (
          <Grids id={id} sections={sections} rows={rows} tone={tone} active={active} sectionRefs={sectionRefs} />
        )}
      </div>
      <div aria-hidden="true" className={previewClass}>
        {preview && (
          <>
            <span className={previewGlyphClass}>{toned(preview, tone)}</span>
            <span className="min-w-0 truncate">{preview.name}</span>
          </>
        )}
      </div>
    </div>
  );
}
