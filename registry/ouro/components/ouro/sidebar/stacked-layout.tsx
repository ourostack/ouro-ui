"use client";

import { useId, useRef, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link StackedLayout}. */
export interface StackedLayoutProps {
  /** The app's `Navbar`. It stays at the top while the page scrolls. */
  navbar: ReactNode;
  /**
   * The page. It renders inside the page's `<main>`, in a centered column up to 72rem wide.
   *
   * @claim registry/ouro/components/ouro/sidebar/stacked-layout.test.tsx verify:testExists(registry/ouro/components/ouro/sidebar/stacked-layout.test.tsx::StackedLayout > centers the page in a column of readable width, and runs edge to edge with bleed)
   * @claim registry/ouro/components/ouro/sidebar/stacked-layout.tsx verify:fileLine(registry/ouro/components/ouro/sidebar/stacked-layout.tsx, /mx-auto\smax-w-6xl/)
   * @claim https://tailwindcss.com/docs/max-width verify:urlOk(https://tailwindcss.com/docs/max-width)
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
}

// Class strings are literal so the app's Tailwind finds them when it compiles.

// The first tab stop: hidden until it has keyboard focus, then shown at the top corner.
const skip =
  "sr-only focus-visible:top-2 focus-visible:start-2 focus-visible:z-20 focus-visible:m-0 focus-visible:size-auto " +
  "focus-visible:overflow-visible focus-visible:[clip-path:none] focus-visible:px-4 focus-visible:py-2.5 focus-visible:whitespace-nowrap " +
  "focus-visible:rounded-lg focus-visible:bg-background focus-visible:text-foreground focus-visible:text-base focus-visible:leading-5 focus-visible:font-medium " +
  "focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * The shell of an app with a `Navbar`: the bar across the top, in view while the page
 * scrolls, and the page below it in a centered column. It renders the page's `<main>`,
 * starts with a "Skip to content" link, and keeps its footer at the bottom of a short page.
 *
 * The phone menu opens once JavaScript has loaded (after hydration);
 * the links are in the server HTML from 640px up.
 *
 * Use `SidebarLayout` instead when the navigation is a `Sidebar`. Use `AuthLayout` for the
 * sign-in pages.
 *
 * @group Navigation
 * @see https://ourostack.github.io/ouro-ui/docs/stacked-layout
 *
 * @example
 * <StackedLayout navbar={<Navbar label="Main" items={items} currentPath={pathname} />}>
 *   <Outlet />
 * </StackedLayout>
 * @claim registry/ouro/components/ouro/sidebar/sidebar.test.tsx verify:testExists(registry/ouro/components/ouro/sidebar/sidebar.test.tsx::Sidebar > puts the nav and its links in the server HTML)
 * @claim registry/ouro/components/ouro/sidebar/sidebar.test.tsx verify:testExists(registry/ouro/components/ouro/sidebar/sidebar.test.tsx::Sidebar > becomes a menu button that opens a drawer below 640px)
 */
export function StackedLayout(props: StackedLayoutProps): JSX.Element {
  const {
    navbar,
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
  } = props;
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
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const mainId = useId();
  const Page = as === "div" ? "div" : "main";
  // The link's address moves focus by itself in most browsers; the handler makes it certain.
  const main = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-ouro="stacked-layout" className={cn("relative flex min-h-dvh flex-col bg-background text-foreground", className)}>
      <a href={`#${mainId}`} data-ouro-control="stacked-layout" data-ouro-part="skip-link" onClick={() => main.current!.focus()} className={skip}>
        {skipLabel}
      </a>
      <div data-ouro-stacked-layout-navbar="" className="sticky top-0 z-10">
        {navbar}
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
