"use client";

import { useId, useRef, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";

/** Props for {@link SidebarLayout}. */
export interface SidebarLayoutProps {
  /** The app's `Sidebar`. It sits beside the page from 640px up, and is a menu button in the top bar below. */
  sidebar: ReactNode;
  /**
   * A bar above the page: a search field, the page's actions. From 640px up it runs across
   * the top of the page, beside the sidebar; below, it shares the top bar with the menu button.
   */
  header?: ReactNode;
  /** The page. It renders inside the page's `<main>`. */
  children: ReactNode;
  /**
   * The element around the page. Pass `"div"` when the layout renders inside a page that
   * already has a `<main>`, since a document has one.
   * @default "main"
   */
  as?: "main" | "div" | undefined;
  /** Removes the padding around the page, for content that runs edge to edge (a map, a cover photo). */
  bleed?: boolean | undefined;
  /** The text of the link that skips the sidebar, shown when it has keyboard focus. @default "Skip to content" */
  skipLabel?: string | undefined;
  /** Layout only: height and margins (`min-h-96`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The bar above the page is `header`: `<SidebarLayout sidebar={…} header={…}>`. */
  navbar?: { "Use <SidebarLayout sidebar={...} header={...}>": never };
}

// Class strings are literal so the app's Tailwind finds them when it compiles.

// The first tab stop: hidden until it has keyboard focus, then shown at the top corner.
const skip =
  "sr-only focus-visible:top-2 focus-visible:start-2 focus-visible:z-20 focus-visible:m-0 focus-visible:size-auto " +
  "focus-visible:overflow-visible focus-visible:[clip-path:none] focus-visible:px-4 focus-visible:py-2.5 focus-visible:whitespace-nowrap " +
  "focus-visible:rounded-lg focus-visible:bg-background focus-visible:text-foreground focus-visible:text-base focus-visible:leading-5 focus-visible:font-medium " +
  "focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

// Two columns and two rows at every width. From 640px the sidebar spans both rows and
// stays in view; below, it is the start of a sticky top bar and the page spans both columns.
const sidebarCell =
  "z-10 col-start-1 row-start-1 box-border bg-background " +
  "max-sm:sticky max-sm:top-0 max-sm:flex max-sm:min-h-14 max-sm:items-center max-sm:border-0 max-sm:border-b max-sm:border-solid max-sm:border-border " +
  "max-sm:ps-[max(0.5rem,env(safe-area-inset-left,0px))] sm:sticky sm:top-0 sm:row-span-2 sm:h-dvh";
const headerCell =
  "sticky top-0 z-10 col-start-2 row-start-1 box-border flex min-w-0 items-center gap-2 border-0 border-b border-solid border-border bg-background " +
  "ps-2 pe-[max(1rem,env(safe-area-inset-right,0px))] sm:ps-6";

/**
 * The shell of an app with a `Sidebar`: the sidebar beside the page from 640px up, in view
 * while the page scrolls, and a sticky top bar with the sidebar's menu button below 640px.
 * It renders the page's `<main>` and starts with a "Skip to content" link.
 *
 * Use `StackedLayout` instead when the navigation is a `Navbar` across the top. Use
 * `AuthLayout` for the sign-in pages.
 *
 * @group Navigation
 * @see https://ourostack.github.io/ouro-ui/docs/sidebar-layout
 *
 * @example
 * <SidebarLayout
 *   sidebar={<Sidebar label="Main" sections={sections} currentPath={pathname} />}
 *   header={<TextField label="Search" hideLabel type="search" />}
 * >
 *   <Outlet />
 * </SidebarLayout>
 */
export function SidebarLayout(props: SidebarLayoutProps): JSX.Element {
  const {
    sidebar,
    header,
    children,
    as,
    bleed,
    skipLabel = "Skip to content",
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    navbar,
  } = props;
  useAppearanceClassNameCheck(
    "SidebarLayout",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; SidebarLayout sets its own look`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "SidebarLayout",
    process.env.NODE_ENV !== "production"
      ? () => [
          sidebar === undefined && [
            "sidebar is required",
            '<SidebarLayout sidebar={<Sidebar label="Main" sections={[…]} />}>; for a bar across the top use <StackedLayout navbar={…}>',
          ],
          navbar !== undefined && ["navbar is not a prop; the bar above the page is header", "<SidebarLayout sidebar={<Sidebar … />} header={…}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const mainId = useId();
  const Page = as === "div" ? "div" : "main";
  // The link's address moves focus by itself in most browsers; the handler makes it certain.
  const main = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      data-ouro="sidebar-layout"
      className={cn("relative grid min-h-dvh grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground", className)}
    >
      <a href={`#${mainId}`} onClick={() => main.current!.focus()} className={skip}>
        {skipLabel}
      </a>
      <div data-ouro-sidebar-layout-sidebar="" className={sidebarCell}>
        {sidebar}
      </div>
      {/* Without a header the cell still draws the rest of the phone's top bar. */}
      <div data-ouro-sidebar-layout-header="" className={cn(headerCell, header !== undefined ? "min-h-14" : "sm:hidden")}>
        {header}
      </div>
      <Page
        ref={main}
        id={mainId}
        tabIndex={-1}
        className={cn("col-span-2 row-start-2 box-border min-w-0 outline-none sm:col-span-1 sm:col-start-2", !bleed && "p-4 sm:p-6")}
      >
        {children}
      </Page>
    </div>
  );
}
