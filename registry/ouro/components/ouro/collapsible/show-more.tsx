"use client";

import { Fragment, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type JSX, type MouseEvent, type ReactNode, type Ref } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { serverElement } from "@/registry/ouro/lib/ouro/server-element";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import {
  foldClass,
  itemClass,
  listClass,
  showMoreHint,
  showMoreRootClass,
  textClass,
} from "@/registry/ouro/components/ouro/collapsible/collapsible-styles";

/**
 * Props every ShowMore takes.
 *
 * @claim "Props every ShowMore takes" registry/ouro/components/ouro/collapsible/show-more.tsx verify:fileLine(registry/ouro/components/ouro/collapsible/show-more.tsx, /export\sinterface\sShowMoreListProps\sextends\sShowMoreBaseProps/)
 * @claim "Props every ShowMore takes" registry/ouro/components/ouro/collapsible/show-more.tsx verify:fileLine(registry/ouro/components/ouro/collapsible/show-more.tsx, /export\stype\sShowMoreLinesProps\s=\sShowMoreBaseProps\s&/)
 */
export interface ShowMoreBaseProps {
  /** The button's text while there is more to show. Translate it here. @default "Show more" */
  showMoreLabel?: string | undefined;
  /** Layout only: margins, width, grid placement (`mt-6`). Text classes go on a parent so the items inherit them. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `lines`: `<ShowMore lines={3}>`. */
  maxLines?: { 'Use <ShowMore lines={3}>': never };
  /** Not a prop. Ouro UI uses `initialCount`: `<ShowMore items={items} initialCount={5}>`. */
  limit?: { 'Use <ShowMore items={items} initialCount={5}>': never };
}

/**
 * Whether the content shows in full, for a ShowMore that can show less again (text, height and a cut
 * list), when the app sets it: to reveal a match from find in page, or a linked anchor below the fold.
 */
export interface ShowMoreOpenProps {
  /**
   * Whether the content shows in full. With it, the app owns the state: "Show more" and "Show less"
   * ask for the change through `onOpenChange`, and nothing changes until the app sets `open`.
   * Without it, ShowMore keeps its own state, starting folded.
   * @claim "With it, the app owns the state" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore open > follows open in each mode, and its buttons ask onOpenChange without changing it)
   */
  open?: boolean | undefined;
  /**
   * Called with the new state when the button is pressed, or when keyboard focus moving below
   * a `maxHeight` fold unfolds it, whether or not `open` is set.
   * @claim "Called with the new state when the button is pressed" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore open > follows open in each mode, and its buttons ask onOpenChange without changing it)
   * @claim "whether or not `open` is set" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore open > tells onOpenChange each change of its own state when open is not set)
   */
  onOpenChange?: ((open: boolean) => void) | undefined;
}

/**
 * What folded content holds, for ShowMore's first guess at whether it is longer than its fold, when its elements cannot
 * say: a message's own components, or pictures that size themselves.
 */
export interface ShowMoreEstimate {
  /**
   * Its plain text, as a reader would read it, with its line breaks, each of which starts a line as it shows.
   * @claim "with its line breaks, each of which" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > counts each line of an estimate's text, as it shows with its line breaks)
   */
  text?: string | undefined;
  /** The CSS pixels its pictures, cards and other blocks of known size take, besides the text. @default 0 */
  height?: number | undefined;
}

/** Long text clamped to `lines` lines, with "Show more" and "Show less". */
export type ShowMoreLinesProps = ShowMoreBaseProps & ShowMoreOpenProps & {
  /** How many lines show while collapsed. The button appears only when the text is longer. */
  lines: number;
  /**
   * The text. Screen readers always read all of it.
   *
   * @claim "Screen readers always read all of" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with lines > keeps the full text for screen readers and in server HTML)
   */
  children: ReactNode;
  /**
   * The button's text while everything shows. Translate it here. @default "Show less"
   *
   * @claim "The button's text while everything shows" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with items > takes translated labels)
   */
  showLessLabel?: string | undefined;
  /**
   * What the content holds, when its elements cannot say (your own components, pictures that size themselves): its
   * plain text and the pixels its pictures and cards take. ShowMore decides whether to start folded from it, before
   * anything is laid out, as it does from text and sized elements it can see: content clearly short shows whole from the
   * first frame, and long content starts folded. Without it, content holding a component or a picture with no height
   * starts folded, and shows whole a frame later if it fits.
   *
   * @claim "Without it, content holding a component" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > starts folded, with its button, when the content is not clearly short: %s)
   * @claim "Without it, content holding a component" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > corrects a guess from the browser's layout: folded content that fits shows whole, and text that wraps more than guessed gets its button)
   * @claim "content clearly short shows whole from" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > takes an estimate for what it cannot see: a short message whole from the first frame, a long one folded)
   */
  estimate?: ShowMoreEstimate | undefined;
  /** Not with `lines`: fold by height or by lines, not both. */
  maxHeight?: never;
  /** List modes only: not with `lines`. */
  items?: never;
  /**
   * Only with `items` and no `onShowMore`.
   *
   * @claim "Only with `items` and no `onShowMore`" registry/ouro/components/ouro/collapsible/show-more.test-d.ts verify:fileLine(registry/ouro/components/ouro/collapsible/show-more.test-d.ts, /initialCount:\s3;\sonShowMore:\s\(\)\s=>\svoid;\shasMore:\strue\s\}>\(\)\.not\.toExtend/)
   */
  initialCount?: never;
  /** List modes only: not with `lines`. */
  ordered?: never;
  /** Only for a list that loads more: with `items`, without `initialCount` or `lines`. */
  onShowMore?: never;
  /** Only with `onShowMore`. */
  hasMore?: never;
  /** Only with `onShowMore`. */
  loading?: never;
  /** Only with `onShowMore`. */
  loadingLabel?: never;
  /** Only with `onShowMore`. */
  loadedLabel?: never;
  /** Only with `onShowMore`. */
  noMoreLabel?: never;
  /** Only with `onShowMore`. */
  href?: never;
};

/** Long content of any kind folded to `maxHeight` pixels under a fade, with "Show more" and "Show less". */
export type ShowMoreHeightProps = ShowMoreBaseProps & ShowMoreOpenProps & {
  /**
   * How tall the content shows while folded, in CSS pixels, with its last part fading out.
   * Content at most a fifth taller shows whole, since a button that reveals a line or two
   * helps nobody. The button appears only when the content is folded.
   *
   * @claim "Content at most a fifth taller" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with maxHeight > shows content a little taller than maxHeight whole, with no button)
   */
  maxHeight: number;
  /**
   * The content: rich text, pictures, cards. Screen readers always read all of it, and
   * moving keyboard focus into the folded part unfolds it, so nothing focusable is out of sight.
   *
   * @claim "moving keyboard focus into the folded" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with maxHeight > unfolds when keyboard focus moves into the folded part)
   */
  children: ReactNode;
  /**
   * The button's text while everything shows. Translate it here. @default "Show less"
   *
   * @claim "The button's text while everything shows" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with maxHeight > unfolds when keyboard focus moves into the folded part)
   */
  showLessLabel?: string | undefined;
  /**
   * What the content holds, when its elements cannot say (your own components, pictures that size themselves): its
   * plain text and the pixels its pictures and cards take. ShowMore decides whether to start folded from it, before
   * anything is laid out, as it does from text and sized elements it can see: content clearly short shows whole from the
   * first frame, and long content starts folded. Without it, content holding a component or a picture with no height
   * starts folded, and shows whole a frame later if it fits.
   *
   * @claim "Without it, content holding a component" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > starts folded, with its button, when the content is not clearly short: %s)
   * @claim "Without it, content holding a component" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > corrects a guess from the browser's layout: folded content that fits shows whole, and text that wraps more than guessed gets its button)
   * @claim "content clearly short shows whole from" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > takes an estimate for what it cannot see: a short message whole from the first frame, a long one folded)
   */
  estimate?: ShowMoreEstimate | undefined;
  /** Not with `maxHeight`: fold by height or by lines, not both. */
  lines?: never;
  /** List modes only: not with `maxHeight`. */
  items?: never;
  /**
   * Only with `items` and no `onShowMore`.
   *
   * @claim "Only with `items` and no `onShowMore`" registry/ouro/components/ouro/collapsible/show-more.test-d.ts verify:fileLine(registry/ouro/components/ouro/collapsible/show-more.test-d.ts, /initialCount:\s3;\sonShowMore:\s\(\)\s=>\svoid;\shasMore:\strue\s\}>\(\)\.not\.toExtend/)
   */
  initialCount?: never;
  /** List modes only: not with `maxHeight`. */
  ordered?: never;
  /** Only for a list that loads more: with `items`, without `initialCount` or `lines`. */
  onShowMore?: never;
  /** Only with `onShowMore`. */
  hasMore?: never;
  /** Only with `onShowMore`. */
  loading?: never;
  /** Only with `onShowMore`. */
  loadingLabel?: never;
  /** Only with `onShowMore`. */
  loadedLabel?: never;
  /** Only with `onShowMore`. */
  noMoreLabel?: never;
  /** Only with `onShowMore`. */
  href?: never;
};

/** Props both list modes take. */
export interface ShowMoreListProps extends ShowMoreBaseProps {
  /**
   * Every item, in order. Each renders in its own list item; give elements a `key`. With
   * `onShowMore`, append each new page here.
   * @claim "Every item, in order" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with items > shows initialCount items and an ordered list with ordered)
   * @claim "Each renders in its own list" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with items > shows initialCount items and an ordered list with ordered)
   * @claim "With `onShowMore`, append each new page" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with items a Server Component passed > knows an appended page from a replaced list, and focuses the first new item)
   */
  items: readonly ReactNode[];
  /** Renders an `<ol>`, for a ranked or numbered list. @default false (`<ul>`) */
  ordered?: boolean | undefined;
  /** Text mode only: not with `items`. */
  /** Text and height modes only: a list shows its first items. */
  estimate?: never;
  lines?: never;
  /** Height mode only: not with `items`. */
  maxHeight?: never;
  /** Text mode only: a list takes `items`. */
  children?: never;
}

/** A list cut to its first `initialCount` items, with "Show more" and "Show less". */
export type ShowMoreItemsProps = ShowMoreListProps & ShowMoreOpenProps & {
  /** How many items show while collapsed. @default 5 */
  initialCount?: number | undefined;
  /**
   * The button's text while everything shows. Translate it here. @default "Show less"
   *
   * @claim "The button's text while everything shows" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with items > takes translated labels)
   */
  showLessLabel?: string | undefined;
  /** Only for a list that loads more: with `items`, without `initialCount` or `lines`. */
  onShowMore?: never;
  /** Only with `onShowMore`. */
  hasMore?: never;
  /** Only with `onShowMore`. */
  loading?: never;
  /** Only with `onShowMore`. */
  loadingLabel?: never;
  /** Only with `onShowMore`. */
  loadedLabel?: never;
  /** Only with `onShowMore`. */
  noMoreLabel?: never;
  /** Only with `onShowMore`. */
  href?: never;
};

/** A list the server grows a page at a time: "Show more" asks for the next page and appends it. */
export type ShowMoreLoadProps = ShowMoreListProps & {
  /** Asks for the next page. The button is busy while `loading`, and focus moves to the first new item when it arrives. */
  onShowMore: () => void;
  /** Whether there is another page. Without one, the button goes away. */
  hasMore: boolean;
  /** Shows the button as busy, and keeps it from asking twice. */
  loading?: boolean | undefined;
  /** What screen readers hear when loading starts. Translate it here. @default "Loading" */
  loadingLabel?: string | undefined;
  /**
   * What screen readers hear after each page, from the number of items now shown. Name the
   * items and translate it here: `(count) => \`Showing ${count} recipes\``.
   * @default (count) => `Showing ${count} items`
   * @claim "What screen readers hear after each" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore announcements > says how many items show after each page, through a polite status region)
   */
  loadedLabel?: ((count: number) => string) | undefined;
  /**
   * What screen readers hear when a page comes back empty and there is no more. Translate it here. @default "No more items"
   *
   * @claim "What screen readers hear when a" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore announcements > says there are no more items when a later page comes back empty, in the words of noMoreLabel)
   */
  noMoreLabel?: string | undefined;
  /**
   * The next page's URL, so the button is a link that works before JavaScript loads. With
   * JavaScript, pressing it calls `onShowMore` instead.
   */
  href?: string | undefined;
  /**
   * Only with `items` and no `onShowMore`.
   *
   * @claim "Only with `items` and no `onShowMore`" registry/ouro/components/ouro/collapsible/show-more.test-d.ts verify:fileLine(registry/ouro/components/ouro/collapsible/show-more.test-d.ts, /initialCount:\s3;\sonShowMore:\s\(\)\s=>\svoid;\shasMore:\strue\s\}>\(\)\.not\.toExtend/)
   */
  initialCount?: never;
  /** Not for a list that loads more, which only grows. */
  open?: never;
  /** Not for a list that loads more, which only grows. */
  onOpenChange?: never;
  /**
   * A list that loads more never shrinks, so it has no "Show less".
   *
   * @claim "A list that loads more never" registry/ouro/components/ouro/collapsible/show-more.test-d.ts verify:fileLine(registry/ouro/components/ouro/collapsible/show-more.test-d.ts, /showLessLabel:\s"Less"\s\}>\(\)\.not\.toExtend/)
   */
  showLessLabel?: never;
};

/**
 * Props for {@link ShowMore}: clamp text with `lines`, fold any content with `maxHeight`, cut a
 * list with `items`, or grow it from the server with `onShowMore`.
 */
export type ShowMoreProps = ShowMoreLinesProps | ShowMoreHeightProps | ShowMoreItemsProps | ShowMoreLoadProps;

const DEFAULT_COUNT = 5;
const DEFAULT_LINES = 3;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focuses the first focusable thing in a row, or the row itself. */
function focusRow(row: Element): void {
  (row.querySelector<HTMLElement>(FOCUSABLE) ?? (row as HTMLElement)).focus();
}

/** The first item of a list that was empty when "Show more" was pressed: any first page is new items. */
const EMPTY = Symbol("empty");

/**
 * What stays the same for an item across renders: an element's key, or a text or number item
 * itself. An element without a key is a new object every render, so it has none (null).
 * @claim "An element without a key is" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with items a Server Component passed > keys each row by its item's own key, so a row keeps its node when the order changes)
 */
function identity(item: ReactNode): unknown {
  // An item a Server Component passed can be a lazy wrapper, a new object on every payload.
  const element = serverElement(item);
  if (isValidElement(element)) return element.key;
  return element;
}

/** The row's key: the item's own key, or its place in the list. */
function rowKey(item: ReactNode, index: number): string | number {
  const element = serverElement(item);
  return isValidElement(element) && element.key !== null ? element.key : index;
}

/**
 * Whether the content shows in full: `open` when the app sets it, else ShowMore's own state, and
 * a setter that tells `onOpenChange` and keeps the asked-for state, which shows once `open` is unset.
 */
function useOpen(open: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined): [boolean, (next: boolean) => void] {
  const [own, setOwn] = useState(false);
  const set = (next: boolean) => {
    setOwn(next);
    onOpenChange?.(next);
  };
  return [open ?? own, set];
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
const isHeight = (value: unknown): value is number => Number.isFinite(value) && (value as number) > 0;
const DEFAULT_HEIGHT = 240;

/**
 * "Show more" for a long list or a long text. It cuts a list to its first items, clamps text
 * to a number of lines, folds content of any kind (a long post with pictures) to a height
 * under a fade, or grows a list a page at a time from the server, and moves focus to
 * the first newly shown item, so keyboard and screen reader users land on what they asked
 * for. A list that loads more also says how many items now show. The button names what it
 * folds (`aria-controls`) and, unless it loads more, says whether it is open (`aria-expanded`).
 * Folded text and content have their button in the first frame and in server HTML: ShowMore
 * guesses whether they are longer than the fold from their text and the sizes their elements
 * give, reading no layout, and corrects a wrong guess from the browser's own layout a frame later,
 * so a long list of folded messages lays the page out no more often than one without them. The
 * guess leans folded: content shows whole from the start only when it is clearly short and the
 * guess saw all of it (no component and no picture without a height), so a wrong guess costs a
 * button that goes a frame later, never a box that shrinks.
 * The visible items are in the server HTML. ShowMore draws the list itself: put a border
 * around the list on a wrapping element, and borders between rows on each item.
 *
 * Use `Collapsible` instead to hide a whole section behind its title. Use `Pagination`
 * instead when people need to jump to a page or share its URL.
 *
 * @group Lists
 * @see https://ui.ouro.bot/docs/show-more
 *
 * @example
 * <ShowMore items={reviews.map((review) => <Review key={review.id} {...review} />)} initialCount={3} />
 * <ShowMore lines={3}>{recipe.description}</ShowMore>
 * <ShowMore maxHeight={180}><Post body={post.body} /></ShowMore>
 * <ShowMore items={rows} hasMore={Boolean(nextCursor)} loading={loading} onShowMore={loadNext} href={nextHref} />
 * <ShowMore lines={3} open={open} onOpenChange={setOpen}>{recipe.description}</ShowMore>
 * @claim "The button names what it folds" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore toggle semantics > names the list, the text or the fold it opens and says whether it is open, in every mode that folds)
 * @claim "The button names what it folds" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore toggle semantics > names the list a load adds to, and claims no open state, since loading more never folds)
 * @claim "folds content of any kind" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with maxHeight > folds long content to maxHeight under a fade, with Show more)
 * @claim "Folded text and content have their" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore in its first frame > with %s, has its button as React commits it, so nothing below it moves a frame later)
 * @claim "guesses whether they are longer than" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore in a long list > with %s, mounts 50 folded with their buttons and reads no layout as it commits, so it never lays the page out once per instance)
 * @claim "The guess leans folded: content shows" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > starts folded, with its button, when the content is not clearly short: %s)
 * @claim "The guess leans folded: content shows" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > shows content clearly short and all seen whole from the start: %s)
 * @claim "corrects a wrong guess from the browser's" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > corrects a guess from the browser's layout: folded content that fits shows whole, and text that wraps more than guessed gets its button)
 * @claim "ShowMore draws the list itself: put" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore with items > lets app layout classes win and keys rows by their own keys)
 */
export function ShowMore(props: ShowMoreProps): JSX.Element {
  const { showMoreLabel = "Show more", className, ref, maxLines, limit } = props;
  const { lines, initialCount, items, maxHeight } = props;
  useAppearanceClassNameCheck(
    "ShowMore",
    className,
    process.env.NODE_ENV !== "production" ? showMoreHint : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ShowMore",
    process.env.NODE_ENV !== "production"
      ? () => [
          maxLines !== undefined && ["maxLines is not a prop", `<ShowMore lines={${String(maxLines)}}>`],
          limit !== undefined && ["limit is not a prop", `<ShowMore items={items} initialCount={${String(limit)}}>`],
          initialCount !== undefined &&
            !isCount(initialCount) && [
              `initialCount={${String(initialCount)}} is not a whole number above 0`,
              `<ShowMore items={items} initialCount={${DEFAULT_COUNT}}>`,
            ],
          lines !== undefined &&
            !isCount(lines) && [`lines={${String(lines)}} is not a whole number above 0`, `<ShowMore lines={${DEFAULT_LINES}}>`],
          maxHeight !== undefined &&
            !isHeight(maxHeight) && [`maxHeight={${String(maxHeight)}} is not a number of pixels above 0`, `<ShowMore maxHeight={${DEFAULT_HEIGHT}}>`],
          (props as ShowMoreOpenProps).open !== undefined &&
            (props as ShowMoreOpenProps).onOpenChange === undefined && ["open without onOpenChange: its button can't change it", "<ShowMore open={open} onOpenChange={setOpen}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  if (items === undefined && maxHeight !== undefined) {
    const { children, showLessLabel = "Show less", open, onOpenChange, estimate } = props as ShowMoreHeightProps;
    return (
      <ShowMoreHeight
        estimate={estimate}
        open={open}
        onOpenChange={onOpenChange}
        maxHeight={isHeight(maxHeight) ? maxHeight : DEFAULT_HEIGHT}
        showMoreLabel={showMoreLabel}
        showLessLabel={showLessLabel}
        className={className}
        rootRef={ref}
      >
        {children}
      </ShowMoreHeight>
    );
  }
  if (items === undefined) {
    // Text mode. A guessed maxLines (a type error) still clamps, as lines would.
    const { children, showLessLabel = "Show less", open, onOpenChange, estimate } = props as ShowMoreLinesProps;
    const clamp = [lines, maxLines].find(isCount) ?? DEFAULT_LINES;
    return (
      <ShowMoreText
        estimate={estimate}
        open={open}
        onOpenChange={onOpenChange}
        lines={clamp}
        showMoreLabel={showMoreLabel}
        showLessLabel={showLessLabel}
        className={className}
        rootRef={ref}
      >
        {children}
      </ShowMoreText>
    );
  }
  return <ShowMoreList {...(props as ShowMoreItemsProps | ShowMoreLoadProps)} showMoreLabel={showMoreLabel} />;
}

const clampClass = "line-clamp-(--ouro-show-more-lines)";

// A first guess at whether content is longer than its fold, made from what the app passes, before anything is laid out: so
// the fold and its button are in the first commit, and the same on the server, with no layout read per instance. It leans
// folded: content shows whole at first only when it is clearly short and the guess saw all of it, so a wrong guess costs a
// button that goes a frame later, inside a box already folded, never a box that shrinks. A ResizeObserver then corrects it
// from the browser's own layout.
/** Characters a line holds, roughly: a message bubble's width of text. */
const GUESS_LINE = 60;
/** A line's height in px, roughly. */
const GUESS_LINE_HEIGHT = 24;
/**
 * Wide characters (CJK, Hangul, full-width forms), which take about two of a line's characters each.
 * @claim "Wide characters (CJK, Hangul, full-width forms)" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > starts folded, with its button, when the content is not clearly short: %s)
 * @claim "Wide characters (CJK, Hangul, full-width forms)" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > takes an estimate for what it cannot see: a short message whole from the first frame, a long one folded)
 */
const wide = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/g;
/** Elements that start a block, and so a line, of their own. */
const blocks = new Set(["p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "table", "tr", "figure", "hr", "br", "section", "article", "dl", "dt", "dd"]);
/**
 * Elements whose size only their content says: a picture with no height given.
 * @claim "Elements whose size only their content" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > starts folded, with its button, when the content is not clearly short: %s)
 */
const media = new Set(["img", "picture", "video", "canvas", "iframe", "object", "embed"]);

/**
 * The text in `node`, in lines of GUESS_LINE characters and blocks, and the px its elements give themselves, and whether
 * anything in it is unseen: a component (what it renders is its own) or a picture with no height.
 * @claim "The text in `node`, in lines" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > starts folded, with its button, when the content is not clearly short: %s)
 * @claim "The text in `node`, in lines" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > shows content clearly short and all seen whole from the start: %s)
 */
function guessSize(node: ReactNode | ShowMoreEstimate): { lines: number; px: number; unseen: boolean } {
  if (isEstimate(node)) {
    // An app's own text renders with its line breaks (a message's paragraphs), so each line counts on its own.
    // Stryker disable next-line StringLiteral: an empty text and any text under one line both count as one line, so the fallback is not observable.
    const lines = (node.text ?? "").split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length + (line.match(wide)?.length ?? 0)) / GUESS_LINE)), 0);
    return { lines, px: node.height ?? 0, unseen: false };
  }
  let chars = 0;
  let blocksSeen = 0;
  let px = 0;
  let unseen = false;
  const visit = (each: ReactNode): void => {
    if (typeof each === "string" || typeof each === "number") {
      const text = String(each);
      chars += text.length + (text.match(wide)?.length ?? 0);
    } else if (Array.isArray(each)) each.forEach(visit);
    else if (isValidElement<{ children?: ReactNode; height?: unknown; style?: CSSProperties }>(each)) {
      const { type, props } = each;
      // A fragment only groups; any other component renders what it likes.
      if (type !== Fragment && typeof type !== "string") unseen = true;
      const height = typeof props.height === "number" ? props.height : props.style?.height;
      if (typeof height === "number") px += height;
      else if (typeof type === "string" && media.has(type)) unseen = true;
      if (typeof type === "string" && blocks.has(type)) blocksSeen++;
      visit(props.children);
    }
  };
  visit(node);
  return { lines: Math.ceil(chars / GUESS_LINE) + blocksSeen, px, unseen };
}

/**
 * Whether `node` is an app's estimate rather than content: a plain object, which no React node is.
 * @claim "Whether `node` is an app's estimate" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > takes an estimate for what it cannot see: a short message whole from the first frame, a long one folded)
 */
const isEstimate = (node: ReactNode | ShowMoreEstimate): node is ShowMoreEstimate =>
  typeof node === "object" && node !== null && !Array.isArray(node) && !isValidElement(node) && Object.getPrototypeOf(node) === Object.prototype;

/**
 * Whether `node` is clearly shorter than `lines` lines: half of them or fewer, and all of it seen.
 * @claim "Whether `node` is clearly shorter than `lines`" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > gives text its button from the start unless it is clearly within half its lines)
 */
const clearlyFewerLines = (node: ReactNode | ShowMoreEstimate, lines: number) => {
  const size = guessSize(node);
  // A picture or card of a known height takes the lines it is as tall as.
  return !size.unseen && size.lines + Math.ceil(size.px / GUESS_LINE_HEIGHT) <= lines / 2;
};

/**
 * Whether `node` is clearly shorter than `height` px: half of it or less, and all of it seen.
 * @claim "Whether `node` is clearly shorter than `height`" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > shows content clearly short and all seen whole from the start: %s)
 * @claim "Whether `node` is clearly shorter than `height`" registry/ouro/components/ouro/collapsible/show-more.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/show-more.test.tsx::ShowMore's first guess > starts folded, with its button, when the content is not clearly short: %s)
 */
const clearlyShorter = (node: ReactNode | ShowMoreEstimate, height: number) => {
  const size = guessSize(node);
  return !size.unseen && size.lines * GUESS_LINE_HEIGHT + size.px <= height / 2;
};

function ShowMoreText({
  estimate,
  open,
  onOpenChange,
  lines,
  children,
  showMoreLabel,
  showLessLabel,
  className,
  rootRef,
}: {
  estimate: ShowMoreEstimate | undefined;
  lines: number;
  children: ReactNode;
  showMoreLabel: string;
  showLessLabel: string;
  className: string | undefined;
  rootRef: Ref<HTMLDivElement> | undefined;
} & ShowMoreOpenProps): JSX.Element {
  const [expanded, setExpanded] = useOpen(open, onOpenChange);
  // Guessed from the text, so the button is in the first commit and in server HTML, then corrected from the browser's own
  // layout: a ResizeObserver reads after the browser lays the text out, and writes nothing, so no instance makes it lay
  // the page out again.
  const [overflowing, setOverflowing] = useState(() => !clearlyFewerLines(estimate ?? children, lines));
  // What the text says, as the guess reads it with no layout: the observer starts again only when that changes, not each time
  // the app renders the same text anew. A change it cannot see that resizes the text, the observer sees.
  const size = guessSize(estimate ?? children);
  const said = `${size.lines}:${size.px}:${size.unseen}`;
  const textRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  useEffect(() => {
    const text = textRef.current!;
    const observer = new ResizeObserver(() => {
      // Clamped, whether it hides any; whole, whether it is taller than the lines it clamps to.
      const clamped = !expanded;
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
      // Stryker disable next-line EqualityOperator: a hidden line is many pixels, so > and >= differ only at a 1px rounding gap no text has
      if (clamped) setOverflowing(text.scrollHeight > text.clientHeight + 1);
      // Stryker disable next-line EqualityOperator: as above, a line is many pixels.
      else if (lineHeight > 0) setOverflowing(text.clientHeight > lineHeight * lines + 1);
    });
    observer.observe(text);
    return () => observer.disconnect();
  }, [expanded, said, lines]);
  return (
    <div ref={rootRef} data-ouro="show-more" className={cn(showMoreRootClass, className)}>
      <div
        ref={textRef}
        id={textId}
        data-ouro-show-more-text=""
        className={cn(textClass, !expanded && clampClass)}
        style={{ "--ouro-show-more-lines": lines } as CSSProperties}
      >
        {children}
      </div>
      {overflowing && (
        <Button
          variant="plain"
          size="sm"
          className="-ms-(--ouro-button-px)"
          data-ouro-show-more-toggle=""
          data-ouro-control="show-more"
          data-ouro-part="toggle"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? showLessLabel : showMoreLabel}
        </Button>
      )}
    </div>
  );
}

function ShowMoreHeight({
  estimate,
  open,
  onOpenChange,
  maxHeight,
  children,
  showMoreLabel,
  showLessLabel,
  className,
  rootRef,
}: {
  estimate: ShowMoreEstimate | undefined;
  maxHeight: number;
  children: ReactNode;
  showMoreLabel: string;
  showLessLabel: string;
  className: string | undefined;
  rootRef: Ref<HTMLDivElement> | undefined;
} & ShowMoreOpenProps): JSX.Element {
  const [expanded, setExpanded] = useOpen(open, onOpenChange);
  // Guessed from the content, so the fold and its button are in the first commit and in server HTML, then corrected from
  // the browser's own layout: the ResizeObserver reads after the browser lays the content out, and writes nothing.
  const [fits, setFits] = useState(() => clearlyShorter(estimate ?? children, maxHeight));
  const contentRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const foldId = useId();
  useEffect(() => {
    const content = contentRef.current!;
    // The observer measures once as it starts, and again on every change of size.
    const observer = new ResizeObserver(() => setFits(content.scrollHeight <= maxHeight * 1.2));
    observer.observe(content);
    return () => observer.disconnect();
  }, [maxHeight]);
  const folded = !expanded && !fits;
  const toggle = () => {
    if (expanded) {
      setExpanded(false);
      // The content shrinks above the button; keep the button on screen.
      requestAnimationFrame(() => buttonRef.current?.scrollIntoView({ block: "nearest" }));
    } else setExpanded(true);
  };
  // Focus that lands below the fold (a link, a button in a card) unfolds the content.
  const reveal = (event: FocusEvent<HTMLDivElement>) => {
    // Unfolded, nothing is below the box's bottom, so this is folded content only.
    const fold = event.currentTarget;
    // The browser may already have scrolled the clipped box to the focused element, so measure
    // from the box's unscrolled top.
    const bottom = (event.target as HTMLElement).getBoundingClientRect().bottom - fold.getBoundingClientRect().top + fold.scrollTop;
    if (bottom > fold.clientHeight) {
      fold.scrollTop = 0;
      setExpanded(true);
    }
  };
  return (
    <div ref={rootRef} data-ouro="show-more" className={cn(showMoreRootClass, className)}>
      <div
        id={foldId}
        data-ouro-show-more-fold=""
        data-folded={folded ? "" : undefined}
        onFocus={reveal}
        className={cn(foldClass, folded && "max-h-(--ouro-show-more-height) overflow-hidden")}
        style={{ "--ouro-show-more-height": `${maxHeight}px` } as CSSProperties}
      >
        <div ref={contentRef} className="flow-root">
          {children}
        </div>
      </div>
      {!fits && (
        <Button
          ref={buttonRef}
          variant="plain"
          size="sm"
          className="-ms-(--ouro-button-px)"
          data-ouro-show-more-toggle=""
          data-ouro-control="show-more"
          data-ouro-part="toggle"
          aria-expanded={expanded}
          aria-controls={foldId}
          onClick={toggle}
        >
          {expanded ? showLessLabel : showMoreLabel}
        </Button>
      )}
    </div>
  );
}

function ShowMoreList(props: (ShowMoreItemsProps | ShowMoreLoadProps) & { showMoreLabel: string }): JSX.Element {
  const { items, ordered, showMoreLabel, className, ref } = props;
  const load = props.onShowMore !== undefined ? (props as ShowMoreLoadProps) : undefined;
  const { initialCount, showLessLabel = "Show less", open, onOpenChange } = props as ShowMoreItemsProps;
  const count = isCount(initialCount) ? initialCount : DEFAULT_COUNT;
  const [expanded, setExpanded] = useOpen(open, onOpenChange);
  // Rows from this index on are newly shown: they fade in.
  const [freshFrom, setFreshFrom] = useState<number | null>(null);
  // The index of the first row the last press asked for, until focus has moved there, and the
  // first item when it was asked: a different first item means a new list, not the next page.
  const pending = useRef<number | null>(null);
  const pendingFirst = useRef<unknown>(undefined);
  const listRef = useRef<HTMLUListElement & HTMLOListElement>(null);
  const buttonRef = useRef<HTMLElement>(null);
  const listId = useId();
  const loading = load?.loading === true;
  const visible = load || expanded ? items : items.slice(0, count);
  const hasButton = load ? load.hasMore : items.length > count;

  // What the status region says after a page loads (load mode only).
  const [status, setStatus] = useState("");
  // Whether `loading` was true since the last press, so a load that ends with no new items is noticed.
  const loaded = useRef(false);
  const loadedLabel = load?.loadedLabel ?? ((shown: number) => `Showing ${shown} items`);
  const noMoreLabel = load?.noMoreLabel ?? "No more items";

  useEffect(() => {
    const from = pending.current;
    if (from === null) return;
    if (loading) {
      loaded.current = true;
      return;
    }
    const rows = listRef.current!.children;
    const stop = () => {
      pending.current = null;
      loaded.current = false;
    };
    const arrive = (row: Element | undefined, message: string) => {
      stop();
      // The button is gone. An empty list whose load found nothing has no row, so focus moves
      // to the list itself (focusable and named by noMoreLabel while empty), never to the page.
      if (row) focusRow(row);
      else listRef.current!.focus();
      if (load) setStatus(message);
    };
    const replaced = pendingFirst.current !== EMPTY && identity(items[0]) !== pendingFirst.current;
    if (replaced || rows.length < from) {
      // The list was replaced (a new first item, or fewer items: a new search). Stop waiting,
      // so a later change to the list never moves focus.
      stop();
    } else if (rows.length > from) {
      arrive(rows[from]!, loadedLabel(rows.length));
    } else if (!hasButton) {
      // The last page came back empty and the button is gone: keep focus in the list.
      arrive(rows[rows.length - 1], noMoreLabel);
    } else if (loaded.current) {
      // The load ended with no new items (it failed): stop waiting, as above.
      stop();
    }
  });

  const press = (event: MouseEvent) => {
    if (load) {
      event.preventDefault();
      pending.current = items.length;
      pendingFirst.current = items.length === 0 ? EMPTY : identity(items[0]);
      loaded.current = false;
      setFreshFrom(items.length);
      load.onShowMore();
    } else if (expanded) {
      setExpanded(false);
      setFreshFrom(null);
      // The list shrinks above the button; keep the button on screen.
      requestAnimationFrame(() => buttonRef.current?.scrollIntoView({ block: "nearest" }));
    } else {
      pending.current = count;
      // The button shows only when there are more items than count, so the list is not empty.
      pendingFirst.current = identity(items[0]);
      setFreshFrom(count);
      setExpanded(true);
    }
  };

  const List = ordered ? "ol" : "ul";
  // An empty list with nothing more to load takes focus when the last load finds nothing, so it
  // is named for that already when focus lands.
  const emptyEnd = load !== undefined && items.length === 0 && !load.hasMore;
  const button = !hasButton ? null : load ? (
    <Button
      ref={buttonRef as Ref<HTMLAnchorElement & HTMLButtonElement>}
      variant="plain"
      size="sm"
      className="-ms-(--ouro-button-px)"
      data-ouro-show-more-toggle="" data-ouro-control="show-more" data-ouro-part="toggle"
      aria-controls={listId}
      loading={loading}
      loadingLabel={load.loadingLabel}
      onClick={press}
      {...(load.href !== undefined ? { href: load.href } : {})}
    >
      {showMoreLabel}
    </Button>
  ) : (
    <Button
      ref={buttonRef as Ref<HTMLButtonElement>}
      variant="plain"
      size="sm"
      className="-ms-(--ouro-button-px)"
      data-ouro-show-more-toggle=""
      data-ouro-control="show-more"
      data-ouro-part="toggle"
      aria-expanded={expanded}
      aria-controls={listId}
      onClick={press}
    >
      {expanded ? showLessLabel : showMoreLabel}
    </Button>
  );
  return (
    <div ref={ref} data-ouro="show-more" className={cn(showMoreRootClass, className)}>
      {/* Safari drops list semantics from an unstyled list unless the role is explicit. */}
      <List
        ref={listRef}
        id={listId}
        role="list"
        tabIndex={emptyEnd ? -1 : undefined}
        aria-label={emptyEnd ? noMoreLabel : undefined}
        className={cn(listClass, emptyEnd && "outline-none")}
      >
        {visible.map((item, index) => (
          <li
            key={rowKey(item, index)}
            tabIndex={-1}
            className={cn(
              itemClass,
              freshFrom !== null && index >= freshFrom && "transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) starting:opacity-0",
            )}
          >
            {item}
          </li>
        ))}
      </List>
      {button}
      {/* Stays mounted after the last page, so the last count is still read. */}
      {load && (
        <p role="status" data-ouro-show-more-status="" className="sr-only">
          {status}
        </p>
      )}
    </div>
  );
}
