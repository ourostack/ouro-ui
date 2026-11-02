"use client";

import { useEffect, useId, useRef, useState, type JSX, type ReactNode, type Ref, type RefObject } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link StackedLayout}. */
export interface StackedLayoutProps {
  /** The app's `Navbar`. It stays at the top while the page scrolls, unless `navbarBehavior` says otherwise. */
  navbar: ReactNode;
  /**
   * A second bar right under the navbar, for the page's own tools: a search field, a view
   * switcher, a week stepper. Usually a `Toolbar`. It runs the full width with the navbar's
   * padding and its own line below, fills the bar's width (wrap several things in one element
   * to put them in a row), and moves with the navbar: it sticks, scrolls away or hides with it.
   * It is a landmark named `toolbarLabel`, so a screen-reader user can jump to it.
   */
  toolbar?: ReactNode;
  /** Names the toolbar's landmark for screen readers. It is not shown. @default "Page tools" */
  toolbarLabel?: string | undefined;
  /**
   * What the navbar, and the toolbar under it, do while the page scrolls. `"sticky"` keeps them
   * at the top. `"static"` lets them scroll away with the page, for a document. `"auto-hide"`,
   * for a reading surface with art that runs under the bars, slides them up out of view as the
   * reader scrolls down and brings them back on any scroll up, at the top of the page, or when
   * keyboard focus moves into them; they never hide while keyboard focus or an open menu is in
   * them. Over the page they are translucent, with the page blurred behind them. With reduced
   * motion they show and hide at once, without sliding.
   * @default "sticky"
   */
  navbarBehavior?: "sticky" | "static" | "auto-hide" | (string & { 'default is "sticky"; use "sticky", "static" or "auto-hide"': never }) | undefined;
  /**
   * The page. It renders inside the page's `<main>`, in a centered column up to 72rem wide.
   *
   * @claim "It renders inside the page's `<main>`" registry/ouro/components/ouro/sidebar/stacked-layout.test.tsx verify:testExists(registry/ouro/components/ouro/sidebar/stacked-layout.test.tsx::StackedLayout > centers the page in a column of readable width, and runs edge to edge with bleed)
   * @claim "It renders inside the page's `<main>`" registry/ouro/components/ouro/sidebar/stacked-layout.tsx verify:fileLine(registry/ouro/components/ouro/sidebar/stacked-layout.tsx, /mx-auto\smax-w-6xl/)
   * @claim "It renders inside the page's `<main>`" https://tailwindcss.com/docs/max-width verify:urlOk(https://tailwindcss.com/docs/max-width)
   */
  children: ReactNode;
  /**
   * The element around the page. Pass `"div"` when the layout renders inside a page that
   * already has a `<main>`, since a document has one.
   * @default "main"
   */
  as?: "main" | "div" | undefined;
  /** A line at the bottom of the page: links, a copyright. It sits at the bottom of the screen on a short page. */
  footer?: ReactNode;
  /** Removes the column and its padding, for content that runs edge to edge (a map, a cover photo). */
  bleed?: boolean | undefined;
  /** The text of the link that skips the navbar, shown when it has keyboard focus. @default "Skip to content" */
  skipLabel?: string | undefined;
  /** Layout only: height and margins (`min-h-96`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. A `Navbar` opens its own drawer on a phone; for a sidebar use `SidebarLayout`. */
  sidebar?: { "Use <StackedLayout navbar={<Navbar ... />}>, or <SidebarLayout sidebar={...}>": never };
  /** Not a prop. Ouro UI uses `navbar`: `<StackedLayout navbar={<Navbar … />}>`. */
  header?: { "Use <StackedLayout navbar={<Navbar ... />}>": never };
  /** Not a prop. Use `navbarBehavior="auto-hide"`. */
  hideOnScroll?: { 'Use <StackedLayout navbarBehavior="auto-hide">': never };
  /** Not a prop. The navbar sticks by default; `navbarBehavior="static"` lets it scroll away. */
  sticky?: { 'Use <StackedLayout navbarBehavior="static"> to let the navbar scroll away': never };
}

// Class strings are literal so the app's Tailwind finds them when it compiles.

// The first tab stop: hidden until it has keyboard focus, then shown at the top corner.
const skip =
  "sr-only focus-visible:top-2 focus-visible:start-2 focus-visible:z-20 focus-visible:m-0 focus-visible:size-auto " +
  "focus-visible:overflow-visible focus-visible:[clip-path:none] focus-visible:px-4 focus-visible:py-2.5 focus-visible:whitespace-nowrap " +
  "focus-visible:rounded-lg focus-visible:bg-background focus-visible:text-foreground focus-visible:text-base focus-visible:leading-5 focus-visible:font-medium " +
  "focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

// The navbar and the toolbar: sticky, or with auto-hide, translucent over the page and solid
// where the reader asks for less transparency or more contrast. Static needs no class.
const stickyClass = "sticky top-0 z-10";
const autoHideClass =
  "sticky top-0 z-10 bg-background/80 backdrop-blur-md [&>[data-ouro=navbar]]:bg-transparent " +
  "transition-[translate] duration-(--ouro-duration-base) ease-(--ouro-ease-out) data-closed:-translate-y-full motion-reduce:transition-none " +
  "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none " +
  "contrast-more:bg-background contrast-more:backdrop-blur-none";

// The toolbar's bar: full width, with the Navbar's padding and safe-area insets and its own line below.
const toolbarClass =
  "box-border flex min-h-12 flex-col justify-center border-0 border-b border-solid border-border py-1.5 " +
  "ps-[max(1rem,env(safe-area-inset-left,0px))] pe-[max(1rem,env(safe-area-inset-right,0px))]";

/**
 * With `auto-hide`: whether the bars are out of view. A scroll down past them hides them,
 * unless keyboard focus or an open menu is in them; any scroll up, or the top of the page, shows them.
 */
function useAutoHide(enabled: boolean, bars: RefObject<HTMLDivElement | null>): [hidden: boolean, show: () => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const region = bars.current!;
    let last = scrollY;
    const onScroll = () => {
      const [y, previous] = [scrollY, last];
      last = y;
      if (y < previous || y <= region.offsetHeight) setHidden(false);
      else if (y > previous && region.querySelector(":focus-visible, [aria-expanded=true]") === null) setHidden(true);
    };
    addEventListener("scroll", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      // So `hidden` is only ever true while auto-hide is on.
      setHidden(false);
    };
  }, [enabled, bars]);
  return [hidden, () => setHidden(false)];
}

/**
 * The shell of an app with a `Navbar`: the bar across the top, in view while the page
 * scrolls, an optional `toolbar` under it for the page's own tools, and the page below them
 * in a centered column. It renders the page's `<main>`, starts with a "Skip to content" link,
 * and keeps its footer at the bottom of a short page. `navbarBehavior` lets the bars scroll
 * away with a document, or slide out of the way of a reading surface.
 *
 * The phone menu opens once JavaScript has loaded (after hydration);
 * the links are in the server HTML from 640px up.
 *
 * Use `SidebarLayout` instead when the navigation is a `Sidebar`. Use `AuthLayout` for the
 * sign-in pages.
 *
 * @group Navigation
 * @see https://ui.ouro.bot/docs/stacked-layout
 *
 * @example
 * <StackedLayout
 *   navbar={<Navbar label="Main" items={items} currentPath={pathname} />}
 *   toolbar={<Toolbar label="Week" items={weekTools} />}
 * >
 *   <Outlet />
 * </StackedLayout>
 * @claim "The phone menu opens once JavaScript" registry/ouro/components/ouro/sidebar/sidebar.test.tsx verify:testExists(registry/ouro/components/ouro/sidebar/sidebar.test.tsx::Sidebar > puts the nav and its links in the server HTML)
 * @claim "The phone menu opens once JavaScript" registry/ouro/components/ouro/sidebar/sidebar.test.tsx verify:testExists(registry/ouro/components/ouro/sidebar/sidebar.test.tsx::Sidebar > becomes a menu button that opens a drawer below 640px)
 */
export function StackedLayout(props: StackedLayoutProps): JSX.Element {
  const {
    navbar,
    toolbar,
    toolbarLabel = "Page tools",
    navbarBehavior = "sticky",
    children,
    as,
    footer,
    bleed,
    skipLabel = "Skip to content",
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    sidebar,
    header,
    hideOnScroll,
    sticky,
  } = props;
  const behavior = navbarBehavior === "static" || navbarBehavior === "auto-hide" ? navbarBehavior : "sticky";
  useAppearanceClassNameCheck(
    "StackedLayout",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; StackedLayout sets its own look`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "StackedLayout",
    process.env.NODE_ENV !== "production"
      ? () => [
          navbar === undefined && ["navbar is required", '<StackedLayout navbar={<Navbar label="Main" items={[…]} />}>'],
          sidebar !== undefined && [
            "sidebar is not a prop; Navbar opens its own drawer on a phone",
            "<StackedLayout navbar={<Navbar … />}>, or <SidebarLayout sidebar={<Sidebar … />}> for a sidebar",
          ],
          header !== undefined && ["header is not a prop", "<StackedLayout navbar={<Navbar … />}>"],
          behavior !== navbarBehavior && [`navbarBehavior="${navbarBehavior}" is not a behavior`, '<StackedLayout navbarBehavior="sticky">'],
          hideOnScroll !== undefined && ["hideOnScroll is not a prop", '<StackedLayout navbarBehavior="auto-hide">'],
          sticky !== undefined && ["sticky is not a prop; the navbar sticks by default", '<StackedLayout navbarBehavior="static"> to let it scroll away'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const mainId = useId();
  const Page = as === "div" ? "div" : "main";
  // The link's address moves focus by itself in most browsers; the handler makes it certain.
  const main = useRef<HTMLDivElement>(null);
  const bars = useRef<HTMLDivElement>(null);
  const autoHide = behavior === "auto-hide";
  const [hidden, show] = useAutoHide(autoHide, bars);
  return (
    <div ref={ref} data-ouro="stacked-layout" className={cn("relative flex min-h-dvh flex-col bg-background text-foreground", className)}>
      <a href={`#${mainId}`} data-ouro-control="stacked-layout" data-ouro-part="skip-link" onClick={() => main.current!.focus()} className={skip}>
        {skipLabel}
      </a>
      <div
        ref={bars}
        data-ouro-stacked-layout-navbar=""
        data-ouro-part="bars"
        data-behavior={behavior}
        data-open={autoHide && !hidden ? "" : undefined}
        data-closed={hidden ? "" : undefined}
        onFocus={show}
        className={autoHide ? autoHideClass : behavior === "sticky" ? stickyClass : undefined}
      >
        {navbar}
        {toolbar !== undefined && (
          <section aria-label={toolbarLabel} data-ouro-stacked-layout-toolbar="" className={cn(toolbarClass, !autoHide && "bg-background")}>
            {toolbar}
          </section>
        )}
      </div>
      <Page ref={main} id={mainId} tabIndex={-1} className={cn("box-border w-full min-w-0 flex-1 outline-none", !bleed && "mx-auto max-w-6xl p-4 sm:p-6")}>
        {children}
      </Page>
      {footer !== undefined && (
        <footer className="box-border border-0 border-t border-solid border-border px-4 py-6 text-base pointer-fine:text-sm text-muted-foreground sm:px-6">
          {footer}
        </footer>
      )}
    </div>
  );
}
