"use client";

import { useRef, useState, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { currentHref } from "@/registry/ouro/lib/ouro/current-path";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { SheetFrame } from "@/registry/ouro/components/ouro/sheet/sheet";

/** One link in a Navbar. */
export interface NavbarItem {
  /** The link's text: "Recipes". */
  label: string;
  /** Where it goes. Internal paths go through `OuroProvider`'s `linkComponent` (your router's link). */
  href: string;
  /**
   * Marks this link as the current page (`aria-current="page"`), when the Navbar's
   * `currentPath` cannot tell: a link whose page lives at another path.
   */
  current?: boolean | undefined;
}

/** Props for {@link Navbar}. */
export interface NavbarProps {
  /** Names the navigation for screen readers ("Main"). It is not shown. */
  label: string;
  /** The links, in order. Keep to the app's few main sections; a phone lists them in a sheet. */
  items: readonly NavbarItem[];
  /**
   * The path of the page being shown, from your router (`useLocation().pathname`, or
   * `usePathname()` in Next.js). The link to that path, or else the longest link above it
   * (`/recipes` for `/recipes/12`), gets `aria-current="page"` and the current look.
   */
  currentPath?: string | undefined;
  /** Your logo or product name, at the start of the bar. Link it to the home page. */
  brand?: ReactNode;
  /** Controls at the end of the bar, at every width: a search button, an account `Menu`. */
  actions?: ReactNode;
  /**
   * The name of the button that opens the links below 640px, and the title of the sheet
   * it opens. @default "Menu"
   */
  menuLabel?: string | undefined;
  /** The label of that sheet's close button. @default "Close" */
  closeLabel?: string | undefined;
  /** Layout only: margins, position (`sticky top-0`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Ouro UI uses `items`: `<Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]} />`. */
  links?: { 'Use <Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]} />': never };
  /** Not a prop. Ouro UI uses `brand`: `<Navbar brand={<Logo />}>`. */
  logo?: { "Use <Navbar brand={<Logo />}>": never };
  /** Not a prop. Ouro UI uses `currentPath`: `<Navbar currentPath={pathname}>`. */
  pathname?: { "Use <Navbar currentPath={pathname}>": never };
  /** Not rendered. The bar is `items`, `brand` and `actions`. */
  children?: { "Use items={[{ label, href }]}, brand={...} and actions={...}": never };
}

// Class strings are literal so the app's Tailwind finds them when it compiles.

const bar =
  "box-border flex min-h-14 items-center gap-2 border-0 border-b border-solid border-border bg-background text-foreground " +
  "ps-[max(1rem,env(safe-area-inset-left,0px))] pe-[max(1rem,env(safe-area-inset-right,0px))]";

// A link: 44px with 16px text on a coarse pointer at every width, 36px with 14px text with a
// fine one. The current page takes the accent surface.
const link =
  "m-0 box-border items-center rounded-md px-3 font-medium text-muted-foreground no-underline select-none touch-manipulation " +
  "text-base pointer-fine:text-sm leading-5 [-webkit-tap-highlight-color:transparent] " +
  "pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";
const barLink = "press inline-flex h-11 min-w-11 pointer-fine:h-9 justify-center whitespace-nowrap motion-safe:active:scale-(--ouro-press-scale)";
// In the sheet a link is a full-width row, which highlights while pressed instead of scaling.
const sheetLink = "flex min-h-11 pointer-fine:min-h-9 py-2 transition-colors duration-(--ouro-duration-fast) ease-[ease] active:bg-accent active:text-accent-foreground";

const list = "m-0 flex list-none p-0";
const example = '<Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]}';

/**
 * The bar across the top of an app: your brand, the main links and a few controls, with
 * the current page marked `aria-current="page"`. Below 640px the links collapse behind a
 * menu button into a `Sheet` that slides in from the side; the brand and `actions` stay in
 * the bar. Links render through `OuroProvider`'s `linkComponent`, so your router navigates.
 *
 * Use `Sidebar` instead for more than a handful of destinations, or sections of them. Use
 * `NavigationMenu` when a link opens a panel of further links, and `Tabs` for views of one
 * page. `StackedLayout` puts a Navbar above the page.
 *
 * @group Navigation
 * @see https://ourostack.github.io/ouro-ui/docs/navbar
 *
 * @example
 * <Navbar
 *   label="Main"
 *   brand={<Link href="/">Spoonjoy</Link>}
 *   items={[
 *     { label: "Recipes", href: "/recipes" },
 *     { label: "Cookbooks", href: "/cookbooks" },
 *   ]}
 *   currentPath={pathname}
 *   actions={<Button href="/recipes/new">New recipe</Button>}
 * />
 */
export function Navbar(props: NavbarProps): JSX.Element {
  const {
    label,
    items,
    currentPath,
    brand,
    actions,
    menuLabel = "Menu",
    closeLabel = "Close",
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    links,
    logo,
    pathname,
    children,
  } = props;
  useAppearanceClassNameCheck(
    "Navbar",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; Navbar sets its own look`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Navbar",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is required; it names the navigation for screen readers", '<Navbar label="Main">'],
          links !== undefined && ["links is not a prop", `${example} />`],
          logo !== undefined && ["logo is not a prop", "<Navbar brand={<Logo />}>"],
          pathname !== undefined && ["pathname is not a prop", "<Navbar currentPath={pathname}>"],
          children !== undefined && ["children are not rendered", `${example} brand={…} actions={…} />`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The sheet exists only below the sm breakpoint; a screen that grows past it closes it.
  const wide = useMediaQuery("(min-width: 640px)", true);
  const [open, setOpen] = useState(false);
  // Focus goes back to the menu button when the sheet closes, in every browser.
  const menuButton = useRef<HTMLButtonElement>(null);
  if (wide && open) setOpen(false);

  // An item's own `current` wins; otherwise the path decides.
  const marked = items.some((item) => item.current)
    ? undefined
    : currentHref(
        items.map((item) => item.href),
        currentPath,
      );
  const renderLinks = (linkClass: string, onNavigate?: () => void) =>
    items.map((item, index) => (
      <li key={index}>
        <RouterLink
          href={item.href}
          aria-current={item.current || item.href === marked ? "page" : undefined}
          onClick={onNavigate}
          className={cn(link, linkClass)}
        >
          {item.label}
        </RouterLink>
      </li>
    ));

  return (
    <header ref={ref} data-ouro="navbar" className={cn(bar, className)}>
      <Button
        ref={menuButton}
        data-ouro-navbar-menu=""
        variant="plain"
        tone="secondary"
        aria-label={menuLabel}
        // Only where the button shows: below the sm breakpoint it opens the sheet.
        aria-haspopup={wide ? undefined : "dialog"}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="-ms-2 w-11 px-0 sm:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-5">
          <path d="M3 5.5h14M3 10h14M3 14.5h14" />
        </svg>
      </Button>
      {brand !== undefined && <div className="flex min-w-0 shrink-0 items-center">{brand}</div>}
      <nav aria-label={label} className="min-w-0 max-sm:hidden">
        <ul className={cn(list, "items-center gap-1")}>{renderLinks(barLink)}</ul>
      </nav>
      {actions !== undefined && <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div>}
      <SheetFrame title={menuLabel} closeLabel={closeLabel} side="left" open={open} onOpenChange={setOpen} finalFocus={menuButton}>
        <nav aria-label={label}>
          <ul className={cn(list, "flex-col gap-1")}>{renderLinks(sheetLink, () => setOpen(false))}</ul>
        </nav>
      </SheetFrame>
    </header>
  );
}
