"use client";

import { useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { currentHref } from "@/registry/ouro/lib/ouro/current-path";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { Menu, MenuItem, MenuSeparator } from "@/registry/ouro/components/ouro/menu/menu";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import {
  countClass,
  footerClass,
  headerClass,
  iconClass,
  indicatorClass,
  itemClass,
  labelClass,
  listClass,
  menuCountClass,
  railClass,
  separatorClass,
  shownCount,
  spokenCountClass,
} from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail-styles";

/** What a NavigationRail item has: its label, its icon and a count. */
interface NavigationRailItemBase {
  /** An item, the default. A `{ type: "separator" }` entry draws a rule between groups instead. */
  type?: "item" | undefined;
  /** The item's text under the icon, a short word or phrase: "Calendar". Screen readers hear it as the item's name. */
  label: string;
  /**
   * The item's icon, an `<svg>` (a lucide-react or Fluent UI System icon, for example). It is
   * hidden from screen readers; the label names the item.
   */
  icon: ReactNode;
  /** The icon while the item is current, such as the filled form of `icon`. `icon` when not given. */
  currentIcon?: ReactNode;
  /**
   * New things on the item's page: a badge on the icon, capped at "99+", that screen readers hear
   * after the label with `countLabel`. The item's name is its label and then the count, "Activity, 5
   * new", so it starts with the words the item shows. Nothing shows for 0.
   * @claim "The item's name is its label and then the count" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail counts > names an item with a count by its words, the label first and the count after, so the name starts with what it shows)
   * @claim "Nothing shows for 0" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail counts > shows a count on the icon, capped at 99+, and speaks the whole number after the label)
   */
  count?: number | undefined;
  /** Marks this item as the current page or view (`aria-current="page"`), when `currentPath` cannot tell. */
  current?: boolean | undefined;

  /** Not a prop. A number goes in `count`: `{ label: "Activity", count: 3 }`. */
  badge?: { "Use count={3}": never };
  /** Not a prop. Ouro UI uses `currentIcon`: `{ icon: <ChatRegular />, currentIcon: <ChatFilled /> }`. */
  activeIcon?: { "Use currentIcon": never };
  /** Not a prop. Ouro UI uses `currentIcon`: `{ icon: <ChatRegular />, currentIcon: <ChatFilled /> }`. */
  selectedIcon?: { "Use currentIcon": never };
}

/** A link in a NavigationRail: one of the app's top-level pages. */
export interface NavigationRailLinkItem extends NavigationRailItemBase {
  /** Where it goes. Internal paths go through `OuroProvider`'s `linkComponent` (your router's link). */
  href: string;
  /**
   * Other paths whose pages belong to this item, so it stays current there: a Chat item that
   * also owns `/people`. Each matches its own path and the pages under it.
   * @claim "Each matches its own path" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:fileLine(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx, /\["\/people",\s"Chat"\]/)
   */
  paths?: readonly string[] | undefined;
  /** Called when the link is followed, before your router navigates. */
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
}

/**
 * A button in a NavigationRail, for an app that switches views without its router: give the
 * shown view's item `current`.
 */
export interface NavigationRailButtonItem extends NavigationRailItemBase {
  /** What the item does: show its view. */
  onClick: (event: MouseEvent<HTMLElement>) => void;
  /** Not with `onClick` alone. Give a link `href`; a button has none. */
  href?: never;
  /** Not on a button. A button is current by its `current` flag. */
  paths?: never;
}

/** One item of a NavigationRail: a link (`href`) or a button (`onClick`). */
export type NavigationRailItem = NavigationRailLinkItem | NavigationRailButtonItem;

/** A short rule between groups of items, as Menu's `{ type: "separator" }` is. */
export interface NavigationRailSeparator {
  type: "separator";
}

/** One entry in a NavigationRail's `items`: an item, or a separator between groups. */
export type NavigationRailEntry = NavigationRailItem | NavigationRailSeparator;

/** Props for {@link NavigationRail}. */
export interface NavigationRailProps {
  /** Names the navigation for screen readers ("Main"). It is not shown. */
  label: string;
  /**
   * The items, in order, with `{ type: "separator" }` between groups. Those that do not fit
   * the rail's height move, from the last, into a More menu at its end; the current item stays
   * on the rail.
   */
  items: readonly NavigationRailEntry[];
  /**
   * The path of the page being shown, from your router (`useLocation().pathname`, or
   * `usePathname()` in Next.js). The item whose `href` or `paths` match it, or else the longest
   * one above it (`/chat` for `/chat/12`), gets `aria-current="page"` and the current look.
   */
  currentPath?: string | undefined;
  /** Above the items: your app's mark, or a workspace `Menu`. */
  header?: ReactNode;
  /** Below the items, out of their way: a settings `Button` or an account `Menu`. */
  footer?: ReactNode;
  /**
   * Shows the icons alone, in a 56px rail; each item's label names it for screen readers and
   * shows in a Tooltip on hover and keyboard focus.
   * @default false
   * @claim "Shows the icons alone" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > is 68px wide with labels and 56px with hideLabels, with items at least 44px tall)
   * @claim "Shows the icons alone" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail labels > with hideLabels, keeps each label as the item's name and shows it in a tooltip toward the page)
   */
  hideLabels?: boolean | undefined;
  /**
   * What screen readers hear after an item's label when it has a `count`, with `{count}` for the
   * number: "Activity, 5 new".
   * @default "{count} new"
   */
  countLabel?: string | undefined;
  /** The label of the button that holds the items that do not fit. @default "More" */
  moreLabel?: string | undefined;
  /** Layout only: placement and width, or `max-sm:hidden` where a `TabBar` takes over. Appearance classes warn in development. */
  className?: string | undefined;
  /** Reaches the `<nav>`. */
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Ouro UI uses `items`: `<NavigationRail label="Main" items={[{ label, href, icon }]} />`. */
  links?: { 'Use <NavigationRail label="Main" items={[{ label: "Chat", href: "/chat", icon: <ChatIcon /> }]} />': never };
  /** Not a prop. Ouro UI uses `currentPath`: `<NavigationRail currentPath={pathname}>`. */
  pathname?: { "Use <NavigationRail currentPath={pathname}>": never };
  /** Not a prop. The current item follows `currentPath`, or an item's `current`. */
  value?: { "Use <NavigationRail currentPath={pathname}>, or current: true on the item": never };
  /** Not a prop. Mark the shown view's item `current: true`, and switch views in each item's `onClick`. */
  selectedId?: { "Use current: true on the item, and onClick to switch views": never };
  /** Not a prop. Give the items their own `onClick`. */
  onSelect?: { "Use onClick on each item": never };
  /** Not a prop. `hideLabels` shows the icons alone. */
  collapsed?: { "Use hideLabels": never };
  /** Not rendered. The rail is `items`, `header` and `footer`. */
  children?: { "Use items={[{ label, href, icon }]}, header={...} and footer={...}": never };
}

const example = '<NavigationRail label="Main" items={[{ label: "Chat", href: "/chat", icon: <ChatIcon /> }]} />';

/** The paths a link item owns, with the item's place in `items`, for `currentHref`. */
function ownedPaths(entries: readonly NavigationRailEntry[]): Array<{ path: string; index: number }> {
  return entries.flatMap((entry, index) => {
    const { href, paths } = entry as Partial<NavigationRailLinkItem>;
    // Stryker disable next-line ArrayDeclaration: a path that is no page's marks nothing, as no path does.
    return href === undefined ? [] : [href, ...(paths ?? [])].map((path) => ({ path, index }));
  });
}

/** A count worth showing: a positive number, whole. */
function countOf(item: NavigationRailItem): number {
  return Math.max(0, Math.floor(item.count ?? 0));
}

/**
 * Which separators show: the first of a run between two shown items. A separator with no shown
 * item before it, or none after it, hides.
 * @claim "the first of a run" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail separators > hides a separator with no item before it or after it, and all but the first of a run)
 * @claim "A separator with no" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail separators > hides a separator with no item before it or after it, and all but the first of a run)
 */
function shownSeparators(entries: readonly NavigationRailEntry[], shown: (index: number) => boolean): Set<number> {
  const separators = new Set<number>();
  let afterItem = false;
  let pending = -1;
  entries.forEach((entry, index) => {
    if (entry.type === "separator") {
      if (afterItem) pending = index;
      afterItem = false;
    } else if (shown(index)) {
      if (pending !== -1) separators.add(pending);
      pending = -1;
      afterItem = true;
    }
  });
  return separators;
}

/** What the client measured: the places of the items moved under More and of the labels cut short, and the labels set a size smaller. */
interface Fit {
  hidden: readonly number[];
  truncated: readonly number[];
  squeezed: readonly string[];
}

const same = (a: readonly (number | string)[], b: readonly (number | string)[]) => a.join() === b.join();

/** Whether a word of the label is wider than the label, so it runs past its edge or breaks within itself. */
function wordTooWide(text: HTMLElement): boolean {
  const words = text.firstChild!;
  const range = document.createRange();
  return [...words.textContent!.matchAll(/\S+/g)].some((word) => {
    range.setStart(words, word.index);
    range.setEnd(words, word.index + word[0].length);
    const lines = range.getClientRects();
    // Stryker disable next-line EqualityOperator,ArithmeticOperator: a word within half a pixel of the label's width fits either way.
    return lines.length > 1 || lines[0]!.width > text.clientWidth + 0.5;
  });
}

const rovingKeys = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/** What the rail looks like: an icon over its label, or the icon alone. */
type Look = "labels" | "icons";

/** An item moved under More, with its place in `items`. */
interface MovedItem {
  entry: NavigationRailItem;
  index: number;
}

/** The development messages for props an agent guesses and for a missing or wordless label. */
function guessedProps(props: NavigationRailProps): DevWarning[] {
  const { label, items, countLabel = "{count} new", links, pathname, value, selectedId, onSelect, collapsed, children } = props;
  const guessed = (name: "badge" | "activeIcon" | "selectedIcon") => items.find((entry) => entry.type !== "separator" && entry[name] !== undefined) as NavigationRailItem | undefined;
  const badge = guessed("badge");
  const icon = guessed("activeIcon") ?? guessed("selectedIcon");
  return [
    !label && ["label is required; it names the navigation for screen readers", '<NavigationRail label="Main">'],
    links !== undefined && ["links is not a prop", example],
    pathname !== undefined && ["pathname is not a prop", "<NavigationRail currentPath={pathname}>"],
    value !== undefined && ["value is not a prop; the current item follows the page's path", "<NavigationRail currentPath={pathname}>, or current: true on the item"],
    selectedId !== undefined && ["selectedId is not a prop", '{ label: "Chat", onClick: () => setView("chat"), current: view === "chat" }'],
    onSelect !== undefined && ["onSelect is not a prop; each item has its own onClick", '{ label: "Chat", onClick: () => setView("chat") }'],
    collapsed !== undefined && ["collapsed is not a prop", "<NavigationRail hideLabels>"],
    children !== undefined && ["children are not rendered", example],
    !countLabel.includes("{count}") && [`countLabel "${countLabel}" has no {count}, so screen readers never hear the number`, 'countLabel="{count} new"'],
    badge !== undefined && [`badge is not an item prop ("${badge.label}")`, `{ label: "${badge.label}", count: 3 }`],
    icon !== undefined && [`activeIcon and selectedIcon are not item props ("${icon.label}")`, `{ label: "${icon.label}", icon: <ChatIcon />, currentIcon: <ChatFilledIcon /> }`],
  ];
}

// The current item's place, or -1: an item's own `current` wins; otherwise the path decides.
function currentIndex(items: readonly NavigationRailEntry[], currentPath: string | undefined): number {
  const flagged = items.findIndex((entry) => (entry as NavigationRailItem).current === true);
  if (flagged !== -1) return flagged;
  const owned = ownedPaths(items);
  const match = currentHref(
    owned.map((entry) => entry.path),
    currentPath,
  );
  return match === undefined ? -1 : owned.find((entry) => entry.path === match)!.index;
}

// What fits the laid-out list: the items that move under More, from the last, with the current
// one kept, and the labels cut short. `heights` holds each entry's last measured height, by key,
// so a hidden item still has one.
function measureFit(element: HTMLUListElement, items: readonly NavigationRailEntry[], current: number, heights: Map<string, number>): Fit {
  for (const child of element.children) {
    const height = (child as HTMLElement).offsetHeight;
    if (height > 0) heights.set((child as HTMLElement).dataset.ouroNavigationRailEntry!, height);
  }
  const gap = parseFloat(getComputedStyle(element).rowGap);
  const room = element.clientHeight;
  const indexes = items.flatMap((entry, index) => (entry.type === "separator" ? [] : [index]));
  /** The list's height with `shown` items on it, and More when `more`. */
  const total = (shown: ReadonlySet<number>, more: boolean) => {
    const separators = shownSeparators(items, (index) => shown.has(index));
    const keys = [...[...shown].map(String), ...[...separators].map(() => "separator"), ...(more ? ["more"] : [])];
    return keys.reduce((sum, key) => sum + (heights.get(key) ?? 0), 0) + gap * (keys.length - 1);
  };
  let kept = new Set(indexes);
  // Stryker disable next-line EqualityOperator: heights are whole pixels and gaps CSS lengths, so a total is never exactly half a pixel over.
  if (total(kept, false) > room + 0.5) {
    kept = new Set(current === -1 ? [] : [current]);
    for (const index of indexes) {
      if (index === current) continue;
      kept.add(index);
      // Stryker disable next-line EqualityOperator: as above, a total is never exactly half a pixel over.
      if (total(kept, true) > room + 0.5) {
        kept.delete(index);
        break;
      }
    }
  }
  // Labels hidden under More, or by hideLabels, measure nothing and are never set smaller.
  const labels = [...element.querySelectorAll<HTMLElement>("[data-ouro-navigation-rail-label]")].filter((text) => text.clientWidth > 1);
  const isSqueezed = (text: HTMLElement) => text.hasAttribute("data-ouro-navigation-rail-squeezed");
  return {
    hidden: indexes.filter((index) => !kept.has(index)),
    // A label cut short: by its two lines, or by a word too wide even a size smaller, which breaks within it. (A word too
    // wide at the label's own size sets it smaller first.)
    truncated: [...element.querySelectorAll<HTMLElement>("[data-ouro-navigation-rail-label]")]
      .filter((text) => text.scrollHeight > text.clientHeight || (isSqueezed(text) && wordTooWide(text)))
      .map((text) => Number(text.dataset.ouroNavigationRailLabel)),
    // A label with a word too wide is set a size smaller, and stays so while its words stay the same: a size smaller, it would measure as fitting.
    squeezed: labels.filter((text) => isSqueezed(text) || wordTooWide(text)).map((text) => text.firstChild!.textContent!),
  };
}

// The fit of the rail's list, measured before paint on each render and when the list or an entry
// changes size. Server HTML shows every item; the client measures what fits before it paints.
function useFit(list: { readonly current: HTMLUListElement | null }, items: readonly NavigationRailEntry[], current: number): Fit {
  // Stryker disable next-line ArrayDeclaration: a place that is no item's moves and cuts nothing, as an empty list does.
  const [fit, setFit] = useState<Fit>({ hidden: [], truncated: [], squeezed: [] });
  // One not yet measured counts nothing until it shows, and the measure that follows corrects the fit before paint.
  const heights = useRef(new Map<string, number>());
  const measure = useRef<() => void>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const observed = useRef(new WeakSet<Element>());
  // Before paint, so a client render never shows items that do not fit. The observer calls the
  // latest measure, which reads this render's props.
  useLayoutEffect(() => {
    measure.current = () => {
      const element = list.current!;
      // Not laid out (hidden by the app): nothing to measure.
      if (element.getClientRects().length === 0) return;
      const next = measureFit(element, items, current, heights.current);
      setFit((last) => {
        const moved = !same(last.hidden, next.hidden) || !same(last.truncated, next.truncated);
        // Stryker disable next-line LogicalOperator,ConditionalExpression,BooleanLiteral: a name left in `squeezed` sets no label smaller until a label of that name, as wide, comes back.
        return moved || !same(last.squeezed, next.squeezed) ? next : last;
      });
    };
    observer.current ??= new ResizeObserver(() => measure.current!());
    // Each element once: observing one again makes the observer report it again (WebKit does) and measure for nothing.
    for (const element of [list.current!, ...list.current!.children]) {
      // Stryker disable next-line ConditionalExpression: in Chromium, observing an element again does nothing; elsewhere the measure it starts finds the same fit.
      if (observed.current.has(element)) continue;
      // Stryker disable next-line CallExpression: as above, an element observed again changes no fit.
      observed.current.add(element);
      observer.current.observe(element);
    }
    measure.current!();
  });
  useLayoutEffect(
    () => () => {
      observer.current!.disconnect();
      observed.current = new WeakSet();
    },
    // Stryker disable next-line ArrayDeclaration: any list that never changes runs it once, as this one does.
    [],
  );
  return fit;
}

/** The rail's keys: Up and Down move along its shown stops, wrapping, and Home and End go to the ends. */
function moveAlongRail(event: KeyboardEvent<HTMLUListElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !rovingKeys.has(event.key)) return;
  const stops = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-ouro-navigation-rail-stop]")].filter((element) => element.getClientRects().length > 0);
  const at = stops.indexOf(event.target as HTMLElement);
  if (at === -1) return;
  event.preventDefault();
  const to = event.key === "ArrowDown" ? at + 1 : event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : stops.length - 1;
  stops[(to + stops.length) % stops.length]!.focus();
}


/** `element` in a Tooltip of `text` toward the page when `show`. */
function withTip(show: boolean, text: string, element: ReactElement): ReactElement {
  return show ? (
    <Tooltip content={text} side="right">
      {element}
    </Tooltip>
  ) : (
    element
  );
}

/**
 * An item's inside: the bar, the icon with its count, and the label. The item is named by its
 * words: the label, then the count as `countLabel` speaks it, "Activity, 5 new", so its name starts
 * with the words it shows. The badge itself is hidden.
 */
function itemInside(text: string, icon: ReactNode, count: number, countLabel: string, index: number | undefined, hideLabels: boolean, squeezed: boolean) {
  return (
    <>
      <span aria-hidden="true" data-ouro-part="indicator" className={indicatorClass} />
      <span aria-hidden="true" className={iconClass}>
        {icon}
        {count > 0 && (
          <span data-ouro-navigation-rail-count="" className={countClass}>
            {shownCount(count)}
          </span>
        )}
      </span>
      <span
        data-ouro-navigation-rail-label={index}
        data-ouro-navigation-rail-squeezed={squeezed || undefined}
        className={hideLabels ? "sr-only" : labelClass[squeezed ? "squeezed" : "fits"]}
      >
        {text}
        {count > 0 && <span className={spokenCountClass}>, {countLabel.replace("{count}", String(count))}</span>}
      </span>
    </>
  );
}

/** One entry of the rail: a separator, or an item's link or button, in a Tooltip when its label does not show whole. */
function RailEntry({
  entry,
  index,
  current,
  stop,
  look,
  hideLabels,
  countLabel,
  hidden,
  truncated,
  squeezed,
  separatorShown,
  onFocus,
}: {
  entry: NavigationRailEntry;
  index: number;
  current: number;
  stop: string | undefined;
  look: Look;
  hideLabels: boolean;
  countLabel: string;
  hidden: boolean;
  truncated: boolean;
  squeezed: ReadonlySet<string>;
  separatorShown: boolean;
  onFocus: (key: string) => void;
}) {
  if (entry.type === "separator") {
    return (
      <li aria-hidden="true" data-ouro-navigation-rail-entry="separator" className={cn("block shrink-0 py-1", !separatorShown && "hidden")}>
        <span className={separatorClass} />
      </li>
    );
  }
  const isCurrent = index === current;
  const count = countOf(entry);
  const key = String(index);
  const shared = {
    "aria-current": isCurrent ? ("page" as const) : undefined,
    // "true", the only form shadcn's data-selected variant matches; Tailwind's matches any.
    "data-selected": isCurrent ? "true" : undefined,
    "data-ouro-navigation-rail-stop": key,
    tabIndex: key === stop ? 0 : -1,
    onFocus: () => onFocus(key),
    className: itemClass[look],
  };
  const content = itemInside(entry.label, isCurrent && entry.currentIcon !== undefined ? entry.currentIcon : entry.icon, count, countLabel, index, hideLabels, squeezed.has(entry.label));
  return (
    <li data-ouro-navigation-rail-entry={key} className={cn("flex shrink-0", hidden && "hidden")}>
      {withTip(
        hideLabels || truncated,
        entry.label,
        entry.href !== undefined ? (
          <RouterLink data-ouro-control="navigation-rail" data-ouro-part="link" href={entry.href} onClick={entry.onClick} {...shared}>
            {content}
          </RouterLink>
        ) : (
          <button data-ouro-control="navigation-rail" data-ouro-part="button" type="button" onClick={entry.onClick} {...shared}>
            {content}
          </button>
        ),
      )}
    </li>
  );
}

/** The More button at the rail's end and its Menu of the items that do not fit. */
function MoreEntry({
  items,
  moved,
  look,
  hideLabels,
  moreLabel,
  countLabel,
  squeezed,
  isStop,
  onFocus,
}: {
  items: readonly NavigationRailEntry[];
  moved: readonly MovedItem[];
  look: Look;
  hideLabels: boolean;
  moreLabel: string;
  countLabel: string;
  squeezed: boolean;
  isStop: boolean;
  onFocus: () => void;
}) {
  const movedCount = moved.reduce((sum, { entry }) => sum + countOf(entry), 0);
  return (
    <li data-ouro-navigation-rail-entry="more" className="flex shrink-0">
      <Menu
        side="right"
        trigger={withTip(
          hideLabels,
          moreLabel,
          <button
            type="button"
            data-ouro-control="navigation-rail"
            data-ouro-part="more"
            data-ouro-navigation-rail-stop="more"
            tabIndex={isStop ? 0 : -1}
            onFocus={onFocus}
            // The trigger's own keys are off, since the arrows (which would open the menu) move along
            // the rail; Enter and Space press the button, which opens it.
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => (event as typeof event & { preventBaseUIHandler: () => void }).preventBaseUIHandler()}
            className={itemClass[look]}
          >
            {itemInside(
              moreLabel,
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="19" cy="12" r="1.75" />
              </svg>,
              movedCount,
              countLabel,
              undefined,
              hideLabels,
              squeezed,
            )}
          </button>,
        )}
      >
        {moved.map(({ entry, index }, at) => {
          const count = countOf(entry);
          const previous = moved[at - 1];
          const separated = previous !== undefined && items.slice(previous.index, index).some((between) => between.type === "separator");
          return [
            // Stryker disable next-line StringLiteral: the separator's only sibling is the item, keyed by its number, so any other key is unique.
            separated && <MenuSeparator key={`separator-${index}`} />,
            <MenuItem key={index} href={entry.href} onClick={entry.onClick}>
              {entry.label}
              {count > 0 && (
                <>
                  <span aria-hidden="true" className={menuCountClass}>
                    {shownCount(count)}
                  </span>
                  <span className="sr-only">, {countLabel.replace("{count}", String(count))}</span>
                </>
              )}
            </MenuItem>,
          ];
        })}
      </Menu>
    </li>
  );
}

/**
 * The vertical bar of the app's top-level pages on the start edge of a wide screen, as in a
 * chat or mail app or an editor's activity bar: each item an icon over a short label, the
 * current one with its `currentIcon`, a bar on the rail's edge and `aria-current="page"`. An
 * item can carry a `count`, capped at "99+" on the badge and spoken in full, be a button for
 * an app that switches views without its router (`onClick` without `href`), and sit after a
 * `{ type: "separator" }`. A `header` (your app's mark) sits above the items and a `footer`
 * (settings, the account) below them.
 *
 * The rail is one tab stop: Up and Down move between its items, wrapping, and Home and End go
 * to the ends, while Tab moves on to the footer and the page. Items that do not fit the rail's
 * height move, from the last, into a More menu at its end; the current item stays on the rail.
 * Labels wrap to two lines between words; one still too long ends in an ellipsis and shows whole
 * in a Tooltip, as every label does with `hideLabels`. The current item's bar grows in from its
 * middle; with reduced motion it only fades.
 *
 * Links render through `OuroProvider`'s `linkComponent`, so your router navigates. The rail
 * fills its container's height and draws no surface of its own, so it sits on your app's
 * frame.
 *
 * Use `TabBar` instead for the bar at the bottom of a phone screen (hide the rail there with
 * `className="max-sm:hidden"`), `Sidebar` for a column of labelled links in sections, and
 * `Navbar` for a few links across the top.
 *
 * @group Navigation
 * @see https://ui.ouro.bot/docs/navigation-rail
 * @claim "The vertical bar of" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > is a labelled navigation with a list of links, each named by its label, with the icons hidden)
 * @claim "The vertical bar of" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > shows the current item's bar on the rail's start edge, its label in the foreground colour and its icon in the primary colour)
 * @claim "The vertical bar of" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > draws the current item's currentIcon, and its icon when it has none)
 * @claim "Labels wrap to two lines" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail labels > wraps a long label to two lines between words, and gives a label that still does not fit an ellipsis and a tooltip)
 * @claim "Labels wrap to two lines" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail labels > with hideLabels, keeps each label as the item's name and shows it in a tooltip toward the page)
 * @claim "The rail fills its" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > fills its container's height and draws no surface of its own)
 *
 * @example
 * <NavigationRail
 *   label="Main"
 *   currentPath={pathname}
 *   header={<AppMark />}
 *   items={[
 *     { label: "Activity", href: "/activity", icon: <BellIcon />, currentIcon: <BellFilledIcon />, count: 3 },
 *     { label: "Chat", href: "/chat", icon: <ChatIcon />, currentIcon: <ChatFilledIcon /> },
 *     { label: "Calendar", href: "/calendar", icon: <CalendarIcon /> },
 *     { type: "separator" },
 *     { label: "Files", href: "/files", icon: <FolderIcon /> },
 *   ]}
 *   footer={<SettingsButton />}
 * />
 */
export function NavigationRail(props: NavigationRailProps): JSX.Element {
  const { label, items, currentPath, header, footer, hideLabels = false, countLabel = "{count} new", moreLabel = "More", className, ref } = props;
  useAppearanceClassNameCheck(
    "NavigationRail",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; NavigationRail sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings("NavigationRail", process.env.NODE_ENV !== "production" ? () => guessedProps(props) : /* istanbul ignore next @preserve -- production only */ undefined);

  const current = currentIndex(items, currentPath);
  const nav = useRef<HTMLElement>(null);
  const navRef = useMergedRef(ref, nav);
  const list = useRef<HTMLUListElement>(null);
  const fit = useFit(list, items, current);
  const hidden = new Set(fit.hidden);
  const truncated = new Set(fit.truncated);
  const squeezed = new Set(fit.squeezed);

  // Roving tab stop: the item focused last, else the current one, else the first.
  const [focused, setFocused] = useState<string | null>(null);
  // The items measure moved under More. A place left over from earlier items is put right before paint.
  const moved = items.flatMap((entry, index) => (hidden.has(index) ? [{ entry: entry as NavigationRailItem, index }] : []));
  // Stryker disable next-line ArrayDeclaration: only a key a stop has ever focused is looked up here, so an extra key is never found.
  const stops = [...items.flatMap((entry, index) => (entry.type === "separator" || hidden.has(index) ? [] : [String(index)])), ...(moved.length > 0 ? ["more"] : [])];
  const stop = stops.find((key) => key === focused) ?? (current === -1 ? stops[0] : String(current));

  const look: Look = hideLabels ? "icons" : "labels";
  const shownSeparatorSet = shownSeparators(items, (index) => !hidden.has(index));

  return (
    <nav ref={navRef} data-ouro="navigation-rail" aria-label={label} className={cn(railClass[look], className)}>
      {header !== undefined && <div className={headerClass}>{header}</div>}
      <ul ref={list} className={listClass} onKeyDown={moveAlongRail}>
        {items.map((entry, index) => (
          <RailEntry
            key={index}
            entry={entry}
            index={index}
            current={current}
            stop={stop}
            look={look}
            hideLabels={hideLabels}
            countLabel={countLabel}
            hidden={hidden.has(index)}
            truncated={truncated.has(index)}
            squeezed={squeezed}
            separatorShown={shownSeparatorSet.has(index)}
            onFocus={setFocused}
          />
        ))}
        {moved.length > 0 && (
          <MoreEntry items={items} moved={moved} look={look} hideLabels={hideLabels} moreLabel={moreLabel} countLabel={countLabel} squeezed={squeezed.has(moreLabel)} isStop={stop === "more"} onFocus={() => setFocused("more")} />
        )}
      </ul>
      {footer !== undefined && <div className={footerClass}>{footer}</div>}
    </nav>
  );
}
