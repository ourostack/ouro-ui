"use client";

import { NavigationMenu as BaseNavigationMenu } from "@base-ui/react/navigation-menu";
import type { JSX, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { currentHref } from "@/registry/ouro/lib/ouro/current-path";
import { floatingPortalClass } from "@/registry/ouro/lib/ouro/floating";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";

/** One link inside a NavigationMenu panel. */
export interface NavigationMenuLink {
  /** The link's text: "Browse". */
  label: string;
  /** Where it goes. Internal paths go through `OuroProvider`'s `linkComponent` (your router's link). */
  href: string;
  /** A line under the label that says what is there: "Everything you have saved." */
  description?: string | undefined;
  /** Marks this link as the current page, when the menu's `currentPath` cannot tell. */
  current?: boolean | undefined;
}

/** A NavigationMenu item that is a link to a page. */
export interface NavigationMenuLinkItem {
  /** The link's text: "Pricing". */
  label: string;
  /** Where it goes. Internal paths go through `OuroProvider`'s `linkComponent` (your router's link). */
  href: string;
  /** Marks this link as the current page, when the menu's `currentPath` cannot tell. */
  current?: boolean | undefined;
  /** Not with `href`. An item is a link (`href`) or a panel of links (`links`). */
  links?: never;
}

/** A NavigationMenu item that opens a panel of links. */
export interface NavigationMenuPanelItem {
  /** The button's text: "Recipes". */
  label: string;
  /** The links in the panel, each with an optional `description`. */
  links: readonly NavigationMenuLink[];
  /** Not with `links`. To link the section's own page, make it the panel's first link. */
  href?: never;
}

/** One item of a NavigationMenu: a link (`href`), or a button that opens a panel (`links`). */
export type NavigationMenuItem = NavigationMenuLinkItem | NavigationMenuPanelItem;

/** Props for {@link NavigationMenu}. */
export interface NavigationMenuProps {
  /** Names the navigation for screen readers ("Main"). It is not shown. */
  label: string;
  /** The row's items, in order: links, and buttons that open a panel of links. */
  items: readonly NavigationMenuItem[];
  /**
   * The path of the page being shown, from your router (`useLocation().pathname`, or
   * `usePathname()` in Next.js). The link to that path, or else the longest link above it,
   * gets `aria-current="page"`, in the row or in a panel.
   */
  currentPath?: string | undefined;
  /** Layout only: margins, grid placement (`ms-4`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Ouro UI uses `items`; a panel's links go in an item's `links`. */
  links?: { 'Use items={[{ label: "Recipes", links: [...] }, { label: "Pricing", href: "/pricing" }]}': never };
  /** Not a prop. Ouro UI uses `currentPath`: `<NavigationMenu currentPath={pathname}>`. */
  pathname?: { "Use <NavigationMenu currentPath={pathname}>": never };
  /** Not a prop. The menu is a row; for a column of links use `Sidebar`. */
  orientation?: { "Use <Sidebar> for a column of links": never };
  /** Not rendered. The menu is data: `items={[{ label: "Recipes", links: [...] }, { label: "Pricing", href: "/pricing" }]}`. */
  children?: { 'Use items={[{ label: "Recipes", links: [...] }, { label: "Pricing", href: "/pricing" }]}': never };
}

// Class strings are literal so the app's Tailwind finds them when it compiles.

// A row item, link or button: 44px with 16px text on a coarse pointer at every width, 36px
// with 14px text with a fine one.
const rowItem =
  "press relative m-0 box-border inline-flex h-11 min-w-11 pointer-fine:h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap " +
  "rounded-md border-0 bg-transparent px-3 font-[inherit] text-base pointer-fine:text-sm leading-5 font-medium text-muted-foreground no-underline " +
  "select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground " +
  "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground data-current:text-foreground " +
  "motion-safe:active:scale-(--ouro-press-scale) outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

// The chevron turns when its panel is open; with reduced motion it turns without a transition.
const chevron = "inline-flex motion-safe:transition-[rotate] motion-safe:duration-(--ouro-duration-base) ease-out data-popup-open:rotate-180";

// The popup follows the open panel: it moves and resizes between panels with the theme's
// base duration, and opens with a scale and fade. Reduced motion keeps only the fade.
const positioner =
  "box-border h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) " +
  "motion-safe:transition-[top,left,right,bottom] motion-safe:duration-(--ouro-duration-base) motion-safe:ease-out data-instant:transition-none";
const popup =
  "relative box-border h-(--popup-height) w-(--popup-width) origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground outline-none " +
  "[box-shadow:0_0_0_1px_color-mix(in_oklab,var(--border)_60%,transparent),0_8px_24px_rgb(0_0_0/0.14)] " +
  "transition-opacity duration-(--ouro-duration-base) ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-(--ouro-duration-fast) " +
  "motion-safe:transition-[opacity,scale,width,height] motion-safe:data-starting-style:scale-96 motion-safe:data-ending-style:scale-96";
// A panel: nearly the screen's width on a phone, as wide as its links from 640px.
const content =
  "box-border h-full w-[calc(100vw-2rem)] p-2 sm:w-max sm:min-w-64 sm:max-w-md " +
  "transition-opacity duration-(--ouro-duration-base) ease-out data-starting-style:opacity-0 data-ending-style:opacity-0";
// A link in a panel: a full-width row, which highlights while pressed instead of scaling.
const panelLink =
  "m-0 box-border flex min-h-11 pointer-fine:min-h-9 flex-col justify-center gap-0.5 rounded-md px-3 py-2 text-base pointer-fine:text-sm leading-5 " +
  "text-popover-foreground no-underline select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-out hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground " +
  "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

const example =
  '<NavigationMenu label="Main" items={[{ label: "Recipes", links: [{ label: "Browse", href: "/recipes" }] }, { label: "Pricing", href: "/pricing" }]} />';

/**
 * A row of links where some open a panel of further links, each with a line of
 * description: the navigation of a site with more pages than fit in a bar. Panels open on
 * hover or click, move between each other without closing, and close on Escape, on an
 * outside press and when a link is chosen. The current page is marked `aria-current="page"`.
 * Built on Base UI's Navigation Menu.
 *
 * Use `Navbar` instead when every item is a plain link; it also collapses into a drawer on
 * a phone, which this row does not. Use `Menu` for actions rather than pages, and `Sidebar`
 * for a column of links.
 *
 * @group Navigation
 * @see https://ourostack.github.io/ouro-ui/docs/navigation-menu
 *
 * @example
 * <NavigationMenu
 *   label="Main"
 *   items={[
 *     {
 *       label: "Recipes",
 *       links: [
 *         { label: "Browse", href: "/recipes", description: "Everything you have saved." },
 *         { label: "Import", href: "/recipes/import", description: "Bring one in from a link." },
 *       ],
 *     },
 *     { label: "Pricing", href: "/pricing" },
 *   ]}
 *   currentPath={pathname}
 * />
 */
export function NavigationMenu(props: NavigationMenuProps): JSX.Element {
  const {
    label,
    items,
    currentPath,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    links,
    pathname,
    orientation,
    children,
  } = props;
  useAppearanceClassNameCheck(
    "NavigationMenu",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; NavigationMenu sets its own look`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "NavigationMenu",
    process.env.NODE_ENV !== "production"
      ? () => {
          // The types rule this shape out; an untyped caller can still pass it.
          const both = (items as ReadonlyArray<{ label: string; href?: string; links?: unknown }>).find(
            (item) => item.links !== undefined && item.href !== undefined,
          );
          return [
            !label && ["label is required; it names the navigation for screen readers", '<NavigationMenu label="Main">'],
            both && [
              `"${both.label}" has both href and links, and renders as a panel`,
              `{ label: "${both.label}", links: [{ label: "All ${both.label.toLowerCase()}", href: "${String(both.href)}" }, …] }`,
            ],
            links !== undefined && ["links is not a prop", example],
            pathname !== undefined && ["pathname is not a prop", "<NavigationMenu currentPath={pathname}>"],
            orientation !== undefined && ["orientation is not a prop; the menu is a row", "<Sidebar> for a column of links"],
            children !== undefined && ["children are not rendered; the menu is data", example],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // A link's own `current` wins; otherwise the path decides, across the row and the panels.
  const all = items.flatMap((item): ReadonlyArray<{ href: string; current?: boolean | undefined }> => item.links ?? [item]);
  const marked = all.some((link) => link.current)
    ? undefined
    : currentHref(
        all.map((link) => link.href),
        currentPath,
      );
  const isCurrent = (link: { href: string; current?: boolean | undefined }) => Boolean(link.current) || link.href === marked;

  return (
    <BaseNavigationMenu.Root ref={ref} data-ouro="navigation-menu" aria-label={label} className={cn("min-w-0", className)}>
      <BaseNavigationMenu.List className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        {items.map((item, index) =>
          item.links !== undefined ? (
            <BaseNavigationMenu.Item key={index} value={index}>
              <BaseNavigationMenu.Trigger data-current={item.links.some(isCurrent) ? "" : undefined} className={rowItem}>
                {item.label}
                <BaseNavigationMenu.Icon className={chevron}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                    <path d="m4 6 4 4 4-4" />
                  </svg>
                </BaseNavigationMenu.Icon>
              </BaseNavigationMenu.Trigger>
              <BaseNavigationMenu.Content className={content}>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {item.links.map((link, position) => (
                    <li key={position}>
                      <BaseNavigationMenu.Link render={<RouterLink href={link.href} />} active={isCurrent(link)} closeOnClick className={panelLink}>
                        <span className="font-medium">{link.label}</span>
                        {link.description !== undefined && <span className="text-sm leading-5 text-muted-foreground">{link.description}</span>}
                      </BaseNavigationMenu.Link>
                    </li>
                  ))}
                </ul>
              </BaseNavigationMenu.Content>
            </BaseNavigationMenu.Item>
          ) : (
            <BaseNavigationMenu.Item key={index} value={index}>
              <BaseNavigationMenu.Link render={<RouterLink href={item.href} />} active={isCurrent(item)} className={rowItem}>
                {item.label}
              </BaseNavigationMenu.Link>
            </BaseNavigationMenu.Item>
          ),
        )}
      </BaseNavigationMenu.List>
      <BaseNavigationMenu.Portal data-ouro="navigation-menu-portal" className={floatingPortalClass}>
        <BaseNavigationMenu.Positioner sideOffset={8} collisionPadding={16} className={positioner}>
          <BaseNavigationMenu.Popup data-ouro="navigation-menu-popup" className={popup}>
            <BaseNavigationMenu.Viewport className="relative h-full w-full overflow-hidden rounded-[inherit]" />
          </BaseNavigationMenu.Popup>
        </BaseNavigationMenu.Positioner>
      </BaseNavigationMenu.Portal>
    </BaseNavigationMenu.Root>
  );
}
