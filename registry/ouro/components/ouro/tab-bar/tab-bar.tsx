"use client";

import type { JSX, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { currentHref } from "@/registry/ouro/lib/ouro/current-path";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import {
  accessoryClass,
  barClass,
  breakpoints,
  iconClass,
  labelClass,
  listClass,
  rootClass,
  tabClass,
} from "@/registry/ouro/components/ouro/tab-bar/tab-bar-styles";

/** One tab in a TabBar: a page of the app, with its icon and a short label. */
export interface TabBarItem {
  /** The tab's text, one short word under the icon: "Recipes". Screen readers hear it as the link's name. */
  label: string;
  /** Where the tab goes. Internal paths go through `OuroProvider`'s `linkComponent` (your router's link). */
  href: string;
  /** The tab's icon, an `<svg>` (a lucide-react icon, for example). It is hidden from screen readers; the label names the tab. */
  icon: ReactNode;
  /**
   * Other paths whose pages belong to this tab, so it stays current there: a Home tab that
   * also owns `/account`. Each matches its own path and the pages under it.
   */
  paths?: readonly string[] | undefined;
  /** Marks this tab as the current page (`aria-current="page"`), when the paths cannot tell. */
  current?: boolean | undefined;
}

/** Props for {@link TabBar}. */
export interface TabBarProps {
  /** Names the navigation for screen readers ("Main"). It is not shown. */
  label: string;
  /** The tabs, in order: two to five of the app's top-level pages. */
  items: readonly TabBarItem[];
  /**
   * An item that sits apart, in a circle of its own at the end of the bar, as iOS sets
   * Search apart from the tabs. Only its icon shows; its `label` names it for screen readers.
   */
  accessory?: TabBarItem | undefined;
  /**
   * The path of the page being shown, from your router (`useLocation().pathname`, or
   * `usePathname()` in Next.js). The tab whose `href` or `paths` match it, or else the longest
   * one above it (`/recipes` for `/recipes/12`), gets `aria-current="page"` and the current look.
   */
  currentPath?: string | undefined;
  /**
   * The breakpoint from which the bar hides, because the app's `Navbar` or `Sidebar` takes over
   * there. `never` keeps it at every width.
   * @default "sm"
   */
  hideFrom?: "sm" | "md" | "lg" | "xl" | "never" | (string & { 'Use "sm", "md", "lg", "xl" or "never"': never }) | undefined;
  /** Layout only: rarely needed, since the bar places itself. Appearance classes warn in development. */
  className?: string | undefined;
  /** Reaches the `<nav>`. */
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Ouro UI uses `items`: `<TabBar label="Main" items={[{ label, href, icon }]} />`. */
  tabs?: { 'Use <TabBar label="Main" items={[{ label: "Recipes", href: "/recipes", icon: <BookOpen /> }]} />': never };
  /** Not a prop. Ouro UI uses `items`: `<TabBar label="Main" items={[{ label, href, icon }]} />`. */
  links?: { 'Use <TabBar label="Main" items={[{ label: "Recipes", href: "/recipes", icon: <BookOpen /> }]} />': never };
  /** Not a prop. Ouro UI uses `currentPath`: `<TabBar currentPath={pathname}>`. */
  pathname?: { "Use <TabBar currentPath={pathname}>": never };
  /** Not a prop. The current tab follows `currentPath`, or an item's `current`: `<TabBar currentPath={pathname}>`. */
  value?: { "Use <TabBar currentPath={pathname}>, or current: true on the item": never };
  /** Not rendered. The bar is `items` and `accessory`. */
  children?: { "Use items={[{ label, href, icon }]} and accessory={{ label, href, icon }}": never };
}

const example = '<TabBar label="Main" items={[{ label: "Recipes", href: "/recipes", icon: <BookOpen /> }]} />';

/** Every path a tab owns, with the tab's index, for `currentHref`. */
function ownedPaths(items: readonly TabBarItem[]): Array<{ path: string; index: number }> {
  return items.flatMap((item, index) => [item.href, ...(item.paths ?? [])].map((path) => ({ path, index })));
}

/**
 * The bar of tabs at the bottom of a phone screen: two to five of the app's top-level
 * pages, each an icon over a short label, with the current page marked `aria-current="page"`
 * and an accent wash. An `accessory`, such as Search, sits apart in a circle of its own, as
 * in iOS. The bar is navigation only and the same on every page: put page actions (create,
 * share, edit) on the page itself, never in the bar, so a tab never changes meaning.
 *
 * The bar is fixed to the bottom of the screen, clear of the home indicator, and the
 * component keeps its room at the end of the page, so render it last in the layout and the
 * content scrolls clear of it. It hides from `hideFrom` (640px by default), where the app's
 * `Navbar` or `Sidebar` takes over, and when printing. To hide it on a page that fills the
 * screen (a full-screen editor, a single decision), don't render it there.
 *
 * Tabs render through `OuroProvider`'s `linkComponent`, so your router navigates. Each tab
 * is 64px tall, well over the 44px a finger needs.
 *
 * Use `Navbar` instead for the links across the top of a wider screen, `Sidebar` for many
 * destinations, and `Tabs` for views of one page.
 *
 * @group Navigation
 * @see https://ourostack.github.io/ouro-ui/docs/tab-bar
 *
 * @example
 * <TabBar
 *   label="Main"
 *   currentPath={pathname}
 *   items={[
 *     { label: "Home", href: "/", icon: <House />, paths: ["/account"] },
 *     { label: "Recipes", href: "/recipes", icon: <BookOpen /> },
 *     { label: "Shopping", href: "/shopping-list", icon: <ShoppingBag /> },
 *   ]}
 *   accessory={{ label: "Search", href: "/search", icon: <Search /> }}
 * />
 */
export function TabBar(props: TabBarProps): JSX.Element {
  const {
    label,
    items,
    accessory,
    currentPath,
    hideFrom: hideFromProp = "sm",
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    tabs,
    links,
    pathname,
    value,
    children,
  } = props;
  // A breakpoint that is not one of Ouro UI's (a type error) warns and renders the default.
  const hideFrom = Object.hasOwn(breakpoints, hideFromProp) ? (hideFromProp as keyof typeof breakpoints) : "sm";
  useAppearanceClassNameCheck(
    "TabBar",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; TabBar sets its own look from the theme`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "TabBar",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is required; it names the navigation for screen readers", '<TabBar label="Main">'],
          tabs !== undefined && ["tabs is not a prop", example],
          links !== undefined && ["links is not a prop", example],
          pathname !== undefined && ["pathname is not a prop", "<TabBar currentPath={pathname}>"],
          value !== undefined && ["value is not a prop; the current tab follows the page's path", "<TabBar currentPath={pathname}>"],
          children !== undefined && ["children are not rendered", example],
          hideFrom !== hideFromProp && [`hideFrom="${String(hideFromProp)}" is not a breakpoint; use "sm", "md", "lg", "xl" or "never"`, '<TabBar hideFrom="lg">'],
          items.length > 5 && [
            `${items.length} tabs do not fit a phone's width`,
            "keep two to five items, and link the rest from a page of their own",
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // An item's own `current` wins; otherwise the path decides, across the tabs and the accessory.
  const all = accessory === undefined ? items : [...items, accessory];
  const flagged = all.findIndex((item) => item.current);
  let current = flagged;
  if (flagged === -1) {
    const owned = ownedPaths(all);
    const match = currentHref(
      owned.map((entry) => entry.path),
      currentPath,
    );
    current = match === undefined ? -1 : owned.find((entry) => entry.path === match)!.index;
  }
  const isCurrent = (index: number) => (index === current ? ("page" as const) : undefined);

  return (
    <div data-ouro="tab-bar" className={cn(rootClass, breakpoints[hideFrom], className)}>
      <nav ref={ref} aria-label={label} className={barClass}>
        <ul className={listClass}>
          {items.map((item, index) => (
            <li key={index} className="flex min-w-0 flex-1">
              <RouterLink href={item.href} aria-current={isCurrent(index)} data-ouro-control="tab-bar" data-ouro-part="tab" className={tabClass}>
                <span aria-hidden="true" className={iconClass}>
                  {item.icon}
                </span>
                <span className={labelClass}>{item.label}</span>
              </RouterLink>
            </li>
          ))}
        </ul>
        {accessory !== undefined && (
          <RouterLink
            href={accessory.href}
            aria-current={isCurrent(items.length)}
            data-ouro-control="tab-bar"
            data-ouro-part="accessory"
            className={accessoryClass}
          >
            <span aria-hidden="true" className={cn(iconClass, "size-6")}>
              {accessory.icon}
            </span>
            <span className="sr-only">{accessory.label}</span>
          </RouterLink>
        )}
      </nav>
    </div>
  );
}
